import type {
  FocusArea,
  FullTextStatus,
  Paper,
  PaperSearchResult,
  PaperStatus,
  PaperSummary,
  PeerReviewStatus,
  PublicationStatus,
  RecommendationCategory,
  RetractionStatus,
  SearchFilters,
  UserRecord,
} from "@/lib/types";
import { getDb, newId, nowIso, todayInZone } from "../client";
import { env } from "../../env";
import {
  PAPER_COLUMNS,
  mapPaper,
  mapPaperSummary,
  mapUserRecord,
  parseJson,
  type PaperRow,
} from "../mappers";
import { escapeLike, normalizeDoi, titleKey } from "../../utils/normalize";
import { FOCUS_LABEL } from "@/lib/constants";

export interface PaperInput {
  id?: string;
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  openalexId?: string | null;
  semanticScholarId?: string | null;
  title: string;
  titleZh?: string | null;
  authors?: string[];
  journal?: string | null;
  publicationDate?: string | null;
  onlinePublicationDate?: string | null;
  articleType?: string | null;
  abstract?: string | null;
  keywords?: string[];
  officialUrl?: string | null;
  peerReviewStatus?: PeerReviewStatus;
  publicationStatus?: PublicationStatus;
  retractionStatus?: RetractionStatus;
  retractionNote?: string | null;
  fullTextAccessStatus?: FullTextStatus;
  fullTextLicense?: string | null;
  qualityScore?: number | null;
  qualitySummary?: string | null;
  recommendationCategory?: RecommendationCategory | null;
  focusAreas?: FocusArea[];
  citationCount?: number;
  status?: PaperStatus;
  verifiedAt?: string | null;
}

export type PaperPatch = Partial<{
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  openalex_id: string | null;
  semantic_scholar_id: string | null;
  title: string;
  title_key: string;
  title_zh: string | null;
  authors_json: string;
  journal: string | null;
  publication_date: string | null;
  online_publication_date: string | null;
  article_type: string | null;
  abstract: string | null;
  keywords_json: string;
  official_url: string | null;
  peer_review_status: PeerReviewStatus;
  publication_status: PublicationStatus;
  retraction_status: RetractionStatus;
  retraction_note: string | null;
  full_text_access_status: FullTextStatus;
  full_text_license: string | null;
  quality_score: number | null;
  quality_summary: string | null;
  recommendation_category: RecommendationCategory | null;
  focus_areas_json: string;
  citation_count: number;
  status: PaperStatus;
  verified_at: string | null;
  needs_analysis_refresh: number;
}>;

const VERSIONED_FIELDS = new Set([
  "title",
  "doi",
  "journal",
  "publication_date",
  "publication_status",
  "peer_review_status",
  "retraction_status",
]);

export function getPaperById(id: string): Paper | null {
  const row = getDb()
    .prepare(`SELECT ${PAPER_COLUMNS} FROM papers p WHERE p.id = ?`)
    .get(id) as PaperRow | undefined;
  return row ? mapPaper(row) : null;
}

/** The only read path the rest of the app may use for "official" papers. */
export function getAcceptedPaperById(id: string): Paper | null {
  const row = getDb()
    .prepare(`SELECT ${PAPER_COLUMNS} FROM papers p WHERE p.id = ? AND p.status = 'accepted'`)
    .get(id) as PaperRow | undefined;
  return row ? mapPaper(row) : null;
}

