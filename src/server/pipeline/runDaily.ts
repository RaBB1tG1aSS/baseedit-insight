import type { AppSettings, DeepReadContent, JobProgress, Paper } from "@/lib/types";
import { env } from "../env";
import { getDb, newId, nowIso, todayInZone } from "../db/client";
import { getSettings } from "../db/repo/settings";
import { appendLog, setJobProgress } from "../db/repo/jobs";
import {
  countByStatus,
  findPaperByExternalIds,
  getPaperById,
  getPapersPendingStatusWatch,
  getRecentAccepted,
} from "../db/repo/papers";
import { getFigures, getLatestAnalysis, hasAnalysis } from "../db/repo/analysis";
import {
  createJob,
} from "../db/repo/jobs";
import { searchEuropePmc } from "../sources/europepmc";
import { searchPubmed } from "../sources/pubmed";
import { mergeSourceRecords } from "./dedupe";
import { assessRelevance } from "./relevance";
import { verifyCandidate } from "./verify";
import { scoreQuality } from "./quality";
import { gateDecision } from "./gate";
import { ingestCandidate, ingestPrefilterRejection } from "./ingest";
import { createDailyRecommendation } from "./recommend";
import { updateRecommendationCopy } from "../db/repo/knowledge";
import {
  applyJournalMetricToPaper,
  ensureOpenAlexJournalMetric,
  findJournalMetric,
  type ResolvedJournalMetric,
} from "../metrics/journals";
import { fetchAndStoreFullText } from "../fulltext/europepmc";
import { generateDeepRead } from "../ai/deepRead";
import { generateFigureAnalysis } from "../ai/figureRead";
import { extractKnowledgeAI, extractKnowledgeRuleBased } from "../ai/knowledge";
import { translateTitles } from "../ai/translate";
import { generateWeeklyReport } from "../ai/weekly";
import { isAiAvailable } from "../ai/client";
import { recheckPaperStatus } from "./statusWatch";
import { addDays, parseTime, weekOf, zonedParts } from "../utils/time";
import type { SourceRecord } from "../sources/types";

const LANDMARK_QUERY =
  '(TITLE_ABS:"base editing" OR TITLE_ABS:"base editor" OR TITLE_ABS:"base editors" OR TITLE_ABS:"cytosine base editor" OR TITLE_ABS:"adenine base editor" OR TITLE_ABS:"ABE8e" OR TITLE_ABS:"TadA") AND (SRC:MED OR SRC:PMC)';

export interface DailyRunOptions {
  jobId?: string;
  mode?: "full" | "search_only";
  sinceDays?: number;
  limit?: number;
  includeLandmark?: boolean;
  query?: string;
  maxDeepReads?: number;
  maxFigures?: number;
  forceWeekly?: boolean;
}

export interface DailyRunSummary {
  candidates: number;
  verified: number;
  accepted: number;
  rejected: number;
  needsReview: number;
  skipped: number;
  failed: number;
  errors: string[];
  recommendationPaperId: string | null;
  aiUsed: boolean;
  remainingBacklog: number;
}

class PipelineLogger {
  constructor(private jobId?: string) {}

  log(level: "info" | "warn" | "error", stage: string, message: string, data?: unknown): void {
    const prefix = `[pipeline:${stage}]`;
    if (level === "error") console.error(prefix, message);
    else if (level === "warn") console.warn(prefix, message);
    else console.log(prefix, message);
    if (this.jobId) {
      try {
        appendLog(this.jobId, level, stage, message, data);
      } catch {
        // logging must never break the pipeline
      }
    }
  }

  progress(progress: JobProgress): void {
    if (!this.jobId) return;
    try {
      setJobProgress(this.jobId, progress);
    } catch {
      // ignore
    }
  }
}

function recordSearchRun(
  jobId: string | undefined,
  source: string,
  query: string,
  startedAt: number,
  resultCount: number,
  error: string | null,
): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO search_runs (run_id, job_id, source, query, executed_at, result_count, duration_ms, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(newId("sr"), jobId ?? null, source, query, nowIso(), resultCount, Date.now() - startedAt, error);
  } catch {
    // non-critical telemetry
  }
}

