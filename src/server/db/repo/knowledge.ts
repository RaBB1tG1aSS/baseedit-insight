import type {
  DailyRecommendation,
  EntityType,
  EvidenceNature,
  KnowledgeEntity,
  KnowledgeRelation,
  RecommendationCategory,
  TimelineEvent,
  WeeklyReport,
  WeeklyReportContent,
} from "@/lib/types";
import { getDb, newId, nowIso } from "../client";
import { mapPaperSummary, parseJson, type PaperRow } from "../mappers";
import { PAPER_COLUMNS } from "../mappers";
import { normalizeTitle } from "../../utils/normalize";

/* ─────────────────────────── Daily recommendations ─────────────────────── */

export function getRecommendationForDate(date: string): DailyRecommendation | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT r.*, ${PAPER_COLUMNS}
       FROM daily_recommendations r JOIN papers p ON p.id = r.paper_id
       WHERE r.rec_date = ?`,
    )
    .get(date) as (PaperRow & Record<string, unknown>) | undefined;
  if (!row) return null;
  return {
    id: String(row.recommendation_id),
    date: String(row.rec_date),
    paperId: String(row.paper_id),
    recType: row.rec_type as RecommendationCategory,
    reason: String(row.reason),
    innovation: String(row.innovation),
    value: String(row.value),
    score: Number(row.score),
    createdAt: String(row.created_at),
    paper: mapPaperSummary(row),
  };
}

export function insertRecommendation(params: {
  date: string;
  paperId: string;
  recType: RecommendationCategory;
  reason: string;
  innovation: string;
  value: string;
  score: number;
}): string {
  const id = newId("rec");
  getDb()
    .prepare(
      `INSERT INTO daily_recommendations
        (recommendation_id, rec_date, paper_id, rec_type, reason, innovation, value, score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(rec_date) DO UPDATE SET
         paper_id = excluded.paper_id, rec_type = excluded.rec_type, reason = excluded.reason,
         innovation = excluded.innovation, value = excluded.value, score = excluded.score`,
    )
    .run(id, params.date, params.paperId, params.recType, params.reason, params.innovation, params.value, params.score, nowIso());
  return id;
}

export function getRecommendedPaperIds(): Set<string> {
  const rows = getDb().prepare("SELECT paper_id FROM daily_recommendations").all() as {
    paper_id: string;
  }[];
  return new Set(rows.map((row) => row.paper_id));
}

export function countRecommendationsForPaper(paperId: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM daily_recommendations WHERE paper_id = ?")
    .get(paperId) as { n: number };
  return row.n;
}

export function updateRecommendationCopy(
  date: string,
  copy: { reason: string; innovation: string; value: string },
): void {
  getDb()
    .prepare(
      "UPDATE daily_recommendations SET reason = ?, innovation = ?, value = ? WHERE rec_date = ?",
    )
    .run(copy.reason, copy.innovation, copy.value, date);
}

export function getRecentRecommendations(limit = 8): DailyRecommendation[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT r.*, ${PAPER_COLUMNS}
       FROM daily_recommendations r JOIN papers p ON p.id = r.paper_id
       ORDER BY r.rec_date DESC LIMIT ?`,
    )
    .all(limit) as (PaperRow & Record<string, unknown>)[];
  return rows.map((row) => ({
    id: String(row.recommendation_id),
    date: String(row.rec_date),
    paperId: String(row.paper_id),
    recType: row.rec_type as RecommendationCategory,
    reason: String(row.reason),
    innovation: String(row.innovation),
    value: String(row.value),
    score: Number(row.score),
    createdAt: String(row.created_at),
    paper: mapPaperSummary(row),
  }));
}

/* ────────────────────────────── Knowledge graph ─────────────────────────── */

function normalizedEntityName(name: string): string {
  return normalizeTitle(name).replace(/\s+/g, " ");
}