export function findPaperByExternalIds(input: {
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  openalexId?: string | null;
  titleKey?: string | null;
}): Paper | null {
  const clauses: string[] = [];
  const params: (string | null)[] = [];
  if (input.doi) {
    clauses.push("p.doi = ?");
    params.push(normalizeDoi(input.doi));
  }
  if (input.pmid) {
    clauses.push("p.pmid = ?");
    params.push(input.pmid);
  }
  if (input.pmcid) {
    clauses.push("p.pmcid = ?");
    params.push(input.pmcid);
  }
  if (input.openalexId) {
    clauses.push("p.openalex_id = ?");
    params.push(input.openalexId);
  }
  if (input.titleKey) {
    clauses.push("p.title_key = ?");
    params.push(input.titleKey);
  }
  if (!clauses.length) return null;

  const row = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p WHERE (${clauses.join(" OR ")})
       ORDER BY CASE p.status WHEN 'accepted' THEN 0 WHEN 'metadata_verified' THEN 1 ELSE 2 END
       LIMIT 1`,
    )
    .get(...params) as PaperRow | undefined;
  return row ? mapPaper(row) : null;
}

export function insertPaper(input: PaperInput): Paper {
  const db = getDb();
  const id = input.id ?? newId("pap");
  const ts = nowIso();
  db.prepare(
    `INSERT INTO papers (
      id, doi, pmid, pmcid, openalex_id, semantic_scholar_id, title, title_key, title_zh,
      authors_json, journal, publication_date, online_publication_date, article_type,
      abstract, keywords_json, official_url, peer_review_status, publication_status,
      retraction_status, retraction_note, full_text_access_status, full_text_license,
      quality_score, quality_summary, recommendation_category, focus_areas_json,
      citation_count, status, verified_at, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )`,
  ).run(
    id,
    normalizeDoi(input.doi),
    input.pmid ?? null,
    input.pmcid ?? null,
    input.openalexId ?? null,
    input.semanticScholarId ?? null,
    input.title,
    titleKey(input.title),
    input.titleZh ?? null,
    JSON.stringify(input.authors ?? []),
    input.journal ?? null,
    input.publicationDate ?? null,
    input.onlinePublicationDate ?? null,
    input.articleType ?? null,
    input.abstract ?? null,
    JSON.stringify(input.keywords ?? []),
    input.officialUrl ?? null,
    input.peerReviewStatus ?? "unknown",
    input.publicationStatus ?? "unknown",
    input.retractionStatus ?? "unknown",
    input.retractionNote ?? null,
    input.fullTextAccessStatus ?? "unknown",
    input.fullTextLicense ?? null,
    input.qualityScore ?? null,
    input.qualitySummary ?? null,
    input.recommendationCategory ?? null,
    JSON.stringify(input.focusAreas ?? []),
    input.citationCount ?? 0,
    input.status ?? "discovered",
    input.verifiedAt ?? null,
    ts,
    ts,
  );
  return getPaperById(id)!;
}

/**
 * Field-level update. Every changed field is recorded in paper_change_log and
 * metadata changes bump data_version so AI artefacts can be flagged stale.
 */
export function updatePaper(
  id: string,
  patch: PaperPatch,
  reason: string,
): { changed: string[]; versionBumped: boolean } {
  const db = getDb();
  const current = db.prepare("SELECT * FROM papers WHERE id = ?").get(id) as
    | Record<string, unknown>
    | undefined;
  if (!current) throw new Error(`paper not found: ${id}`);

  const keys = Object.keys(patch).filter((key) => patch[key as keyof PaperPatch] !== undefined);
  if (!keys.length) return { changed: [], versionBumped: false };

  const changed: string[] = [];
  const ts = nowIso();
  for (const key of keys) {
    const next = patch[key as keyof PaperPatch];
    const previous = current[key];
    if (String(previous ?? "") !== String(next ?? "")) {
      changed.push(key);
      db.prepare(
        `INSERT INTO paper_change_log (paper_id, field, old_value, new_value, changed_at, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(id, key, previous == null ? null : String(previous), next == null ? null : String(next), ts, reason);
    }
  }

  if (!changed.length) return { changed: [], versionBumped: false };

  const versionBumped = changed.some((key) => VERSIONED_FIELDS.has(key));
  const assignments = changed.map((key) => `${key} = ?`).join(", ");
  const values = changed.map((key) => patch[key as keyof PaperPatch] ?? null);
  db.prepare(
    `UPDATE papers SET ${assignments}, updated_at = ?${versionBumped ? ", data_version = data_version + 1" : ""}
     WHERE id = ?`,
  ).run(...values, ts, id);

  return { changed, versionBumped };
}

export function setPaperStatus(id: string, status: PaperStatus): void {
  getDb()
    .prepare("UPDATE papers SET status = ?, updated_at = ? WHERE id = ?")
    .run(status, nowIso(), id);
}

export function markAnalysesNeedRefresh(id: string): void {
  getDb()
    .prepare("UPDATE papers SET needs_analysis_refresh = 1, updated_at = ? WHERE id = ?")
    .run(nowIso(), id);
}

