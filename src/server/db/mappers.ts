import type {
  FocusArea,
  FullTextStatus,
  Paper,
  PaperStatus,
  PaperSummary,
  PeerReviewStatus,
  PublicationStatus,
  RecommendationCategory,
  RetractionStatus,
  UserRecord,
} from "@/lib/types";

export type Row = Record<string, unknown>;

export function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== "string" || !text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" ? value : value == null ? null : Number(value);
}

export interface PaperRow extends Row {
  id: string;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  openalex_id: string | null;
  semantic_scholar_id: string | null;
  title: string;
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
  data_version: number;
  created_at: string;
  updated_at: string;
}

export function mapPaper(row: PaperRow): Paper {
  return {
    id: row.id,
    doi: row.doi,
    pmid: row.pmid,
    pmcid: row.pmcid,
    openalexId: row.openalex_id,
    semanticScholarId: row.semantic_scholar_id,
    title: row.title,
    titleZh: row.title_zh,
    authors: parseJson<string[]>(row.authors_json, []),
    journal: row.journal,
    publicationDate: row.publication_date,
    onlinePublicationDate: row.online_publication_date,
    articleType: row.article_type,
    abstract: row.abstract,
    keywords: parseJson<string[]>(row.keywords_json, []),
    officialUrl: row.official_url,
    peerReviewStatus: row.peer_review_status,
    publicationStatus: row.publication_status,
    retractionStatus: row.retraction_status,
    retractionNote: row.retraction_note,
    fullTextAccessStatus: row.full_text_access_status,
    fullTextLicense: row.full_text_license,
    qualityScore: num(row.quality_score),
    qualitySummary: row.quality_summary,
    recommendationCategory: row.recommendation_category,
    focusAreas: parseJson<FocusArea[]>(row.focus_areas_json, []),
    citationCount: Number(row.citation_count ?? 0),
    status: row.status,
    verifiedAt: str(row.verified_at),
    needsAnalysisRefresh: Boolean(row.needs_analysis_refresh),
    dataVersion: Number(row.data_version ?? 1),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapPaperSummary(row: PaperRow & { user_favorite?: unknown }): PaperSummary & {
  userRecord?: UserRecord | null;
} {
  const summary: PaperSummary = {
    id: row.id,
    title: row.title,
    titleZh: row.title_zh,
    authors: parseJson<string[]>(row.authors_json, []),
    journal: row.journal,
    publicationDate: row.publication_date,
    articleType: row.article_type,
    peerReviewStatus: row.peer_review_status,
    retractionStatus: row.retraction_status,
    qualityScore: num(row.quality_score),
    recommendationCategory: row.recommendation_category,
    focusAreas: parseJson<FocusArea[]>(row.focus_areas_json, []),
    status: row.status,
    citationCount: Number(row.citation_count ?? 0),
    fullTextAccessStatus: row.full_text_access_status,
  };

  const hasUserJoins = "user_favorite" in row || "u_favorite" in row;
  if (!hasUserJoins) return summary;

  const favorite = row.user_favorite ?? row.u_favorite;
  const readStatus = row.user_read_status ?? row.u_read_status;
  return {
    ...summary,
    userRecord: {
      paperId: row.id,
      favorite: Boolean(favorite),
      readStatus: (readStatus as UserRecord["readStatus"]) || "unread",
      readingProgress: Number(row.user_reading_progress ?? 0),
      note: String(row.user_note ?? ""),
      lastOpenedAt: (row.user_last_opened_at as string | null) ?? null,
      updatedAt: String(row.user_updated_at ?? ""),
    },
  };
}

export const PAPER_COLUMNS = `
  p.id, p.doi, p.pmid, p.pmcid, p.openalex_id, p.semantic_scholar_id,
  p.title, p.title_zh, p.authors_json, p.journal, p.publication_date,
  p.online_publication_date, p.article_type, p.abstract, p.keywords_json,
  p.official_url, p.peer_review_status, p.publication_status, p.retraction_status,
  p.retraction_note, p.full_text_access_status, p.full_text_license, p.quality_score,
  p.quality_summary, p.recommendation_category, p.focus_areas_json, p.citation_count,
  p.status, p.verified_at, p.needs_analysis_refresh, p.data_version, p.created_at, p.updated_at
`;

export function mapUserRecord(row: Row): UserRecord {
  return {
    paperId: String(row.paper_id),
    favorite: Boolean(row.favorite),
    readStatus: row.read_status as UserRecord["readStatus"],
    readingProgress: Number(row.reading_progress ?? 0),
    note: String(row.note ?? ""),
    lastOpenedAt: (row.last_opened_at as string | null) ?? null,
    updatedAt: String(row.updated_at ?? ""),
  };
}
