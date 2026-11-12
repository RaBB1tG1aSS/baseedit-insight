import type {
  AiAnalysis,
  Figure,
  FigureAnalysis,
  FigureAnalysisContent,
  FullTextMaterialStatus,
  QualityAssessment,
  QualityDimensionKey,
  SourceLink,
  VerificationRecord,
} from "@/lib/types";
import { QUALITY_DIMENSIONS } from "@/lib/types";
import { getDb, newId, nowIso } from "../client";
import { parseJson, type Row } from "../mappers";
import type { SourceRecord } from "../../sources/types";

export function replaceSources(paperId: string, records: SourceRecord[], verificationStatus: "unverified" | "verified" | "conflict" | "failed" = "unverified"): void {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO sources (source_id, paper_id, source_name, source_url, external_id, retrieval_time, original_metadata_json, verification_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_name, external_id) DO UPDATE SET
       paper_id = excluded.paper_id,
       source_url = excluded.source_url,
       retrieval_time = excluded.retrieval_time,
       original_metadata_json = excluded.original_metadata_json,
       verification_status = excluded.verification_status`,
  );
  const run = db.transaction(() => {
    for (const record of records) {
      upsert.run(
        newId("src"),
        paperId,
        record.source,
        record.url ?? null,
        record.externalId,
        record.retrievedAt,
        JSON.stringify(record.raw ?? null),
        verificationStatus,
      );
    }
  });
  run();
}

export function getSources(paperId: string): SourceLink[] {
  const rows = getDb()
    .prepare("SELECT * FROM sources WHERE paper_id = ? ORDER BY source_name")
    .all(paperId) as Row[];
  return rows.map((row) => ({
    sourceId: String(row.source_id),
    paperId: String(row.paper_id),
    sourceName: String(row.source_name),
    sourceUrl: String(row.source_url ?? ""),
    externalId: (row.external_id as string | null) ?? null,
    retrievalTime: String(row.retrieval_time),
    verificationStatus: row.verification_status as SourceLink["verificationStatus"],
  }));
}

export interface VerificationInput {
  checkItem: string;
  result: "pass" | "fail" | "conflict" | "warning";
  evidenceSource?: string | null;
  evidence?: string | null;
  notes?: string | null;
}

export function addVerificationRecords(paperId: string, records: VerificationInput[]): void {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO verification_records (verification_id, paper_id, check_item, result, evidence_source, evidence, notes, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const ts = nowIso();
  const run = db.transaction(() => {
    for (const record of records) {
      stmt.run(newId("ver"), paperId, record.checkItem, record.result, record.evidenceSource ?? null, record.evidence ?? null, record.notes ?? null, ts);
    }
  });
  run();
}

export function getVerificationRecords(paperId: string, limit = 40): VerificationRecord[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM verification_records WHERE paper_id = ? ORDER BY checked_at DESC, rowid DESC LIMIT ?",
    )
    .all(paperId, limit) as Row[];
  return rows.map((row) => ({
    id: String(row.verification_id),
    paperId: String(row.paper_id),
    checkItem: String(row.check_item),
    result: row.result as VerificationRecord["result"],
    evidenceSource: (row.evidence_source as string | null) ?? null,
    evidence: (row.evidence as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    checkedAt: String(row.checked_at),
  }));
}

export function getLatestVerificationByItem(paperId: string): Map<string, VerificationRecord> {
  return new Map(getVerificationRecords(paperId, 200).map((record) => [record.checkItem, record]));
}

export function saveQualityAssessment(params: {
  paperId: string;
  dimensions: { key: QualityDimensionKey; score: number; rationale: string; method: "rule" | "llm" | "hybrid" }[];
  summary: string | null;
  model: string | null;
  promptVersion: string | null;
}): number {
  const db = getDb();
  const ts = nowIso();
  const stmt = db.prepare(
    `INSERT INTO quality_assessments
      (assessment_id, paper_id, dimension, label, score, max_score, rationale, method, model, prompt_version, assessed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let total = 0;
  const run = db.transaction(() => {
    for (const dimension of params.dimensions) {
      const meta = QUALITY_DIMENSIONS.find((d) => d.key === dimension.key);
      if (!meta) continue;
      const score = Math.max(0, Math.min(meta.max, dimension.score));
      total += score;
      stmt.run(
        newId("qa"),
        params.paperId,
        dimension.key,
        meta.label,
        score,
        meta.max,
        dimension.rationale,
        dimension.method,
        params.model,
        params.promptVersion,
        ts,
      );
    }
  });
  run();
  return Math.round(total * 10) / 10;
}

export function getQualityAssessment(paperId: string): QualityAssessment | null {
  const db = getDb();
  const latest = db
    .prepare("SELECT MAX(assessed_at) AS ts FROM quality_assessments WHERE paper_id = ?")
    .get(paperId) as { ts: string | null };
  if (!latest.ts) return null;

  const rows = db
    .prepare("SELECT * FROM quality_assessments WHERE paper_id = ? AND assessed_at = ?")
    .all(paperId, latest.ts) as Row[];
  if (!rows.length) return null;

  const dimensions = QUALITY_DIMENSIONS.map((meta) => {
    const row = rows.find((r) => r.dimension === meta.key);
    return {
      key: meta.key,
      label: meta.label,
      max: meta.max,
      score: row ? Number(row.score) : 0,
      rationale: row ? String(row.rationale ?? "") : "尚无该维度评分",
      method: (row?.method as "rule" | "llm" | "hybrid") ?? "rule",
    };
  });

  return {
    paperId,
    dimensions,
    total: Math.round(dimensions.reduce((sum, d) => sum + d.score, 0) * 10) / 10,
    summary: null,
    assessedAt: latest.ts,
    model: rows[0] ? ((rows[0].model as string | null) ?? null) : null,
  };
}

export interface FullTextRecord {
  paperId: string;
  accessStatus: FullTextMaterialStatus;
  sourceName: string | null;
  sourceUrl: string | null;
  license: string | null;
  licenseAllowsStorage: boolean;
  sections: { heading: string; text: string }[];
  charCount: number;
  fetchedAt: string | null;
  error: string | null;
}

export function upsertFullText(record: FullTextRecord): void {
  getDb()
    .prepare(
      `INSERT INTO full_texts
        (paper_id, access_status, source_name, source_url, license, license_allows_storage, sections_json, char_count, fetched_at, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(paper_id) DO UPDATE SET
         access_status = excluded.access_status,
         source_name = excluded.source_name,
         source_url = excluded.source_url,
         license = excluded.license,
         license_allows_storage = excluded.license_allows_storage,
         sections_json = excluded.sections_json,
         char_count = excluded.char_count,
         fetched_at = excluded.fetched_at,
         error = excluded.error`,
    )
    .run(
      record.paperId,
      record.accessStatus,
      record.sourceName,
      record.sourceUrl,
      record.license,
      record.licenseAllowsStorage ? 1 : 0,
      JSON.stringify(record.sections),
      record.charCount,
      record.fetchedAt,
      record.error,
    );
}

export function getFullText(paperId: string): FullTextRecord | null {
  const row = getDb().prepare("SELECT * FROM full_texts WHERE paper_id = ?").get(paperId) as
    | Row
    | undefined;
  if (!row) return null;
  return {
    paperId: String(row.paper_id),
    accessStatus: row.access_status as FullTextMaterialStatus,
    sourceName: (row.source_name as string | null) ?? null,
    sourceUrl: (row.source_url as string | null) ?? null,
    license: (row.license as string | null) ?? null,
    licenseAllowsStorage: Boolean(row.license_allows_storage),
    sections: parseJson(row.sections_json as string, [] as { heading: string; text: string }[]),
    charCount: Number(row.char_count ?? 0),
    fetchedAt: (row.fetched_at as string | null) ?? null,
    error: (row.error as string | null) ?? null,
  };
}

export function deleteFullText(paperId: string): boolean {
  const result = getDb().prepare("DELETE FROM full_texts WHERE paper_id = ?").run(paperId);
  return result.changes > 0;
}

export interface FigureInput {
  number: string;
  title?: string | null;
  legend?: string | null;
  sourceUrl?: string | null;
  imageAccessStatus: "available" | "link_only" | "unavailable";
  attribution?: string | null;
  panels?: { label: string; description: string }[];
}

export function replaceFigures(paperId: string, figures: FigureInput[]): string[] {
  const db = getDb();
  const ts = nowIso();
  const numbers = figures.map((f) => f.number);
  const existing = db
    .prepare("SELECT figure_id, figure_number FROM figures WHERE paper_id = ?")
    .all(paperId) as { figure_id: string; figure_number: string }[];
  const byNumber = new Map(existing.map((row) => [row.figure_number, row.figure_id]));

  const upsert = db.prepare(
    `INSERT INTO figures (figure_id, paper_id, figure_number, figure_title, legend, source_url, image_access_status, attribution, panels_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(paper_id, figure_number) DO UPDATE SET
       figure_title = excluded.figure_title,
       legend = excluded.legend,
       source_url = excluded.source_url,
       image_access_status = excluded.image_access_status,
       attribution = excluded.attribution,
       panels_json = excluded.panels_json,
       updated_at = excluded.updated_at`,
  );

  const ids: string[] = [];
  const run = db.transaction(() => {
    for (const figure of figures) {
      const id = byNumber.get(figure.number) ?? newId("fig");
      upsert.run(
        id,
        paperId,
        figure.number,
        figure.title ?? null,
        figure.legend ?? null,
        figure.sourceUrl ?? null,
        figure.imageAccessStatus,
        figure.attribution ?? null,
        JSON.stringify(figure.panels ?? []),
        ts,
        ts,
      );
      ids.push(id);
    }
    const stale = existing.filter((row) => !numbers.includes(row.figure_number));
    for (const row of stale) {
      db.prepare("DELETE FROM figures WHERE figure_id = ?").run(row.figure_id);
    }
  });
  run();
  return ids;
}

export function getFigures(paperId: string): Figure[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM figures WHERE paper_id = ? ORDER BY figure_number")
    .all(paperId) as Row[];
  return rows.map((row) => {
    const figureId = String(row.figure_id);
    return {
      id: figureId,
      paperId,
      number: String(row.figure_number),
      title: (row.figure_title as string | null) ?? null,
      legend: (row.legend as string | null) ?? null,
      sourceUrl: (row.source_url as string | null) ?? null,
      imageAccessStatus: row.image_access_status as Figure["imageAccessStatus"],
      attribution: (row.attribution as string | null) ?? null,
      panels: parseJson(row.panels_json as string, [] as { label: string; description: string }[]),
      analysis: getLatestFigureAnalysis(figureId),
    };
  });
}

export interface AnalysisInput {
  paperId: string;
  figureId?: string | null;
  kind: "deep_read" | "figure" | "knowledge" | "weekly";
  analysisLevel: "full_text" | "abstract_only";
  templateVersion: string;
  model: string;
  provider: string;
  content: unknown;
  status?: "succeeded" | "failed" | "stale";
  error?: string | null;
  sourceHash?: string | null;
}

export function insertAnalysis(input: AnalysisInput): string {
  const id = newId("ana");
  getDb()
    .prepare(
      `INSERT INTO ai_analyses
        (analysis_id, paper_id, figure_id, kind, analysis_level, template_version, model, provider, content_json, status, error, source_hash, generated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.paperId,
      input.figureId ?? null,
      input.kind,
      input.analysisLevel,
      input.templateVersion,
      input.model,
      input.provider,
      JSON.stringify(input.content ?? null),
      input.status ?? "succeeded",
      input.error ?? null,
      input.sourceHash ?? null,
      nowIso(),
    );
  return id;
}

function mapAnalysis(row: Row): AiAnalysis {
  return {
    id: String(row.analysis_id),
    paperId: String(row.paper_id),
    figureId: (row.figure_id as string | null) ?? null,
    kind: row.kind as AiAnalysis["kind"],
    analysisLevel: row.analysis_level as AiAnalysis["analysisLevel"],
    templateVersion: String(row.template_version),
    model: String(row.model),
    provider: String(row.provider),
    content: parseJson(row.content_json as string, null),
    status: row.status as AiAnalysis["status"],
    error: (row.error as string | null) ?? null,
    generatedAt: String(row.generated_at),
  };
}

export function getLatestAnalysis(paperId: string, kind: "deep_read" | "knowledge"): AiAnalysis | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM ai_analyses
       WHERE paper_id = ? AND kind = ? AND status != 'failed'
       ORDER BY generated_at DESC LIMIT 1`,
    )
    .get(paperId, kind) as Row | undefined;
  return row ? mapAnalysis(row) : null;
}

export function getLatestFigureAnalysis(figureId: string): FigureAnalysis | null {
  const row = getDb()
    .prepare(
      `SELECT * FROM ai_analyses
       WHERE figure_id = ? AND kind = 'figure' AND status != 'failed'
       ORDER BY generated_at DESC LIMIT 1`,
    )
    .get(figureId) as Row | undefined;
  if (!row) return null;
  const analysis = mapAnalysis(row);
  return {
    id: analysis.id,
    figureId,
    analysisLevel: analysis.analysisLevel,
    content: analysis.content as FigureAnalysisContent,
    model: analysis.model,
    generatedAt: analysis.generatedAt,
    status: analysis.status,
  };
}

export function getAnalysisHistory(paperId: string, limit = 10): AiAnalysis[] {
  const rows = getDb()
    .prepare("SELECT * FROM ai_analyses WHERE paper_id = ? ORDER BY generated_at DESC LIMIT ?")
    .all(paperId, limit) as Row[];
  return rows.map(mapAnalysis);
}

export function markAnalysesStale(paperId: string): void {
  getDb()
    .prepare("UPDATE ai_analyses SET status = 'stale' WHERE paper_id = ? AND status = 'succeeded'")
    .run(paperId);
}

export function hasAnalysis(paperId: string, kind: "deep_read" | "figure" | "knowledge"): boolean {
  const row = getDb()
    .prepare(
      "SELECT 1 AS ok FROM ai_analyses WHERE paper_id = ? AND kind = ? AND status = 'succeeded' LIMIT 1",
    )
    .get(paperId, kind) as { ok: number } | undefined;
  return Boolean(row);
}