export function clearAnalysesNeedRefresh(id: string): void {
  getDb()
    .prepare("UPDATE papers SET needs_analysis_refresh = 0, updated_at = ? WHERE id = ?")
    .run(nowIso(), id);
}

function buildSearchWhere(filters: SearchFilters): { where: string; params: unknown[] } {
  const where: string[] = ["p.status = 'accepted'"];
  const params: unknown[] = [];

  if (filters.q) {
    const like = `%${escapeLike(filters.q)}%`;
    where.push(`(
      p.title LIKE ? ESCAPE '\\' OR p.title_zh LIKE ? ESCAPE '\\' OR p.abstract LIKE ? ESCAPE '\\'
      OR p.authors_json LIKE ? ESCAPE '\\' OR p.journal LIKE ? ESCAPE '\\'
      OR p.keywords_json LIKE ? ESCAPE '\\' OR p.doi LIKE ? ESCAPE '\\'
    )`);
    params.push(like, like, like, like, like, like, like);
  }
  if (filters.author) {
    where.push(`p.authors_json LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(filters.author)}%`);
  }
  if (filters.doi) {
    where.push("p.doi = ?");
    params.push(normalizeDoi(filters.doi));
  }
  if (filters.year) {
    where.push("substr(p.publication_date, 1, 4) = ?");
    params.push(String(filters.year));
  }
  if (filters.journal) {
    where.push(`p.journal LIKE ? ESCAPE '\\'`);
    params.push(`%${escapeLike(filters.journal)}%`);
  }
  if (filters.focusArea) {
    where.push(`p.focus_areas_json LIKE ?`);
    params.push(`%"${filters.focusArea}"%`);
  }
  if (filters.category) {
    where.push("p.recommendation_category = ?");
    params.push(filters.category);
  }
  if (filters.minScore != null) {
    where.push("p.quality_score >= ?");
    params.push(filters.minScore);
  }
  if (filters.favorite) {
    where.push("COALESCE(u.favorite, 0) = 1");
  }
  if (filters.readStatus) {
    where.push("COALESCE(u.read_status, 'unread') = ?");
    params.push(filters.readStatus);
  }

  return { where: where.join(" AND "), params };
}

function orderBy(sort: SearchFilters["sort"]): string {
  switch (sort) {
    case "date":
      return "p.publication_date DESC NULLS LAST, p.quality_score DESC";
    case "citations":
      return "p.citation_count DESC, p.quality_score DESC";
    case "added":
      return "p.created_at DESC";
    case "score":
    default:
      return "p.quality_score IS NULL, p.quality_score DESC, p.publication_date DESC";
  }
}

export function searchAcceptedPapers(filters: SearchFilters): PaperSearchResult {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const { where, params } = buildSearchWhere(filters);

  const total = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM papers p
         LEFT JOIN user_records u ON u.paper_id = p.id
         WHERE ${where}`,
      )
      .get(...params) as { n: number }
  ).n;

  const rows = db
    .prepare(
      `SELECT ${PAPER_COLUMNS},
        u.favorite AS user_favorite, u.read_status AS user_read_status,
        u.reading_progress AS user_reading_progress, u.note AS user_note,
        u.last_opened_at AS user_last_opened_at, u.updated_at AS user_updated_at
       FROM papers p
       LEFT JOIN user_records u ON u.paper_id = p.id
       WHERE ${where}
       ORDER BY ${orderBy(filters.sort)}
       LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize) as PaperRow[];

  return {
    papers: rows.map((row) => mapPaperSummary(row)),
    total,
    page,
    pageSize,
  };
}

export interface CandidateRow {
  paper: Paper;
  verificationCount: number;
  lastCheckedAt: string | null;
  sources: string[];
}