export function upsertEntity(input: {
  name: string;
  nameZh?: string | null;
  type: EntityType;
  description?: string | null;
  aliases?: string[];
}): string {
  const db = getDb();
  const normalized = normalizedEntityName(input.name);
  const aliases = (input.aliases ?? []).map((alias) => normalizedEntityName(alias)).filter(Boolean);

  const candidates = db
    .prepare("SELECT entity_id, name, aliases_json FROM knowledge_entities WHERE entity_type = ?")
    .all(input.type) as { entity_id: string; name: string; aliases_json: string }[];

  for (const candidate of candidates) {
    const candidateAliases = parseJson<string[]>(candidate.aliases_json, []).map(normalizedEntityName);
    const all = new Set([normalizedEntityName(candidate.name), ...candidateAliases]);
    if (all.has(normalized) || aliases.some((alias) => all.has(alias))) {
      if (input.description) {
        db.prepare(
          `UPDATE knowledge_entities SET description = COALESCE(NULLIF(description,''), ?), updated_at = ? WHERE entity_id = ?`,
        ).run(input.description, nowIso(), candidate.entity_id);
      }
      return candidate.entity_id;
    }
  }

  const id = newId("ent");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO knowledge_entities
      (entity_id, name, name_zh, entity_type, description, aliases_json, normalized_name, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.nameZh ?? null, input.type, input.description ?? null, JSON.stringify(input.aliases ?? []), normalized, ts, ts);
  return id;
}

export function linkEntityPaper(entityId: string, paperId: string, role = "mentions"): void {
  getDb()
    .prepare(
      `INSERT INTO entity_paper_links (entity_id, paper_id, role) VALUES (?, ?, ?)
       ON CONFLICT DO NOTHING`,
    )
    .run(entityId, paperId, role);
}

export function insertRelation(input: {
  sourceEntityId: string;
  targetEntityId: string;
  relationType: string;
  paperId: string;
  evidenceText: string;
  evidenceLocation?: string | null;
  nature: EvidenceNature;
  confidence: number;
}): void {
  if (input.sourceEntityId === input.targetEntityId) return;
  getDb()
    .prepare(
      `INSERT INTO knowledge_relations
        (relation_id, source_entity_id, target_entity_id, relation_type, paper_id, evidence_text, evidence_location, nature, confidence, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(source_entity_id, target_entity_id, relation_type, paper_id) DO UPDATE SET
         evidence_text = excluded.evidence_text,
         evidence_location = excluded.evidence_location,
         nature = excluded.nature,
         confidence = excluded.confidence`,
    )
    .run(
      newId("rel"),
      input.sourceEntityId,
      input.targetEntityId,
      input.relationType,
      input.paperId,
      input.evidenceText,
      input.evidenceLocation ?? null,
      input.nature,
      input.confidence,
      nowIso(),
    );
}

