import type {
  FullTextStatus,
  PeerReviewStatus,
  PublicationStatus,
  RetractionStatus,
} from "@/lib/types";

export type SourceName = "europepmc" | "pubmed" | "crossref" | "openalex" | "semantic_scholar";

export interface SourceRecord {
  source: SourceName;
  /** Identifier unique within the source. */
  externalId: string;
  url: string;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  openalexId: string | null;
  title: string;
  authors: string[];
  journal: string | null;
  issn?: string | null;
  publicationDate: string | null;
  onlinePublicationDate: string | null;
  articleType: string | null;
  abstract: string | null;
  keywords: string[];
  peerReviewStatus: PeerReviewStatus;
  publicationStatus: PublicationStatus;
  retractionStatus: RetractionStatus;
  retractionNote: string | null;
  fullTextAccessStatus: FullTextStatus;
  fullTextUrl: string | null;
  license: string | null;
  citationCount: number;
  retrievedAt: string;
  raw: unknown;
}

export interface SearchOptions {
  query: string;
  limit: number;
  /** ISO date (YYYY-MM-DD) — discovery window start. */
  since?: string;
  mode?: "latest" | "landmark";
  mailto?: string;
  apiKey?: string;
}

export interface SearchResult {
  record: SourceRecord;
}

export interface SearchAdapter {
  name: SourceName;
  enabled(): boolean;
  search(options: SearchOptions): Promise<SourceRecord[]>;
}

export const EXCLUDED_ARTICLE_TYPES = [
  "retraction notice",
  "retraction of publication",
  "erratum",
  "published erratum",
  "correction",
  "comment",
  "editorial",
  "news",
  "letter",
  "reply",
  "expression of concern",
];

export function isRetractionNotice(articleType: string | null | undefined): boolean {
  if (!articleType) return false;
  const value = articleType.toLowerCase();
  return value.includes("retraction of publication") || value.includes("retraction notice") || value.includes("erratum");
}

export function pickArticleType(pubTypes: string[]): string | null {
  const normalized = pubTypes.map((type) => type.trim()).filter(Boolean);
  const find = (needle: string) =>
    normalized.find((type) => type.toLowerCase() === needle.toLowerCase());

  const priority = [
    "Retraction of Publication",
    "Published Erratum",
    "Expression of Concern",
    "Clinical Trial",
    "Randomized Controlled Trial",
    "Review",
    "Systematic Review",
    "Meta-Analysis",
    "Preprint",
    "Journal Article",
  ];
  for (const candidate of priority) {
    const hit = find(candidate);
    if (hit) return hit;
  }
  return normalized[0] ?? null;
}

export function classifyPeerReview(pubTypes: string[], journal: string | null): PeerReviewStatus {
  const lower = pubTypes.map((type) => type.toLowerCase());
  if (lower.some((type) => type.includes("preprint"))) return "preprint";
  if (journal && /biorxiv|medrxiv|research square|arxiv|ssrn|preprints\.org/i.test(journal)) {
    return "preprint";
  }
  if (lower.some((type) => type.includes("journal article") || type.includes("review"))) {
    return "peer_reviewed";
  }
  return "unknown";
}

export const nowStamp = (): string => new Date().toISOString();