export function listCandidates(options: {
  statuses?: PaperStatus[];
  limit?: number;
  offset?: number;
  q?: string;
} = {}): CandidateRow[] {
  const db = getDb();
  const statuses = options.statuses ?? ["discovered", "candidate", "metadata_verified", "quality_assessed", "needs_review", "rejected"];
  const placeholders = statuses.map(() => "?").join(",");
  const params: unknown[] = [...statuses];
  let extra = "";
  if (options.q) {
    extra = " AND (p.title LIKE ? OR p.doi LIKE ? OR p.authors_json LIKE ?)";
    const like = `%${escapeLike(options.q)}%`;
    params.push(like, like, like);
  }
  params.push(Math.min(200, options.limit ?? 60), options.offset ?? 0);

  const rows = db
    .prepare(
      `SELECT ${PAPER_COLUMNS},
        (SELECT COUNT(*) FROM verification_records v WHERE v.paper_id = p.id) AS verification_count,
        (SELECT MAX(v.checked_at) FROM verification_records v WHERE v.paper_id = p.id) AS last_checked_at,
        (SELECT GROUP_CONCAT(s.source_name) FROM sources s WHERE s.paper_id = p.id) AS source_names
       FROM papers p
       WHERE p.status IN (${placeholders})${extra}
       ORDER BY p.created_at DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...params) as (PaperRow & {
    verification_count: number;
    last_checked_at: string | null;
    source_names: string | null;
  })[];

  return rows.map((row) => ({
    paper: mapPaper(row),
    verificationCount: Number(row.verification_count ?? 0),
    lastCheckedAt: row.last_checked_at,
    sources: (row.source_names ?? "").split(",").filter(Boolean),
  }));
}

export function countByStatus(): Record<string, number> {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM papers GROUP BY status")
    .all() as { status: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

export function getPapersForReport(startIso: string, endIso: string): Paper[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted' AND p.verified_at >= ? AND p.verified_at < ?
       ORDER BY p.quality_score DESC`,
    )
    .all(startIso, endIso) as PaperRow[];
  return rows.map(mapPaper);
}

export function getNewlyPublishedPapers(startDate: string, endDate: string): Paper[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted' AND p.publication_date >= ? AND p.publication_date <= ?
       ORDER BY p.publication_date DESC`,
    )
    .all(startDate, endDate) as PaperRow[];
  return rows.map(mapPaper);
}

/** Historical papers that entered the verified corpus during the window. */
export function getNewlyRetrievedPapers(startIso: string, endIso: string, weekStart: string): Paper[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted' AND p.created_at >= ? AND p.created_at < ?
         AND (p.publication_date IS NULL OR p.publication_date < ?)
       ORDER BY p.created_at DESC`,
    )
    .all(startIso, endIso, weekStart) as PaperRow[];
  return rows.map(mapPaper);
}

export function getRecentAccepted(limit = 12): Paper[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted'
       ORDER BY COALESCE(p.verified_at, p.created_at) DESC
       LIMIT ?`,
    )
    .all(limit) as PaperRow[];
  return rows.map(mapPaper);
}

export function getAcceptedPapersWithoutRecommendation(): Paper[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted'
         AND p.id NOT IN (SELECT paper_id FROM daily_recommendations)
         AND p.retraction_status NOT IN ('retracted')
       ORDER BY p.quality_score DESC`,
    )
    .all() as PaperRow[];
  return rows.map(mapPaper);
}

export function getRecommendationHistory(limit = 10): {  date: string;
  paperId: string;
  title: string;
  titleZh: string | null;
  recType: RecommendationCategory;
  score: number;
}[] {
  return getDb()
    .prepare(
      `SELECT r.rec_date AS date, r.paper_id AS paperId, p.title, p.title_zh AS titleZh,
              r.rec_type AS recType, r.score
       FROM daily_recommendations r JOIN papers p ON p.id = r.paper_id
       ORDER BY r.rec_date DESC LIMIT ?`,
    )
    .all(limit) as {
    date: string;
    paperId: string;
    title: string;
    titleZh: string | null;
    recType: RecommendationCategory;
    score: number;
  }[];
}

export function getPapersPendingStatusWatch(olderThanIso: string, limit = 10): Paper[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted'
         AND (p.verified_at IS NULL OR p.verified_at < ?)
         AND NOT EXISTS (
           SELECT 1 FROM verification_records v
           WHERE v.paper_id = p.id AND v.check_item = '状态复查' AND v.checked_at >= ?
         )
       ORDER BY p.verified_at ASC NULLS FIRST
       LIMIT ?`,
    )
    .all(olderThanIso, olderThanIso, limit) as PaperRow[];
  return rows.map(mapPaper);
}

export function getPaperTitles(ids: string[]): Map<string, { title: string; titleZh: string | null }> {
  if (!ids.length) return new Map();
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT id, title, title_zh FROM papers WHERE id IN (${placeholders})`)
    .all(...ids) as { id: string; title: string; title_zh: string | null }[];
  return new Map(rows.map((r) => [r.id, { title: r.title, titleZh: r.title_zh }]));
}

