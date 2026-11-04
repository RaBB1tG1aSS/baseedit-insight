import type { FigureAnalysisContent, EvidenceRef } from "@/lib/types";
import { getPaperById } from "../db/repo/papers";
import {
  getFigures,
  getFullText,
  getLatestAnalysis,
  getLatestFigureAnalysis,
  insertAnalysis,
} from "../db/repo/analysis";
import { callStructured, type AiMeta } from "./client";
import { figureAnalysisSchema } from "./schemas";
import { figurePrompt } from "./prompts";
import type { DeepReadContent } from "@/lib/types";

const TEMPLATE_VERSION = "figure-read-v1";

export interface FigureReadResult {
  content: FigureAnalysisContent;
  meta: AiMeta;
  analysisLevel: "full_text" | "abstract_only";
  analysisId: string;
  reused: boolean;
}

export async function generateFigureAnalysis(
  paperId: string,
  figureId: string,
  options: { force?: boolean } = {},
): Promise<FigureReadResult> {
  const paper = getPaperById(paperId);
  if (!paper) throw new Error(`paper not found: ${paperId}`);
  if (paper.status !== "accepted") throw new Error("figure analysis is only allowed for accepted papers");

  const figures = getFigures(paperId);
  const figure = figures.find((item) => item.id === figureId);
  if (!figure) throw new Error(`figure not found: ${figureId}`);

  const existing = getLatestFigureAnalysis(figureId);
  if (existing && !options.force && !paper.needsAnalysisRefresh) {
    return {
      content: existing.content,
      meta: {
        model: existing.model,
        provider: "stored",
        templateVersion: TEMPLATE_VERSION,
        costUsd: null,
      },
      analysisLevel: existing.analysisLevel,
      analysisId: existing.id,
      reused: true,
    };
  }

  const fullText = getFullText(paperId);
  const sections = fullText?.sections ?? [];
  const analysisLevel = sections.length > 0 ? "full_text" : "abstract_only";
  const deepRead = getLatestAnalysis(paperId, "deep_read");
  const summary = deepRead ? (deepRead.content as DeepReadContent).one_liner : undefined;

  const { data, meta } = await callStructured(figureAnalysisSchema, {
    prompt: figurePrompt({ paper, figure, fullTextSections: sections, analysisSummary: summary }),
    templateVersion: TEMPLATE_VERSION,
    timeoutMs: 240_000,
  });

  const evidence: EvidenceRef[] = data.evidence.map((item) => ({
    paper_id: paper.id,
    location: item.location,
    quote: item.quote,
    nature: item.nature,
  }));

  const content: FigureAnalysisContent = {
    purpose: data.purpose,
    question: data.question,
    design: data.design,
    panels: data.panels,
    data_reading: data.data_reading,
    result: data.result,
    significance: data.significance,
    critique: data.critique,
    logic_link: data.logic_link,
    evidence,
  };

  const analysisId = insertAnalysis({
    paperId,
    figureId,
    kind: "figure",
    analysisLevel,
    templateVersion: TEMPLATE_VERSION,
    model: meta.model,
    provider: meta.provider,
    content,
  });

  return { content, meta, analysisLevel, analysisId, reused: false };
}