export function getEntity(entityId: string): KnowledgeEntity | null {
  const row = getDb()
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(DISTINCT paper_id) FROM entity_paper_links l WHERE l.entity_id = e.entity_id) AS paper_count,
        (SELECT MIN(substr(p.publication_date,1,4)) FROM entity_paper_links l JOIN papers p ON p.id = l.paper_id WHERE l.entity_id = e.entity_id) AS first_year
       FROM knowledge_entities e WHERE e.entity_id = ?`,
    )
    .get(entityId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.entity_id),
    name: String(row.name),
    nameZh: (row.name_zh as string | null) ?? null,
    type: row.entity_type as EntityType,
    description: (row.description as string | null) ?? null,
    aliases: parseJson<string[]>(row.aliases_json as string, []),
    paperCount: Number(row.paper_count ?? 0),
    firstYear: row.first_year == null ? null : Number(row.first_year),
  };
}

export function getGraph(limit = 150): {
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT e.*,
        (SELECT COUNT(DISTINCT paper_id) FROM entity_paper_links l WHERE l.entity_id = e.entity_id) AS paper_count,
        (SELECT MIN(substr(p.publication_date,1,4)) FROM entity_paper_links l JOIN papers p ON p.id = l.paper_id WHERE l.entity_id = e.entity_id) AS first_year
       FROM knowledge_entities e
       ORDER BY paper_count DESC, e.name
       LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];

  const entities: KnowledgeEntity[] = rows.map((row) => ({
    id: String(row.entity_id),
    name: String(row.name),
    nameZh: (row.name_zh as string | null) ?? null,
    type: row.entity_type as EntityType,
    description: (row.description as string | null) ?? null,
    aliases: parseJson<string[]>(row.aliases_json as string, []),
    paperCount: Number(row.paper_count ?? 0),
    firstYear: row.first_year == null ? null : Number(row.first_year),
  }));

  const ids = new Set(entities.map((entity) => entity.id));
  const relationRows = db
    .prepare(
      `SELECT r.*, s.name AS source_name, t.name AS target_name, p.title AS paper_title
       FROM knowledge_relations r
       JOIN knowledge_entities s ON s.entity_id = r.source_entity_id
       JOIN knowledge_entities t ON t.entity_id = r.target_entity_id
       JOIN papers p ON p.id = r.paper_id
       WHERE p.status = 'accepted'
       ORDER BY r.created_at DESC LIMIT 800`,
    )
    .all() as Record<string, unknown>[];

  const relations: KnowledgeRelation[] = relationRows
    .filter((row) => ids.has(String(row.source_entity_id)) && ids.has(String(row.target_entity_id)))
    .map((row) => ({
      id: String(row.relation_id),
      sourceId: String(row.source_entity_id),
      sourceName: String(row.source_name),
      targetId: String(row.target_entity_id),
      targetName: String(row.target_name),
      relationType: String(row.relation_type),
      paperId: String(row.paper_id),
      paperTitle: String(row.paper_title ?? ""),
      evidenceText: String(row.evidence_text ?? ""),
      evidenceLocation: String(row.evidence_location ?? ""),
      nature: row.nature as EvidenceNature,
      confidence: Number(row.confidence ?? 0.5),
      createdAt: String(row.created_at),
    }));

  return { entities, relations };
}

export function getRelationsForEntity(entityId: string): KnowledgeRelation[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*, s.name AS source_name, t.name AS target_name, p.title AS paper_title
       FROM knowledge_relations r
       JOIN knowledge_entities s ON s.entity_id = r.source_entity_id
       JOIN knowledge_entities t ON t.entity_id = r.target_entity_id
       JOIN papers p ON p.id = r.paper_id
       WHERE (r.source_entity_id = ? OR r.target_entity_id = ?) AND p.status='accepted'
       ORDER BY r.created_at DESC LIMIT 100`,
    )
    .all(entityId, entityId) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.relation_id),
    sourceId: String(row.source_entity_id),
    sourceName: String(row.source_name),
    targetId: String(row.target_entity_id),
    targetName: String(row.target_name),
    relationType: String(row.relation_type),
    paperId: String(row.paper_id),
    paperTitle: String(row.paper_title ?? ""),
    evidenceText: String(row.evidence_text ?? ""),
    evidenceLocation: String(row.evidence_location ?? ""),
    nature: row.nature as EvidenceNature,
    confidence: Number(row.confidence ?? 0.5),
    createdAt: String(row.created_at),
  }));
}

export function getEntityPapers(entityId: string, limit = 30): PaperRow[] {
  return getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS}
       FROM entity_paper_links l JOIN papers p ON p.id = l.paper_id
       WHERE l.entity_id = ? AND p.status = 'accepted'
       ORDER BY p.publication_date DESC LIMIT ?`,
    )
    .all(entityId, limit) as PaperRow[];
}

export function getRecentRelations(limit = 6): KnowledgeRelation[] {
  const rows = getDb()
    .prepare(
      `SELECT r.*, s.name AS source_name, t.name AS target_name, p.title AS paper_title
       FROM knowledge_relations r
       JOIN knowledge_entities s ON s.entity_id = r.source_entity_id
       JOIN knowledge_entities t ON t.entity_id = r.target_entity_id
       JOIN papers p ON p.id = r.paper_id
       WHERE p.status = 'accepted'
       ORDER BY r.created_at DESC LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: String(row.relation_id),
    sourceId: String(row.source_entity_id),
    sourceName: String(row.source_name),
    targetId: String(row.target_entity_id),
    targetName: String(row.target_name),
    relationType: String(row.relation_type),
    paperId: String(row.paper_id),
    paperTitle: String(row.paper_title ?? ""),
    evidenceText: String(row.evidence_text ?? ""),
    evidenceLocation: String(row.evidence_location ?? ""),
    nature: row.nature as EvidenceNature,
    confidence: Number(row.confidence ?? 0.5),
    createdAt: String(row.created_at),
  }));
}