export function getAllAcceptedForGraph(limit = 400): Paper[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p WHERE p.status='accepted'
       ORDER BY p.publication_date DESC LIMIT ?`,
    )
    .all(limit) as PaperRow[];
  return rows.map(mapPaper);
}

export function getUserPaperSummary(paperId: string): (UserRecord | null) {
  const row = getDb().prepare("SELECT * FROM user_records WHERE paper_id = ?").get(paperId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUserRecord(row) : null;
}

export function todayForFilters(): string {
  return todayInZone(env.timezone);
}

/** Integrity helper: returns groups of suspicious duplicate papers. */
export function findDuplicateCandidates(limit = 2000): Paper[][] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p ORDER BY p.created_at DESC LIMIT ?`,
    )
    .all(limit) as PaperRow[];
  const papers = rows.map(mapPaper);
  const groups = new Map<string, Paper[]>();
  for (const paper of papers) {
    const key = titleKey(paper.title);
    const list = groups.get(key) ?? [];
    list.push(paper);
    groups.set(key, list);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

export function paperTitleMapFromIds(ids: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, value] of getPaperTitles(ids)) map.set(id, value.title);
  return map;
}

export function parseStoredJson(text: string | null | undefined): unknown {
  return parseJson(text, null);
}

export function getPublicationYears(): { year: string; count: number }[] {
  return getDb()
    .prepare(
      `SELECT substr(publication_date, 1, 4) AS year, COUNT(*) AS count
       FROM papers
       WHERE status = 'accepted' AND publication_date IS NOT NULL
       GROUP BY year ORDER BY year DESC`,
    )
    .all() as { year: string; count: number }[];
}

export function getTopJournals(limit = 10): { journal: string; count: number }[] {
  return getDb()
    .prepare(
      `SELECT journal, COUNT(*) AS count FROM papers
       WHERE status = 'accepted' AND journal IS NOT NULL AND journal <> ''
       GROUP BY journal ORDER BY count DESC, journal ASC LIMIT ?`,
    )
    .all(limit) as { journal: string; count: number }[];
}

export interface RelatedPaper {
  paper: PaperSummary;
  basis: "shared_entities" | "same_focus";
  shared: string[];
}

export function getRelatedPapers(paperId: string, limit = 6): RelatedPaper[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT ${PAPER_COLUMNS},
         COUNT(DISTINCT l1.entity_id) AS shared_count,
         GROUP_CONCAT(DISTINCT e.name) AS shared_names
       FROM entity_paper_links l1
       JOIN entity_paper_links l2 ON l2.entity_id = l1.entity_id AND l2.paper_id <> l1.paper_id
       JOIN papers p ON p.id = l2.paper_id AND p.status = 'accepted'
       JOIN knowledge_entities e ON e.entity_id = l1.entity_id
       WHERE l1.paper_id = ?
       GROUP BY p.id
       ORDER BY shared_count DESC, p.quality_score DESC
       LIMIT ?`,
    )
    .all(paperId, limit) as (PaperRow & { shared_count: number; shared_names: string | null })[];

  if (rows.length) {
    return rows.map((row) => ({
      paper: mapPaperSummary(row),
      basis: "shared_entities",
      shared: (row.shared_names ?? "").split(",").filter(Boolean),
    }));
  }

  const paper = getPaperById(paperId);
  if (!paper?.focusAreas.length) return [];

  const fallbackRows = db
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted' AND p.id <> ?
         AND (${paper.focusAreas.map(() => "p.focus_areas_json LIKE ?").join(" OR ")})
       ORDER BY p.quality_score DESC
       LIMIT ?`,
    )
    .all(paperId, ...paper.focusAreas.map((area) => `%"${area}"%`), limit) as PaperRow[];

  return fallbackRows.map((row) => ({
    paper: mapPaperSummary(row),
    basis: "same_focus",
    shared: [],
  }));
}

export interface FeaturedTracks {
  latest: PaperSummary[];
  landmark: PaperSummary[];
}

