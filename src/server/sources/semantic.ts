import { normalizeDoi, normalizePmid, stripMarkup } from "../utils/normalize";
import { fetchJson } from "./http";
import { nowStamp, type SourceRecord } from "./types";

interface S2Paper {
  paperId?: string;
  externalIds?: { DOI?: string; PubMed?: string; ArXiv?: string };
  title?: string;
  abstract?: string;
  venue?: string;
  year?: number;
  publicationDate?: string;
  citationCount?: number;
  influentialCitationCount?: number;
  publicationTypes?: string[];
  openAccessPdf?: { url?: string; status?: string } | null;
  authors?: { name?: string }[];
}

export async function lookupSemanticScholarByDoi(
  doi: string,
  apiKey?: string,
): Promise<SourceRecord | null> {
  const fields = [
    "paperId",
    "externalIds",
    "title",
    "abstract",
    "venue",
    "year",
    "publicationDate",
    "citationCount",
    "influentialCitationCount",
    "publicationTypes",
    "openAccessPdf",
    "authors",
  ].join(",");
  const url = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doi)}?fields=${fields}`;
  try {
    const response = await fetchJson<S2Paper>(url, {
      headers: apiKey ? { "x-api-key": apiKey } : {},
      minIntervalMs: 1000,
    });
    if (!response?.title) return null;
    const publicationTypes = response.publicationTypes ?? [];
    const isPreprint = publicationTypes.some((type) => /preprint/i.test(type));

    return {
      source: "semantic_scholar",
      externalId: response.paperId ?? doi,
      url: `https://www.semanticscholar.org/paper/${response.paperId ?? ""}`,
      doi: normalizeDoi(response.externalIds?.DOI ?? doi),
      pmid: normalizePmid(response.externalIds?.PubMed),
      pmcid: null,
      openalexId: null,
      title: stripMarkup(response.title),
      authors: (response.authors ?? []).map((author) => author.name ?? "").filter(Boolean),
      journal: response.venue ?? null,
      publicationDate: response.publicationDate ?? (response.year ? `${response.year}-01-01` : null),
      onlinePublicationDate: null,
      articleType: isPreprint ? "Preprint" : "Journal Article",
      abstract: response.abstract ?? null,
      keywords: [],
      peerReviewStatus: isPreprint ? "preprint" : "peer_reviewed",
      publicationStatus: isPreprint ? "preprint" : "published",
      retractionStatus: "unknown",
      retractionNote: null,
      fullTextAccessStatus: response.openAccessPdf?.url ? "abstract_only" : "unknown",
      fullTextUrl: response.openAccessPdf?.url ?? null,
      license: null,
      citationCount: Number(response.citationCount ?? 0),
      retrievedAt: nowStamp(),
      raw: response,
    };
  } catch (error) {
    if (error instanceof Error && /HTTP 404/.test(error.message)) return null;
    throw error;
  }
}