function dedupeById(records: SourceRecord[]): SourceRecord[] {
  const map = new Map<string, SourceRecord>();
  for (const record of records) map.set(`${record.source}:${record.externalId}`, record);
  return [...map.values()];
}

export async function runDailyPipeline(options: DailyRunOptions = {}): Promise<DailyRunSummary> {
  const logger = new PipelineLogger(options.jobId);
  const settings = getSettings();
  const today = todayInZone(settings.timezone);
  const mode = options.mode ?? "full";
  const errors: string[] = [];

  const existingCounts = countByStatus();
  const acceptedSoFar = existingCounts.accepted ?? 0;
  const sinceDays = options.sinceDays ?? (acceptedSoFar === 0 ? 180 : 21);
  const since = addDays(today, -sinceDays);
  const limit = Math.min(settings.maxCandidatesPerRun, options.limit ?? settings.maxCandidatesPerRun);

  logger.log("info", "search", `检索窗口 ${since} → ${today}，每源上限 ${limit} 篇`, {
    mode,
    firstRun: acceptedSoFar === 0,
  });
  logger.progress({ stage: "search", stageLabel: "检索学术数据库", candidates: 0, verified: 0, accepted: 0, failed: 0 });

  const searchStarted = Date.now();
  const query = options.query || settings.focusQuery;
  const pubmedOptions = {
    query: "",
    limit,
    since,
    mailto: settings.ncbiEmail || env.ncbiEmail,
    apiKey: env.ncbiApiKey || undefined,
  };

  const [epmcResult, pubmedResult] = await Promise.allSettled([
    searchEuropePmc({ query, limit, since, mode: "latest" }),
    searchPubmed(pubmedOptions),
  ]);

  const records: SourceRecord[] = [];
  if (epmcResult.status === "fulfilled") {
    records.push(...epmcResult.value);
    recordSearchRun(options.jobId, "europepmc", query, searchStarted, epmcResult.value.length, null);
    logger.log("info", "search", `Europe PMC 返回 ${epmcResult.value.length} 条记录`);
  } else {
    const message = epmcResult.reason instanceof Error ? epmcResult.reason.message : String(epmcResult.reason);
    errors.push(`Europe PMC 检索失败：${message}`);
    recordSearchRun(options.jobId, "europepmc", query, searchStarted, 0, message);
    logger.log("error", "search", `Europe PMC 检索失败：${message}`);
  }

  if (pubmedResult.status === "fulfilled") {
    records.push(...pubmedResult.value);
    recordSearchRun(options.jobId, "pubmed", "curated base-editing term", searchStarted, pubmedResult.value.length, null);
    logger.log("info", "search", `PubMed 返回 ${pubmedResult.value.length} 条记录`);
  } else {
    const message = pubmedResult.reason instanceof Error ? pubmedResult.reason.message : String(pubmedResult.reason);
    errors.push(`PubMed 检索失败：${message}`);
    recordSearchRun(options.jobId, "pubmed", "curated base-editing term", searchStarted, 0, message);
    logger.log("error", "search", `PubMed 检索失败：${message}`);
  }

  if (options.includeLandmark !== false && mode === "full") {
    const landmarkStarted = Date.now();
    try {
      const landmark = await searchEuropePmc({ query: LANDMARK_QUERY, limit: 12, mode: "landmark" });
      records.push(...landmark);
      recordSearchRun(options.jobId, "europepmc-landmark", LANDMARK_QUERY, landmarkStarted, landmark.length, null);
      logger.log("info", "search", `经典论文检索返回 ${landmark.length} 条记录`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`经典论文检索失败：${message}`);
      recordSearchRun(options.jobId, "europepmc-landmark", LANDMARK_QUERY, landmarkStarted, 0, message);
      logger.log("warn", "search", `经典论文检索失败：${message}`);
    }
  }

  if (!records.length) {
    if (errors.length >= 2) throw new Error(`所有文献源均不可用：${errors.join("；")}`);
    logger.log("warn", "search", "本次未发现任何候选记录");
    return emptySummary(errors);
  }

  const merged = mergeSourceRecords(dedupeById(records));
  logger.log("info", "dedupe", `${records.length} 条来源记录去重后得到 ${merged.length} 篇候选论文`, {
    sources: { europepmc: epmcResult.status === "fulfilled" ? epmcResult.value.length : 0, pubmed: pubmedResult.status === "fulfilled" ? pubmedResult.value.length : 0 },
    merged: merged.length,
  });

  const verifiedAtCutoff = Date.now() - 30 * 86400000;
  const prefiltered = [];
  const rejectionSamples: { candidate: (typeof merged)[number]; relevance: ReturnType<typeof assessRelevance>; reason: string }[] = [];
  let skipped = 0;

  for (const candidate of merged) {
    const relevance = assessRelevance({
      title: candidate.title,
      abstract: candidate.abstract,
      keywords: candidate.keywords,
    });
    if (!relevance.isCore || relevance.score < settings.minTopicRelevance) {
      skipped += 1;
      if (rejectionSamples.length < 8) {
        rejectionSamples.push({
          candidate,
          relevance,
          reason: "未通过碱基编辑主题相关性预筛（仅在候选区保留审计记录，不进入知识库）",
        });
      }
      continue;
    }
    if (/retraction|erratum|correction/i.test(candidate.articleType ?? "")) {
      skipped += 1;
      if (rejectionSamples.length < 8) {
        rejectionSamples.push({
          candidate,
          relevance,
          reason: "论文类型为撤稿/勘误声明，不是可推荐的研究论文",
        });
      }
      continue;
    }
    const existing = findPaperByExternalIds({
      doi: candidate.doi,
      pmid: candidate.pmid,
      pmcid: candidate.pmcid,
      openalexId: candidate.openalexId,
      titleKey: candidate.titleKey,
    });
    if (
      existing &&
      existing.status === "accepted" &&
      existing.verifiedAt &&
      Date.parse(existing.verifiedAt) > verifiedAtCutoff
    ) {
      skipped += 1;
      continue;
    }
    prefiltered.push({ candidate, relevance });
  }

  prefiltered.sort((a, b) => b.relevance.score - a.relevance.score);
  const queue = prefiltered.slice(0, Math.max(1, limit));

  let storedRejections = 0;
  for (const sample of rejectionSamples) {
    try {
      if (ingestPrefilterRejection(sample)) storedRejections += 1;
    } catch (error) {
      logger.log("warn", "filter", `候选拒绝记录写入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (storedRejections) {
    logger.log("info", "filter", `已保留 ${storedRejections} 条预筛拒绝记录供候选审核（不含推荐与知识图谱）`);
  }

  logger.log("info", "filter", `相关性/去重预筛后 ${queue.length} 篇进入核验（跳过 ${skipped} 篇）`);
  logger.progress({
    stage: "verify",
    stageLabel: "逐篇核验中",
    candidates: merged.length,
    verified: 0,
    accepted: 0,
    failed: 0,
    total: queue.length,
    current: 0,
  });

  const verifyConfig = {
    ncbiEmail: settings.ncbiEmail || env.ncbiEmail,
    ncbiApiKey: env.ncbiApiKey,
    openalexMailto: settings.openalexMailto || env.openalexMailto,
    semanticScholarKey: env.semanticScholarApiKey,
    enableSemanticScholar: settings.enableSemanticScholar,
  };

  const accepted: string[] = [];
  let verifiedCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;
  let reviewCount = 0;
  let failedCount = 0;
  const metricCache = new Map<string, ResolvedJournalMetric | null>();
  const metricFilterActive =
    settings.journalMetricMode !== "off" && settings.minJournalMetric > 0;

  for (let index = 0; index < queue.length; index += 1) {
    const { candidate, relevance } = queue[index];
    const label = candidate.title.slice(0, 90);
    try {
      const verification = await verifyCandidate(candidate, verifyConfig, {
        onLog: (level, message) => logger.log(level, "verify", message),
      });
      if (verification.identityVerified) verifiedCount += 1;

      const candidateForMetric = verification.candidate;
      const metricKey = `${candidateForMetric.journal ?? ""}|${candidateForMetric.issn ?? ""}`;
      let journalMetric = metricCache.get(metricKey);
      if (journalMetric === undefined) {
        journalMetric = findJournalMetric(
          { journal: candidateForMetric.journal, issn: candidateForMetric.issn },
          settings.journalMetricMode,
        );
        if (
          !journalMetric &&
          metricFilterActive &&
          (settings.journalMetricMode === "openalex" || settings.journalMetricMode === "auto")
        ) {
          journalMetric = await ensureOpenAlexJournalMetric({
            journal: candidateForMetric.journal,
            issn: candidateForMetric.issn,
          });
        }
        metricCache.set(metricKey, journalMetric);
      }

      if (metricFilterActive) {
        verification.checks.push({
          checkItem: "期刊影响力",
          result: journalMetric
            ? journalMetric.value >= settings.minJournalMetric
              ? "pass"
              : "fail"
            : settings.journalMetricUnknown === "reject"
              ? "fail"
              : "warning",
          evidenceSource: journalMetric?.source ?? settings.journalMetricMode,
          evidence: journalMetric
            ? `${journalMetric.value} (${journalMetric.source}, ${journalMetric.year})`
            : null,
          notes: journalMetric
            ? `低于门槛时排除；当前门槛 ${settings.minJournalMetric}`
            : `未匹配到期刊指标；未知期刊策略：${settings.journalMetricUnknown}`,
        });
      }

      const quality = scoreQuality({
        candidate: verification.candidate,
        relevance,
        identityVerified: verification.identityVerified,
      });
      const gate = gateDecision({
        verification,
        quality,
        relevance,
        settings,
        articleType: verification.candidate.articleType,
        title: verification.candidate.title,
        journalMetric,
      });

      const ingest = ingestCandidate({
        candidate: verification.candidate,
        verification,
        quality,
        relevance,
        status: gate.status,
        settings,
      });

      applyJournalMetricToPaper(ingest.paperId, journalMetric);

      if (ingest.status === "accepted") {
        acceptedCount += 1;
        accepted.push(ingest.paperId);
      } else if (ingest.status === "rejected") rejectedCount += 1;
      else reviewCount += 1;

      logger.log(
        gate.status === "accepted" ? "info" : "warn",
        "verify",
        `${gate.status.toUpperCase()} | ${quality.total}/100 | 相关性 ${relevance.score}${journalMetric ? ` | 期刊指标 ${journalMetric.value}` : ""} | ${label}`,
        {
          paperId: ingest.paperId,
          created: ingest.created,
          checks: verification.checks.map((check) => `${check.checkItem}:${check.result}`),
          reasons: gate.reasons,
          warnings: verification.warnings,
        },
      );
    } catch (error) {
      failedCount += 1;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${label}: ${message}`);
      logger.log("error", "verify", `核验失败：${label} — ${message}`);
    }

    logger.progress({
      stage: "verify",
      stageLabel: `核验 ${index + 1}/${queue.length}`,
      candidates: merged.length,
      verified: verifiedCount,
      accepted: acceptedCount,
      failed: failedCount,
      total: queue.length,
      current: index + 1,
    });
  }

  logger.log("info", "verify", `核验完成：${verifiedCount} 篇通过身份核验，${acceptedCount} 篇正式入库`, {
    rejected: rejectedCount,
    needsReview: reviewCount,
    failed: failedCount,
  });

  const newAccepted = [...new Set(accepted)]
    .map((id) => getPaperById(id))
    .filter((paper): paper is Paper => Boolean(paper) && paper!.status === "accepted");

  if (mode === "search_only") {
    return {
      candidates: merged.length,
      verified: verifiedCount,
      accepted: acceptedCount,
      rejected: rejectedCount,
      needsReview: reviewCount,
      skipped,
      failed: failedCount,
      errors,
      recommendationPaperId: null,
      aiUsed: false,
      remainingBacklog: getBacklogCount(),
    };
  }

  /* ── Full text + figures for newly accepted papers ─────────────── */
  logger.progress({
    stage: "fulltext",
    stageLabel: "获取开放获取全文与图注",
    candidates: merged.length,
    verified: verifiedCount,
    accepted: acceptedCount,
    failed: failedCount,
    total: newAccepted.slice(0, 8).length,
    current: 0,
  });
  let fullTextProgress = 0;
  for (const paper of newAccepted.slice(0, 8)) {
    try {
      const result = await fetchAndStoreFullText(paper);
      logger.log(
        result.accessStatus === "oa_fulltext" ? "info" : "warn",
        "fulltext",
        `${paper.title.slice(0, 70)} — ${result.accessStatus}，${result.sections} 个正文段落，${result.figures} 张图`,
        { license: result.license, error: result.error },
      );
    } catch (error) {
      logger.log("warn", "fulltext", `全文获取失败：${error instanceof Error ? error.message : String(error)}`);
    }
    fullTextProgress += 1;
    logger.progress({
      stage: "fulltext",
      stageLabel: `获取全文 ${fullTextProgress}/${Math.min(8, newAccepted.length)}`,
      candidates: merged.length,
      verified: verifiedCount,
      accepted: acceptedCount,
      failed: failedCount,
      total: Math.min(8, newAccepted.length),
      current: fullTextProgress,
    });
  }

  const aiAvailable = isAiAvailable();
  logger.log(
    aiAvailable ? "info" : "warn",
    "analysis",
    aiAvailable ? "AI 分析引擎可用" : "AI 分析引擎不可用：精讲/图表分析将跳过，知识图谱回退为规则抽取",
  );

  let aiCost = 0;

  if (aiAvailable && newAccepted.length) {
    try {
      const translation = await translateTitles(newAccepted.map((paper) => paper.id));
      logger.log("info", "analysis", `中文标题翻译完成 ${translation.translated} 条`);
    } catch (error) {
      logger.log("warn", "analysis", `标题翻译失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const analysisTargets = chooseAnalysisTargets(newAccepted, options.maxDeepReads ?? 2);
  logger.progress({
    stage: "analysis",
    stageLabel: "生成中文深度精讲",
    candidates: merged.length,
    verified: verifiedCount,
    accepted: acceptedCount,
    failed: failedCount,
    total: analysisTargets.length,
    current: 0,
  });
  let analysisProgress = 0;
  for (const paper of analysisTargets) {
    if (!aiAvailable) break;
    try {
      const result = await generateDeepRead(paper.id, { force: paper.needsAnalysisRefresh });
      if (result.meta.costUsd) aiCost += result.meta.costUsd;
      logger.log(
        "info",
        "analysis",
        `深度精讲完成（${result.analysisLevel}）：${paper.title.slice(0, 60)}`,
        { model: result.meta.model, provider: result.meta.provider, costUsd: result.meta.costUsd },
      );
    } catch (error) {
      logger.log("error", "analysis", `精讲失败：${paper.title.slice(0, 60)} — ${error instanceof Error ? error.message : String(error)}`);
    }
    analysisProgress += 1;
    logger.progress({
      stage: "analysis",
      stageLabel: `精讲 ${analysisProgress}/${analysisTargets.length}`,
      candidates: merged.length,
      verified: verifiedCount,
      accepted: acceptedCount,
      failed: failedCount,
      total: analysisTargets.length,
      current: analysisProgress,
    });
  }

  /* ── Daily recommendation ──────────────────────────────────────── */
  logger.progress({ stage: "recommend", stageLabel: "生成每日推荐" });
  let recommendationPaperId: string | null = null;
  try {
    const recommendation = createDailyRecommendation({ date: today, settings });
    recommendationPaperId = recommendation.recommendation?.paperId ?? null;
    if (recommendation.recommendation) {
      logger.log(
        "info",
        "recommend",
        `${recommendation.created ? "生成" : "沿用"}今日推荐：${recommendation.recommendation.paper?.title ?? recommendationPaperId}`,
        { recType: recommendation.recommendation.recType, reason: recommendation.reason },
      );
    } else {
      logger.log("warn", "recommend", recommendation.reason);
    }
  } catch (error) {
    logger.log("error", "recommend", `每日推荐生成失败：${error instanceof Error ? error.message : String(error)}`);
  }

  /* ── Figure-by-figure analysis ─────────────────────────────────── */
  if (aiAvailable) {
    const figureBudget = options.maxFigures ?? 4;
    logger.progress({ stage: "figures", stageLabel: "逐图分析", total: figureBudget, current: 0 });
    const recommendedPaper = recommendationPaperId ? getPaperById(recommendationPaperId) : null;
    if (recommendedPaper && !hasAnalysis(recommendedPaper.id, "deep_read")) {
      try {
        const result = await generateDeepRead(recommendedPaper.id);
        if (result.meta.costUsd) aiCost += result.meta.costUsd;
        logger.log("info", "analysis", `为今日推荐补生成精讲：${recommendedPaper.title.slice(0, 60)}`);
      } catch (error) {
        logger.log("warn", "analysis", `推荐论文精讲失败：${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (recommendedPaper) {
      const recAnalysis = getLatestAnalysis(recommendedPaper.id, "deep_read");
      const recContent = (recAnalysis?.content ?? null) as DeepReadContent | null;
      if (recContent?.recommendation) {
        updateRecommendationCopy(today, recContent.recommendation);
      }
    }

    const figureTargets = analysisTargets
      .concat(recommendedPaper ? [recommendedPaper] : [])
      .filter((paper, index, list) => list.findIndex((item) => item.id === paper.id) === index)
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));

    let figureCount = 0;
    for (const paper of figureTargets) {
      if (figureCount >= figureBudget) break;
      const figures = getFigures(paper.id).filter((figure) => figure.legend && figure.legend.length > 80);
      for (const figure of figures) {
        if (figureCount >= figureBudget) break;
        try {
          const result = await generateFigureAnalysis(paper.id, figure.id, { force: paper.needsAnalysisRefresh });
          if (result.meta.costUsd) aiCost += result.meta.costUsd;
          figureCount += 1;
          logger.log("info", "figures", `${paper.title.slice(0, 45)} — ${figure.number} 分析完成`);
          logger.progress({ stage: "figures", stageLabel: `逐图分析 ${figureCount}/${figureBudget}`, total: figureBudget, current: figureCount });
        } catch (error) {
          logger.log("warn", "figures", `${figure.number} 分析失败：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }
  }

  /* ── Knowledge graph + timeline ────────────────────────────────── */
  const knowledgeBatch = [
    ...newAccepted.map((paper) => paper.id),
    ...getRecentAccepted(12)
      .filter((paper) => !hasAnalysis(paper.id, "knowledge"))
      .map((paper) => paper.id),
  ]
    .filter((id, index, list) => list.indexOf(id) === index)
    .slice(0, 6);

  if (knowledgeBatch.length) {
    logger.progress({ stage: "knowledge", stageLabel: "更新知识图谱与时间线", total: knowledgeBatch.length, current: 0 });
    try {
      const result = aiAvailable
        ? await extractKnowledgeAI(knowledgeBatch)
        : extractKnowledgeRuleBased(knowledgeBatch);
      logger.log(
        "info",
        "knowledge",
        `知识抽取（${result.mode}）：${result.entities} 个实体，${result.relations} 条关系，${result.events} 个时间线事件`,
        { skippedRelations: result.skippedRelations, skippedEvents: result.skippedEvents, model: result.model },
      );
      if (result.costUsd) aiCost += result.costUsd;
    } catch (error) {
      logger.log("warn", "knowledge", `AI 知识抽取失败，回退规则抽取：${error instanceof Error ? error.message : String(error)}`);
      const fallback = extractKnowledgeRuleBased(knowledgeBatch);
      logger.log("info", "knowledge", `规则抽取：${fallback.entities} 个实体关联`);
    }
  }

  /* ── Weekly report on the configured weekday ───────────────────── */
  const now = zonedParts(new Date(), settings.timezone);
  const weeklyTime = parseTime(settings.weeklyRunTime);
  const shouldGenerateWeekly =
    options.forceWeekly ||
    (now.weekday === Number(settings.weeklyRunDay) &&
      now.hour * 60 + now.minute >= weeklyTime.hour * 60 + weeklyTime.minute);
  if (shouldGenerateWeekly) {
    try {
      logger.progress({ stage: "weekly", stageLabel: "生成每周研究进展报告" });
      const week = weekOf(today);
      const result = await generateWeeklyReport({ weekStart: week.start, weekEnd: week.end });
      logger.log(
        "info",
        "weekly",
        `周报生成（${result.mode}）：${week.start} → ${week.end}，${result.paperCount} 篇论文`,
        { model: result.model, error: result.error, costUsd: result.costUsd },
      );
      if (result.costUsd) aiCost += result.costUsd;
    } catch (error) {
      logger.log("error", "weekly", `周报生成失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /* ── Status watch (retractions / corrections) ──────────────────── */
  const watchCutoff = new Date(Date.now() - 14 * 86400000).toISOString();
  const watchTargets = getPapersPendingStatusWatch(watchCutoff, 2);
  logger.progress({ stage: "status-watch", stageLabel: "复查撤稿/勘误状态", total: watchTargets.length, current: 0 });
  for (const paper of watchTargets) {
    try {
      const result = await recheckPaperStatus(paper.id);
      if (result.changed) {
        logger.log("warn", "status-watch", `状态变化：${paper.title.slice(0, 60)} → ${result.retractionStatus}`, result.notes);
      }
    } catch (error) {
      logger.log("warn", "status-watch", `状态复查失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (aiCost > 0) {
    logger.log("info", "cost", `本次 AI 调用累计成本约 $${aiCost.toFixed(4)}`);
  }

  logger.log("info", "done", "每日流水线执行完成", {
    candidates: merged.length,
    verified: verifiedCount,
    accepted: acceptedCount,
    recommendationPaperId,
  });
  logger.progress({
    stage: "done",
    stageLabel: "执行完成",
    candidates: merged.length,
    verified: verifiedCount,
    accepted: acceptedCount,
    failed: failedCount,
    total: 1,
    current: 1,
  });

  return {
    candidates: merged.length,
    verified: verifiedCount,
    accepted: acceptedCount,
    rejected: rejectedCount,
    needsReview: reviewCount,
    skipped,
    failed: failedCount,
    errors,
    recommendationPaperId,
    aiUsed: aiAvailable && analysisTargets.length > 0,
    remainingBacklog: getBacklogCount(),
  };
}

function chooseAnalysisTargets(newAccepted: Paper[], max: number): Paper[] {
  const pool = getRecentAccepted(80).filter((paper) => {
    if (paper.status !== "accepted") return false;
    const existing = getLatestAnalysis(paper.id, "deep_read");
    return !existing || paper.needsAnalysisRefresh;
  });
  const priority = new Map<string, number>();
  newAccepted.forEach((paper) => priority.set(paper.id, 1000 + (paper.qualityScore ?? 0)));
  return pool
    .sort((a, b) => {
      const pa = priority.get(a.id) ?? 0;
      const pb = priority.get(b.id) ?? 0;
      if (pa !== pb) return pb - pa;
      return (b.qualityScore ?? 0) - (a.qualityScore ?? 0);
    })
    .slice(0, Math.max(0, max));
}

function getBacklogCount(): number {
  const row = getDb()
    .prepare(
      `SELECT COUNT(*) AS n FROM papers p
       WHERE p.status='accepted' AND NOT EXISTS (
         SELECT 1 FROM ai_analyses a WHERE a.paper_id=p.id AND a.kind='deep_read' AND a.status='succeeded'
       )`,
    )
    .get() as { n: number };
  return row.n;
}

function emptySummary(errors: string[]): DailyRunSummary {
  return {
    candidates: 0,
    verified: 0,
    accepted: 0,
    rejected: 0,
    needsReview: 0,
    skipped: 0,
    failed: 0,
    errors,
    recommendationPaperId: null,
    aiUsed: false,
    remainingBacklog: 0,
  };
}

/** Utility used by CLI scripts to create a job row before running the pipeline. */
export function createPipelineJob(requestedBy = "cli") {
  return createJob("daily_pipeline", {}, { requestedBy, dedupe: false });
}