export function countEntities(): number {
  return (getDb().prepare("SELECT COUNT(*) AS n FROM knowledge_entities").get() as { n: number }).n;
}

export interface EntityPaperLink {
  entityId: string;
  paperId: string;
  title: string;
  titleZh: string | null;
  publicationDate: string | null;
  qualityScore: number | null;
  role: string;
}

export function getEntityPaperLinks(limit = 1200): EntityPaperLink[] {
  const rows = getDb()
    .prepare(
      `SELECT l.entity_id, l.paper_id, l.role, p.title, p.title_zh, p.publication_date, p.quality_score
       FROM entity_paper_links l
       JOIN papers p ON p.id = l.paper_id AND p.status = 'accepted'
       ORDER BY p.publication_date DESC
       LIMIT ?`,
    )
    .all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    entityId: String(row.entity_id),
    paperId: String(row.paper_id),
    title: String(row.title),
    titleZh: (row.title_zh as string | null) ?? null,
    publicationDate: (row.publication_date as string | null) ?? null,
    qualityScore: row.quality_score == null ? null : Number(row.quality_score),
    role: String(row.role ?? "mentions"),
  }));
}

/* ─────────────────────────────────── Timeline ───────────────────────────── */

export function insertTimelineEvent(input: {
  eventDate: string;
  dateKind: "publication" | "first_report" | "validation";
  title: string;
  titleZh?: string | null;
  description?: string | null;
  category: string;
  paperId: string;
  evidenceText?: string | null;
  significance?: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO timeline_events
        (event_id, event_date, date_kind, title, title_zh, description, category, paper_id, evidence_text, significance, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(paper_id, title, date_kind) DO UPDATE SET
         event_date = excluded.event_date, description = excluded.description,
         significance = excluded.significance`,
    )
    .run(
      newId("evt"),
      input.eventDate,
      input.dateKind,
      input.title,
      input.titleZh ?? null,
      input.description ?? null,
      input.category,
      input.paperId,
      input.evidenceText ?? null,
      input.significance ?? 3,
      nowIso(),
    );
}

export function getTimelineEvents(filters: { year?: number; category?: string; limit?: number } = {}): TimelineEvent[] {
  const where = ["p.status = 'accepted'"];
  const params: unknown[] = [];
  if (filters.year) {
    where.push("substr(e.event_date, 1, 4) = ?");
    params.push(String(filters.year));
  }
  if (filters.category) {
    where.push("e.category = ?");
    params.push(filters.category);
  }
  params.push(filters.limit ?? 300);

  const rows = getDb()
    .prepare(
      `SELECT e.*, p.title AS paper_title
       FROM timeline_events e JOIN papers p ON p.id = e.paper_id
       WHERE ${where.join(" AND ")}
       ORDER BY e.event_date ASC LIMIT ?`,
    )
    .all(...params) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.event_id),
    eventDate: String(row.event_date),
    dateKind: row.date_kind as TimelineEvent["dateKind"],
    title: String(row.title),
    titleZh: (row.title_zh as string | null) ?? null,
    description: (row.description as string | null) ?? null,
    category: String(row.category),
    paperId: String(row.paper_id),
    paperTitle: String(row.paper_title ?? ""),
    significance: Number(row.significance ?? 3),
    evidenceText: (row.evidence_text as string | null) ?? null,
    createdAt: String(row.created_at),
  }));
}

export function getTimelineYears(): { year: string; count: number }[] {
  return getDb()
    .prepare(
      `SELECT substr(e.event_date,1,4) AS year, COUNT(*) AS count
       FROM timeline_events e JOIN papers p ON p.id = e.paper_id
       WHERE p.status='accepted' GROUP BY year ORDER BY year`,
    )
    .all() as { year: string; count: number }[];
}

export function getTimelineCategories(): { category: string; count: number }[] {
  return getDb()
    .prepare(
      `SELECT e.category, COUNT(*) AS count FROM timeline_events e
       JOIN papers p ON p.id = e.paper_id WHERE p.status='accepted'
       GROUP BY e.category ORDER BY count DESC`,
    )
    .all() as { category: string; count: number }[];
}

/* ─────────────────────────────── Weekly reports ─────────────────────────── */

export function upsertWeeklyReport(input: {
  weekStart: string;
  weekEnd: string;
  title: string;
  content: WeeklyReportContent | null;
  contentMd: string | null;
  citedPapers: string[];
  model: string | null;
  promptVersion: string | null;
  status: "draft" | "published" | "failed";
}): string {
  const db = getDb();
  const existing = db
    .prepare("SELECT report_id FROM weekly_reports WHERE week_start = ?")
    .get(input.weekStart) as { report_id: string } | undefined;
  const id = existing?.report_id ?? newId("wr");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO weekly_reports
      (report_id, week_start, week_end, title, content_json, content_md, cited_papers_json, model, prompt_version, status, generated_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_start) DO UPDATE SET
       week_end = excluded.week_end, title = excluded.title, content_json = excluded.content_json,
       content_md = excluded.content_md, cited_papers_json = excluded.cited_papers_json,
       model = excluded.model, prompt_version = excluded.prompt_version,
       status = excluded.status, generated_at = excluded.generated_at`,
  ).run(
    id,
    input.weekStart,
    input.weekEnd,
    input.title,
    input.content ? JSON.stringify(input.content) : null,
    input.contentMd,
    JSON.stringify(input.citedPapers),
    input.model,
    input.promptVersion,
    input.status,
    ts,
    ts,
  );
  return id;
}

function mapReport(row: Record<string, unknown>): WeeklyReport {
  return {
    id: String(row.report_id),
    weekStart: String(row.week_start),
    weekEnd: String(row.week_end),
    title: String(row.title),
    content: parseJson<WeeklyReportContent | null>(row.content_json as string, null),
    contentMd: (row.content_md as string | null) ?? null,
    citedPapers: parseJson<string[]>(row.cited_papers_json as string, []),
    model: (row.model as string | null) ?? null,
    promptVersion: (row.prompt_version as string | null) ?? null,
    status: row.status as WeeklyReport["status"],
    generatedAt: String(row.generated_at),
    paperCount: row.paper_count == null ? undefined : Number(row.paper_count),
  };
}

export function getWeeklyReport(reportId: string): WeeklyReport | null {
  const row = getDb().prepare("SELECT * FROM weekly_reports WHERE report_id = ?").get(reportId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapReport(row) : null;
}

export function getWeeklyReportByWeekStart(weekStart: string): WeeklyReport | null {
  const row = getDb()
    .prepare("SELECT * FROM weekly_reports WHERE week_start = ?")
    .get(weekStart) as Record<string, unknown> | undefined;
  return row ? mapReport(row) : null;
}

export function listWeeklyReports(limit = 24, month?: string): WeeklyReport[] {
  const db = getDb();
  const rows = month
    ? (db
        .prepare("SELECT * FROM weekly_reports WHERE week_start LIKE ? ORDER BY week_start DESC LIMIT ?")
        .all(`${month}%`, limit) as Record<string, unknown>[])
    : (db
        .prepare("SELECT * FROM weekly_reports ORDER BY week_start DESC LIMIT ?")
        .all(limit) as Record<string, unknown>[]);
  return rows.map(mapReport);
}

export function getLatestWeeklyReport(): WeeklyReport | null {
  const row = getDb()
    .prepare("SELECT * FROM weekly_reports ORDER BY week_start DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;
  return row ? mapReport(row) : null;
}

export function getWeeklyReportMonths(): string[] {
  const rows = getDb()
    .prepare("SELECT DISTINCT substr(week_start,1,7) AS month FROM weekly_reports ORDER BY month DESC")
    .all() as { month: string }[];
  return rows.map((row) => row.month);
}
