import type { AppSettings, DailyRecommendation, DeepReadContent, Paper } from "@/lib/types";
import { FOCUS_LABEL } from "@/lib/constants";
import {
  getAcceptedPapersWithoutRecommendation,
  getPaperById,
  updatePaper,
} from "../db/repo/papers";
import { getLatestAnalysis } from "../db/repo/analysis";
import {
  getRecommendationForDate,
  insertRecommendation,
} from "../db/repo/knowledge";
import { addDays, diffDays } from "../utils/time";
import { truncate } from "../utils/normalize";
import { paperPassesJournalMetric } from "../metrics/journals";

export interface RecommendationResult {
  created: boolean;
  recommendation: DailyRecommendation | null;
  reason: string;
}

function scoreWithRecency(paper: Paper, today: string): number {
  const score = paper.qualityScore ?? 0;
  if (!paper.publicationDate) return score;
  const age = Math.abs(diffDays(today, paper.publicationDate));
  if (age <= 7) return score + 4;
  if (age <= 30) return score + 2;
  if (age <= 90) return score + 0.5;
  return score;
}

function deterministicCopy(paper: Paper): { reason: string; innovation: string; value: string } {
  const focus = paper.focusAreas.map((area) => FOCUS_LABEL[area]).join("、") || "碱基编辑";
  const peer =
    paper.peerReviewStatus === "peer_reviewed"
      ? "同行评审论文"
      : paper.peerReviewStatus === "preprint"
        ? "预印本（尚未同行评审）"
        : "同行评审状态未确认";
  const reason = `${paper.journal ?? "期刊信息未确认"}，${paper.publicationDate ?? "发表时间未确认"}；综合质量评分 ${paper.qualityScore ?? "未评分"}/100，${peer}，${paper.fullTextAccessStatus === "oa_fulltext" ? "可获取开放全文" : "仅摘要可访问"}。今日在已核验候选中综合价值最高。`;
  const innovation = truncate(paper.abstract?.split(/(?<=[.!?])\s/)[0] ?? "尚未生成精讲，暂无经核验的创新点摘要。", 260);
  const value = `属于${focus}方向。显式标注：该推荐理由基于元数据与摘要，未经过 AI 精读。`;
  return { reason, innovation, value };
}

export function createDailyRecommendation(params: {
  date: string;
  settings: AppSettings;
}): RecommendationResult {
  const existing = getRecommendationForDate(params.date);
  if (existing) {
    const existingPaper = getPaperById(existing.paperId);
    if (existingPaper && paperPassesJournalMetric(existingPaper, params.settings)) {
      return { created: false, recommendation: existing, reason: "今日推荐已存在" };
    }
  }

  const candidates = getAcceptedPapersWithoutRecommendation()
    .filter((paper) => (paper.qualityScore ?? 0) >= params.settings.minAcceptScore)
    .filter((paper) => paperPassesJournalMetric(paper, params.settings));
  const peerReviewed = candidates.filter((paper) => paper.peerReviewStatus !== "preprint");

  const latestPool = peerReviewed.filter((paper) => {
    if (!paper.publicationDate) return false;
    const age = diffDays(params.date, paper.publicationDate);
    return age >= 0 && age <= 60;
  });

  let chosen: Paper | null = null;
  let recType: "latest" | "landmark" = "latest";

  if (latestPool.length) {
    chosen = [...latestPool].sort((a, b) => scoreWithRecency(b, params.date) - scoreWithRecency(a, params.date))[0];
  } else {
    const cutoff = addDays(params.date, -730);
    const landmarkPool = peerReviewed
      .filter((paper) => paper.publicationDate != null && paper.publicationDate < cutoff)
      .filter((paper) => (paper.qualityScore ?? 0) >= Math.max(70, params.settings.minAcceptScore))
      .filter((paper) => paper.citationCount >= 20)
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));
    if (landmarkPool.length) {
      chosen = landmarkPool[0];
      recType = "landmark";
    }
  }

  if (!chosen) {
    return {
      created: false,
      recommendation: null,
      reason: "没有满足质量门槛且尚未推荐过的论文；今日不降低标准推荐",
    };
  }

  const analysis = getLatestAnalysis(chosen.id, "deep_read");
  const content = analysis?.content as DeepReadContent | undefined;
  const recommendation = content?.recommendation;
  const fallback = deterministicCopy(chosen);

  const reason = recommendation?.reason ?? fallback.reason;
  const innovation = recommendation?.innovation ?? fallback.innovation;
  const value = recommendation?.value ?? fallback.value;

  insertRecommendation({
    date: params.date,
    paperId: chosen.id,
    recType,
    reason,
    innovation,
    value,
    score: chosen.qualityScore ?? 0,
  });

  updatePaper(chosen.id, { recommendation_category: recType }, "daily recommendation");

  return {
    created: true,
    recommendation: getRecommendationForDate(params.date),
    reason: recType === "latest" ? "选择近期发表、综合评分最高的已核验论文" : "近期没有合格新论文，选择高价值经典论文",
  };
}
