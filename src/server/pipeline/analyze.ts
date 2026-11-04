import type { Paper } from "@/lib/types";
import { getPaperById, getRecentAccepted } from "../db/repo/papers";
import { getFigures, getFullText, hasAnalysis } from "../db/repo/analysis";
import { fetchAndStoreFullText } from "../fulltext/europepmc";
import { generateDeepRead } from "../ai/deepRead";
import { generateFigureAnalysis } from "../ai/figureRead";
import { extractKnowledgeAI, extractKnowledgeRuleBased } from "../ai/knowledge";
import { translateTitles } from "../ai/translate";
import { isAiAvailable } from "../ai/client";

export interface AnalyzeOptions {
  force?: boolean;
  maxFigures?: number;
  withKnowledge?: boolean;
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

export interface AnalyzeResult {
  paperId: string;
  level: string | null;
  figures: number;
  error: string | null;
  costUsd: number;
}

/**
 * Manual "generate deep read / re-analyze" workflow for a single paper.
 * Shares the exact same code path as the daily pipeline.
 */
export async function analyzePaper(paperId: string, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
  const paper = getPaperById(paperId);
  if (!paper) throw new Error(`paper not found: ${paperId}`);
  if (paper.status !== "accepted") {
    throw new Error("只有正式入库（accepted）的论文才能生成精讲");
  }

  const log = options.onLog ?? (() => {});
  let cost = 0;
  let level: string | null = null;
  let figureCount = 0;

  const fullText = getFullText(paperId);
  if (!fullText || options.force) {
    try {
      const result = await fetchAndStoreFullText(paper, { force: options.force });
      log("info", `全文获取：${result.accessStatus}，${result.sections} 段，${result.figures} 图`);
      if (result.error) log("warn", result.error);
    } catch (error) {
      log("warn", `全文获取失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!isAiAvailable()) {
    return {
      paperId,
      level: null,
      figures: 0,
      error: "AI 不可用：未生成精讲",
      costUsd: 0,
    };
  }

  try {
    await translateTitles([paperId], { force: false });
  } catch (error) {
    log("warn", `标题翻译失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const deepRead = await generateDeepRead(paperId, { force: options.force });
  level = deepRead.analysisLevel;
  if (deepRead.meta.costUsd) cost += deepRead.meta.costUsd;
  log("info", `精讲完成（${deepRead.analysisLevel}）`);

  const refreshed = getPaperById(paperId) ?? paper;
  const figures = getFigures(paperId).filter((figure) => figure.legend && figure.legend.length > 80);
  for (const figure of figures.slice(0, options.maxFigures ?? 6)) {
    try {
      const result = await generateFigureAnalysis(paperId, figure.id, { force: options.force });
      figureCount += 1;
      if (result.meta.costUsd) cost += result.meta.costUsd;
      log("info", `${figure.number} 分析完成`);
    } catch (error) {
      log("warn", `${figure.number} 分析失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (options.withKnowledge !== false) {
    try {
      const result = await extractKnowledgeAI([refreshed.id]);
      log("info", `知识抽取：${result.entities} 实体 / ${result.relations} 关系 / ${result.events} 事件`);
      if (result.costUsd) cost += result.costUsd;
    } catch (error) {
      log("warn", `知识抽取失败，回退规则：${error instanceof Error ? error.message : String(error)}`);
      extractKnowledgeRuleBased([refreshed.id]);
    }
  }

  return { paperId, level, figures: figureCount, error: null, costUsd: cost };
}

export function knowledgeBacklog(limit = 6): Paper[] {
  return getRecentAccepted(80)
    .filter((paper) => !hasAnalysis(paper.id, "knowledge"))
    .slice(0, limit);
}

export async function analyzeFiguresOnly(
  paperId: string,
  options: { force?: boolean; maxFigures?: number; onLog?: (level: "info" | "warn" | "error", message: string) => void } = {},
): Promise<{ count: number; costUsd: number }> {
  const paper = getPaperById(paperId);
  if (!paper) throw new Error(`paper not found: ${paperId}`);
  if (paper.status !== "accepted") throw new Error("只有正式入库的论文才能生成图表分析");

  const log = options.onLog ?? (() => {});
  const figures = getFigures(paperId).filter((figure) => figure.legend && figure.legend.length > 80);
  let count = 0;
  let cost = 0;

  for (const figure of figures.slice(0, options.maxFigures ?? 8)) {
    try {
      const result = await generateFigureAnalysis(paperId, figure.id, { force: options.force ?? true });
      count += 1;
      if (result.meta.costUsd) cost += result.meta.costUsd;
      log("info", `${figure.number} 分析完成`);
    } catch (error) {
      log("warn", `${figure.number} 分析失败：${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { count, costUsd: cost };
}
