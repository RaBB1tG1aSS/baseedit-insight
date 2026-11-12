import type { AppSettings, PaperStatus } from "@/lib/types";
import { EXCLUDED_ARTICLE_TYPES } from "../sources/types";
import type { VerificationOutcome } from "./verify";
import type { QualityResult } from "./quality";
import type { RelevanceAssessment } from "./relevance";
import type { ResolvedJournalMetric } from "../metrics/journals";

const METRIC_LABEL: Record<string, string> = {
  jcr: "JCR IF",
  custom: "自定义期刊指标",
  openalex: "OpenAlex 2yr citedness",
  snip: "CWTS SNIP",
  sjr: "SCImago SJR",
};

export interface GateResult {
  status: PaperStatus;
  reasons: string[];
}

/**
 * Applies the quality / integrity gate (§3.3). Nothing enters the verified
 * corpus without passing every condition.
 */
export function gateDecision(input: {
  verification: VerificationOutcome;
  quality: QualityResult;
  relevance: RelevanceAssessment;
  settings: AppSettings;
  articleType: string | null;
  title: string;
  journalMetric?: ResolvedJournalMetric | null;
}): GateResult {
  const reasons: string[] = [];
  const { verification, quality, relevance, settings } = input;
  let metricReject = false;
  const metricFilterActive =
    settings.journalMetricMode !== "off" && settings.minJournalMetric > 0;

  if (metricFilterActive) {
    const metric = input.journalMetric ?? null;
    if (!metric) {
      if (settings.journalMetricUnknown === "reject") {
        reasons.push(`未找到期刊影响力指标（${settings.journalMetricMode}），按设置排除`);
        metricReject = true;
      }
    } else if (metric.value < settings.minJournalMetric) {
      reasons.push(
        `期刊影响力 ${metric.value}（${METRIC_LABEL[metric.source] ?? metric.source}，${metric.year}）低于门槛 ${settings.minJournalMetric}`,
      );
      metricReject = true;
    }
  }

  if (!relevance.isCore || relevance.score < settings.minTopicRelevance) {
    reasons.push(
      `领域相关性不足（${relevance.score}/${settings.minTopicRelevance}）：未通过碱基编辑主题门槛`,
    );
  }

  if (verification.retraction.status === "retracted") {
    reasons.push("论文已撤稿：排除正式推荐");
  }

  if (
    input.articleType &&
    EXCLUDED_ARTICLE_TYPES.some((type) => input.articleType!.toLowerCase().includes(type))
  ) {
    reasons.push(`论文类型为「${input.articleType}」，不是可推荐的研究论文`);
  }

  if (verification.fatal.length) {
    reasons.push(...verification.fatal);
  }

  if (quality.total < settings.minAcceptScore) {
    reasons.push(`综合质量评分 ${quality.total} 低于门槛 ${settings.minAcceptScore}`);
  }

  if (!verification.identityVerified) {
    reasons.push("论文身份未能通过独立来源核验");
  }

  if (verification.conflicts.length) {
    reasons.push(`存在元数据冲突：${verification.conflicts.join("、")}`);
  }

  if (verification.retraction.status === "expression_of_concern") {
    reasons.push("存在 Expression of Concern，需人工复核");
  }

  if (reasons.length === 0) {
    return { status: "accepted", reasons: ["通过全部核验与质量门槛"] };
  }

  const hardReject =
    verification.retraction.status === "retracted" ||
    verification.fatal.length > 0 ||
    !relevance.isCore ||
    quality.total < settings.minAcceptScore ||
    metricReject;

  if (hardReject) return { status: "rejected", reasons };

  return { status: "needs_review", reasons };
}
