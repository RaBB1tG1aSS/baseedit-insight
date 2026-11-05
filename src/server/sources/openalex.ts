import type { RetractionStatus } from "@/lib/types";
import { normalizeDoi, normalizePmcid, normalizePmid, stripMarkup, toIsoDate } from "../utils/normalize";
import { fetchJson } from "./http";
import { nowStamp, type SourceRecord } from "./types";

interface OpenAlexWork {
  id: string;
  doi?: string | null;
  title?: string | null;
  display_name?: string | null;
  publication_date?: string | null;
  publication_year?: number;
  type?: string;
  cited_by_count?: number;
  is_retracted?: boolean;
  is_paratext?: boolean;
  ids?: { pmid?: string; pmcid?: string; openalex?: string; doi?: string };
  authorships?: { author?: { display_name?: string } }[];
  primary_location?: {
    source?: { display_name?: string | null; type?: string | null; issn_l?: string | null; issn?: string[] | null };
    license?: string | null;
    landing_page_url?: string | null;
    is_oa?: boolean;
  };
  open_access?: { is_oa?: boolean; oa_status?: string; oa_url?: string | null };
  keywords?: { display_name?: string }[];
  topics?: { display_name?: string }[];
  abstract_inverted_index?: Record<string, number[]> | null;
}

export function reconstructAbstract(index: Record<string, number[]> | null | undefined): string | null {
  if (!index) return null;
  const entries: [number, string][] = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const position of positions ?? []) entries.push([position, word]);
  }
  if (!entries.length) return null;
  entries.sort((a, b) => a[0] - b[0]);
  return entries.map((entry) => entry[1]).join(" ");
}

function idNumber(raw: string | undefined, pattern: RegExp): string | null {
  if (!raw) return null;
  const match = raw.match(pattern);
  return match ? match[0] : null;
}

export function mapOpenAlexWork(work: OpenAlexWork): SourceRecord {
  const doi = normalizeDoi(work.doi ?? work.ids?.doi);
  const title = stripMarkup(work.title ?? work.display_name ?? "");
  const journal = work.primary_location?.source?.display_name ?? null;
  const sourceType = (work.primary_location?.source?.type ?? "").toLowerCase();
  const type = (work.type ?? "").toLowerCase();

  let articleType = "Journal Article";
  if (type === "preprint") articleType = "Preprint";
  else if (type === "review") articleType = "Review";
  else if (type === "erratum") articleType = "Erratum";
  else if (type === "retraction") articleType = "Retraction of Publication";
  else if (type === "letter") articleType = "Letter";
  else if (type === "editorial") articleType = "Editorial";

  const isPreprint = type === "preprint" || sourceType === "repository";
  const peerReviewStatus = isPreprint ? "preprint" : sourceType === "journal" || type === "article" ? "peer_reviewed" : "unknown";

  let retractionStatus: RetractionStatus = "none";
  let retractionNote: string | null = null;
  if (work.is_retracted) {
    retractionStatus = "retracted";
    retractionNote = "OpenAlex: is_retracted = true";
  } else if (type === "retraction") {
    retractionStatus = "retracted";
    retractionNote = "OpenAlex: this record is a retraction";
  }

  return {
    source: "openalex",
    externalId: work.id.replace("https://openalex.org/", ""),
    url: work.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : work.id),
    doi,
    pmid: normalizePmid(idNumber(work.ids?.pmid, /\d+/)),
    pmcid: normalizePmcid(work.ids?.pmcid),
    openalexId: work.id.replace("https://openalex.org/", ""),
    title,
    authors: (work.authorships ?? [])
      .map((authorship) => authorship.author?.display_name ?? "")
      .filter(Boolean),
    journal,
    issn: work.primary_location?.source?.issn_l ?? work.primary_location?.source?.issn?.[0] ?? null,
    publicationDate: toIsoDate(work.publication_date) ?? (work.publication_year ? `${work.publication_year}-01-01` : null),
    onlinePublicationDate: null,
    articleType,
    abstract: reconstructAbstract(work.abstract_inverted_index),
    keywords: [
      ...(work.keywords ?? []).map((keyword) => keyword.display_name ?? ""),
      ...(work.topics ?? []).map((topic) => topic.display_name ?? ""),
    ].filter(Boolean).slice(0, 15),
    peerReviewStatus,
    publicationStatus:
      retractionStatus === "retracted" ? "retracted" : isPreprint ? "preprint" : "published",
    retractionStatus,
    retractionNote,
    fullTextAccessStatus: "unknown",
    fullTextUrl: null,
    license: work.primary_location?.license ?? null,
    citationCount: Number(work.cited_by_count ?? 0),
    retrievedAt: nowStamp(),
    raw: work,
  };
}

export async function lookupOpenAlexByDoi(doi: string, mailto?: string): Promise<SourceRecord | null> {
  const params = new URLSearchParams();
  if (mailto) params.set("mailto", mailto);
  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}${params.size ? `?${params.toString()}` : ""}`;
  try {
    const work = await fetchJson<OpenAlexWork>(url, { minIntervalMs: 120 });
    if (!work?.id) return null;
    const record = mapOpenAlexWork(work);
    return record.title ? record : null;
  } catch (error) {
    if (error instanceof Error && /HTTP 404/.test(error.message)) return null;
    throw error;
  }
}

export async function searchOpenAlex(options: {
  query: string;
  limit: number;
  since?: string;
  mailto?: string;
  mode?: "latest" | "landmark";
}): Promise<SourceRecord[]> {
  const params = new URLSearchParams({
    search: options.query,
    per_page: String(Math.min(50, options.limit)),
    sort: options.mode === "landmark" ? "cited_by_count:desc" : "publication_date:desc",
  });
  if (options.mailto) params.set("mailto", options.mailto);
  if (options.since) {
    params.set("filter", `from_publication_date:${options.since}`);
  }
  const response = await fetchJson<{ results?: OpenAlexWork[] }>(
    `https://api.openalex.org/works?${params.toString()}`,
    { minIntervalMs: 150 },
  );
  return (response.results ?? [])
    .map(mapOpenAlexWork)
    .filter((record) => Boolean(record.title));
}
