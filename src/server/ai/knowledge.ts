import type { DeepReadContent, Paper } from "@/lib/types";
import { CANONICAL_ENTITIES } from "@/lib/constants";
import { getPaperById } from "../db/repo/papers";
import { getLatestAnalysis, insertAnalysis } from "../db/repo/analysis";
import {
  insertRelation,
  insertTimelineEvent,
  linkEntityPaper,
  upsertEntity,
} from "../db/repo/knowledge";
import { callStructured } from "./client";
import { knowledgeExtractionSchema } from "./schemas";
import { knowledgePrompt } from "./prompts";
import { normalizeTitle } from "../utils/normalize";

const TEMPLATE_VERSION = "knowledge-v1";

export interface KnowledgeExtractionSummary {
  entities: number;
  relations: number;
  events: number;
  skippedRelations: number;
  skippedEvents: number;
  mode: "ai" | "rule";
  model: string | null;
  costUsd: number | null;
}

function quoteSupported(quote: string, haystack: string): boolean {
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/\s+/g, " ")
      .trim();
  const q = normalize(quote);
  const h = normalize(haystack);
  if (!q) return false;
  if (q.length < 12) return h.includes(q);
  const chunks = q
    .split(/…|\.\.\./)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 10);
  if (chunks.length > 1) return chunks.every((chunk) => h.includes(chunk));
  return h.includes(q);
}

function analysisHaystack(paper: Paper, analysis: DeepReadContent | null): string {
  const parts = [paper.title, paper.abstract ?? ""];
  if (analysis) {
    parts.push(
      analysis.one_liner,
      ...analysis.innovations.map((item) => item.description),
      ...analysis.results.map((item) => item.finding),
      analysis.significance,
    );
  }
  return parts.join("\n");
}

