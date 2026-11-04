import type { DeepReadContent, EvidenceRef } from "@/lib/types";
import { getPaperById, updatePaper, clearAnalysesNeedRefresh } from "../db/repo/papers";
import {
  getFigures,
  getFullText,
  getLatestAnalysis,
  insertAnalysis,
} from "../db/repo/analysis";
import { callStructured, type AiMeta } from "./client";
import { deepReadSchema } from "./schemas";
import { deepReadPrompt } from "./prompts";
import { contentHash } from "../utils/normalize";

const TEMPLATE_VERSION = "deep-read-v1";

export interface DeepReadResult {
  content: DeepReadContent;
  meta: AiMeta;
  analysisLevel: "full_text" | "abstract_only";
  analysisId: string;
  reused: boolean;
}

export async function generateDeepRead(
  paperId: string,
  options: { force?: boolean } = {},
): Promise<DeepReadResult> {
  const paper = getPaperById(paperId);
  if (!paper) throw new Error(`paper not found: ${paperId}`);
  if (paper.status !== "accepted") {
    throw new Error(`paper ${paperId} is not accepted; refusing to generate analysis`);
  }

  const existing = getLatestAnalysis(paperId, "deep_read");
  if (existing && !options.force && !paper.needsAnalysisRefresh) {
    return {
      content: existing.content as DeepReadContent,
      meta: {
        model: existing.model,
        provider: existing.provider,
        templateVersion: existing.templateVersion,
        costUsd: null,
      },
      analysisLevel: existing.analysisLevel,
      analysisId: existing.id,
      reused: true,
    };
  }

  const fullText = getFullText(paperId);
  const figures = getFigures(paperId);
  const sections = fullText?.sections ?? [];
  const analysisLevel = sections.length > 0 ? "full_text" : "abstract_only";

  const { data, meta } = await callStructured(deepReadSchema, {
    prompt: deepReadPrompt({ paper, fullTextSections: sections, figures }),
    templateVersion: TEMPLATE_VERSION,
    timeoutMs: 300_000,
  });

  const evidence: EvidenceRef[] = data.evidence.map((item) => ({
    paper_id: paper.id,
    location: item.location,
    quote: item.quote,
    nature: item.nature,
  }));

  const content: DeepReadContent = {
    one_liner: data.one_liner,
    background: data.background,
    core_question: data.core_question,
    hypothesis: data.hypothesis,
    goal: data.goal,
    approach: data.approach,
    results: data.results,
    innovations: data.innovations,
    author_limitations: data.author_limitations,
    independent_limitations: data.independent_limitations,
    significance: data.significance,
    takeaways: data.takeaways,
    glossary: data.glossary,
    prerequisites: data.prerequisites,
    reading_guide: data.reading_guide,
    evidence,
    figure_logic: data.figure_logic,
    recommendation: {
      reason: data.recommendation_reason,
      innovation: data.recommendation_innovation,
      value: data.recommendation_value,
    },
  };

  const analysisId = insertAnalysis({
    paperId,
    kind: "deep_read",
    analysisLevel,
    templateVersion: TEMPLATE_VERSION,
    model: meta.model,
    provider: meta.provider,
    content,
    sourceHash: contentHash([
      paper.title,
      paper.abstract,
      sections.map((section) => `${section.heading}${section.text}`).join(""),
      figures.map((figure) => figure.legend).join(""),
    ]),
  });

  if (!paper.titleZh && data.title_zh) {
    updatePaper(paperId, { title_zh: data.title_zh }, "AI title translation (deep read)");
  }
  clearAnalysesNeedRefresh(paperId);

  return { content, meta, analysisLevel, analysisId, reused: false };
}