/** Two visual recommendation tracks for the P0 console. */
export function getFeaturedTracks(limit = 5): FeaturedTracks {
  const db = getDb();
  const latestRows = db
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted' AND p.publication_date IS NOT NULL
       ORDER BY p.publication_date DESC, p.quality_score DESC
       LIMIT ?`,
    )
    .all(limit) as PaperRow[];

  const latestIds = new Set(latestRows.map((row) => row.id));
  const cutoffYear = new Date().getFullYear() - 3;
  const landmarkRows = db
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted'
         AND p.publication_date IS NOT NULL
         AND p.publication_date <= ?
       ORDER BY p.citation_count DESC, p.quality_score DESC
       LIMIT ?`,
    )
    .all(`${cutoffYear}-12-31`, limit * 3) as PaperRow[];

  const landmark = landmarkRows
    .filter((row) => !latestIds.has(row.id))
    .slice(0, limit)
    .map(mapPaperSummary);

  return { latest: latestRows.map(mapPaperSummary), landmark };
}

/** Accepted papers that do not yet have a successful deep read. */
export function getAcceptedWithoutDeepRead(limit = 8): PaperSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted'
         AND NOT EXISTS (
           SELECT 1 FROM ai_analyses a
           WHERE a.paper_id = p.id AND a.kind = 'deep_read' AND a.status = 'succeeded'
         )
       ORDER BY p.quality_score DESC
       LIMIT ?`,
    )
    .all(limit) as PaperRow[];
  return rows.map(mapPaperSummary);
}

export interface PersonalizedRecommendations {
  basis: "history" | "quality";
  topAreas: string[];
  items: { paper: PaperSummary; reason: string; affinity: number }[];
}

/**
 * P2 personalised recommendations derived only from the user's own reading
 * history (favourites, read status, notes, opens) and focus-area affinity.
 */
export function getPersonalizedRecommendations(limit = 5): PersonalizedRecommendations {
  const db = getDb();
  const history = db
    .prepare(
      `SELECT u.paper_id, u.favorite, u.read_status, u.note, u.last_opened_at, p.focus_areas_json
       FROM user_records u JOIN papers p ON p.id = u.paper_id
       WHERE p.status = 'accepted'`,
    )
    .all() as {
    paper_id: string;
    favorite: number;
    read_status: string;
    note: string;
    last_opened_at: string | null;
    focus_areas_json: string;
  }[];

  const areaWeights = new Map<FocusArea, number>();
  const seen = new Set<string>();

  for (const record of history) {
    seen.add(record.paper_id);
    const weight =
      1 +
      (record.favorite ? 2 : 0) +
      (record.read_status === "read" ? 1 : 0) +
      (record.note ? 1 : 0) +
      (record.last_opened_at ? 0.5 : 0);
    for (const area of parseJson<FocusArea[]>(record.focus_areas_json, [])) {
      areaWeights.set(area, (areaWeights.get(area) ?? 0) + weight);
    }
  }

  const topAreas = [...areaWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([area]) => FOCUS_LABEL[area]);

  const rows = db
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted'
       ORDER BY p.quality_score DESC`,
    )
    .all() as PaperRow[];

  const items = rows
    .map(mapPaperSummary)
    .filter((paper) => !seen.has(paper.id))
    .map((paper) => {
      const affinity = paper.focusAreas.reduce((sum, area) => sum + (areaWeights.get(area) ?? 0), 0);
      return {
        paper,
        affinity,
        reason:
          affinity > 0
            ? `与你常读的「${paper.focusAreas
                .filter((area) => (areaWeights.get(area) ?? 0) > 0)
                .map((area) => FOCUS_LABEL[area])
                .join("、")}」方向相近 · 综合评分 ${paper.qualityScore ?? "—"}`
            : `按综合评分推荐 · ${paper.journal ?? "未知期刊"}`,
      };
    })
    .sort((a, b) => {
      const scoreA = (a.paper.qualityScore ?? 0) + a.affinity * 1.5;
      const scoreB = (b.paper.qualityScore ?? 0) + b.affinity * 1.5;
      return scoreB - scoreA;
    })
    .slice(0, limit);

  return {
    basis: history.length ? "history" : "quality",
    topAreas,
    items,
  };
}