function trimDate(date: string): string | null {
  const match = date.match(/(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

export async function extractKnowledgeAI(paperIds: string[]): Promise<KnowledgeExtractionSummary> {
  const papers = paperIds
    .map((id) => getPaperById(id))
    .filter((paper): paper is Paper => Boolean(paper) && paper!.status === "accepted");

  if (!papers.length) {
    return {
      entities: 0,
      relations: 0,
      events: 0,
      skippedRelations: 0,
      skippedEvents: 0,
      mode: "ai",
      model: null,
      costUsd: null,
    };
  }

  const analyses = new Map<string, DeepReadContent>();
  for (const paper of papers) {
    const analysis = getLatestAnalysis(paper.id, "deep_read");
    if (analysis) analyses.set(paper.id, analysis.content as DeepReadContent);
  }

  const { data, meta } = await callStructured(knowledgeExtractionSchema, {
    prompt: knowledgePrompt(
      papers.map((paper) => {
        const analysis = analyses.get(paper.id);
        return {
          paper,
          oneLiner: analysis?.one_liner,
          innovations: analysis?.innovations.map((item) => item.description),
          limitations: analysis?.independent_limitations,
        };
      }),
    ),
    templateVersion: TEMPLATE_VERSION,
    timeoutMs: 240_000,
  });

  const paperById = new Map(papers.map((paper) => [paper.id, paper]));
  const entityIds = new Map<string, string>();

  for (const entity of data.entities) {
    if (!entity.name?.trim()) continue;
    const id = upsertEntity({
      name: entity.name.trim(),
      nameZh: entity.name_zh?.trim() || null,
      type: entity.type,
      description: entity.description?.trim() || null,
      aliases: entity.aliases,
    });
    entityIds.set(normalizeTitle(entity.name), id);
    for (const alias of entity.aliases) {
      entityIds.set(normalizeTitle(alias), id);
    }
  }

  let relationCount = 0;
  let skippedRelations = 0;
  const perPaperRelations = new Map<string, typeof data.relations>();

  for (const relation of data.relations) {
    const paper = paperById.get(relation.paper_id);
    if (!paper) {
      skippedRelations += 1;
      continue;
    }
    const sourceId = entityIds.get(normalizeTitle(relation.source));
    const targetId = entityIds.get(normalizeTitle(relation.target));
    if (!sourceId || !targetId) {
      skippedRelations += 1;
      continue;
    }
    const haystack = analysisHaystack(paper, analyses.get(paper.id) ?? null);
    if (!quoteSupported(relation.evidence_quote, haystack)) {
      skippedRelations += 1;
      continue;
    }

    insertRelation({
      sourceEntityId: sourceId,
      targetEntityId: targetId,
      relationType: relation.relation_type,
      paperId: paper.id,
      evidenceText: relation.evidence_quote,
      evidenceLocation: relation.evidence_location,
      nature: relation.nature,
      confidence: relation.confidence,
    });
    linkEntityPaper(sourceId, paper.id, "relation");
    linkEntityPaper(targetId, paper.id, "relation");
    relationCount += 1;
    const bucket = perPaperRelations.get(paper.id) ?? [];
    bucket.push(relation);
    perPaperRelations.set(paper.id, bucket);
  }

  let eventCount = 0;
  let skippedEvents = 0;
  const perPaperEvents = new Map<string, typeof data.timeline>();

  for (const event of data.timeline) {
    const paper = paperById.get(event.paper_id);
    if (!paper) {
      skippedEvents += 1;
      continue;
    }
    const haystack = analysisHaystack(paper, analyses.get(paper.id) ?? null);
    if (!quoteSupported(event.evidence_quote, haystack)) {
      skippedEvents += 1;
      continue;
    }
    const parsedDate = trimDate(event.date);
    if (!parsedDate) {
      skippedEvents += 1;
      continue;
    }
    // Never present a publication date as an invention date.
    const dateKind = event.date_kind;
    const eventDate =
      dateKind === "publication" ? (paper.publicationDate ?? parsedDate) : parsedDate;

    insertTimelineEvent({
      eventDate,
      dateKind,
      title: event.title,
      titleZh: event.title_zh || null,
      description: event.description,
      category: event.category,
      paperId: paper.id,
      evidenceText: event.evidence_quote,
      significance: Math.round(event.significance),
    });
    eventCount += 1;
    const bucket = perPaperEvents.get(paper.id) ?? [];
    bucket.push(event);
    perPaperEvents.set(paper.id, bucket);
  }

  for (const paper of papers) {
    insertAnalysis({
      paperId: paper.id,
      kind: "knowledge",
      analysisLevel: "abstract_only",
      templateVersion: TEMPLATE_VERSION,
      model: meta.model,
      provider: meta.provider,
      content: {
        relations: perPaperRelations.get(paper.id) ?? [],
        timeline: perPaperEvents.get(paper.id) ?? [],
        entities: data.entities
          .filter((entity) =>
            (perPaperRelations.get(paper.id) ?? []).some(
              (relation) => relation.source === entity.name || relation.target === entity.name,
            ),
          )
          .map((entity) => entity.name),
      },
    });
  }

  return {
    entities: data.entities.length,
    relations: relationCount,
    events: eventCount,
    skippedRelations,
    skippedEvents,
    mode: "ai",
    model: meta.model,
    costUsd: meta.costUsd,
  };
}

/**
 * Deterministic fallback: only creates verifiable "paper mentions entity" links
 * from a curated lexicon. No speculative relations or timeline events.
 */
export function extractKnowledgeRuleBased(paperIds: string[]): KnowledgeExtractionSummary {
  const papers = paperIds
    .map((id) => getPaperById(id))
    .filter((paper): paper is Paper => Boolean(paper) && paper!.status === "accepted");

  let entityCount = 0;
  let linked = 0;

  for (const paper of papers) {
    const haystack = `${paper.title}\n${paper.abstract ?? ""}\n${paper.keywords.join(" ")}`;
    for (const canonical of CANONICAL_ENTITIES) {
      if (!canonical.pattern.test(haystack)) continue;
      const id = upsertEntity({
        name: canonical.name,
        nameZh: canonical.nameZh,
        type: canonical.type,
        description: canonical.description,
        aliases: canonical.aliases,
      });
      linkEntityPaper(id, paper.id, "mentions");
      entityCount += 1;
      linked += 1;
    }
  }

  return {
    entities: entityCount,
    relations: 0,
    events: 0,
    skippedRelations: 0,
    skippedEvents: 0,
    mode: "rule",
    model: null,
    costUsd: null,
  };
}
