import type { RetractionStatus } from "@/lib/types";
import { normalizeDoi, stripMarkup, toIsoDate } from "../utils/normalize";
import { fetchJson } from "./http";
import { classifyPeerReview, nowStamp, type SourceRecord } from "./types";

interface CrossrefAuthor {
  given?: string;
  family?: string;
  name?: string;
}

interface CrossrefWork {
  DOI: string;
  title?: string[];
  author?: CrossrefAuthor[];
  "container-title"?: string[];
  published?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  type?: string;
  subtype?: string;
  "is-referenced-by-count"?: number;
  license?: { URL?: string; "content-version"?: string }[];
  abstract?: string;
  subject?: string[];
  "update-to"?: { DOI?: string; type?: string; label?: string }[];
  URL?: string;
  "update-policy"?: unknown;
}

function dateParts(input?: { "date-parts"?: number[][] }): string | null {
  const parts = input?.["date-parts"]?.[0];
  if (!parts || !parts.length) return null;
  const [year, month = 1, day = 1] = parts;
  if (!year) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function mapCrossrefWork(work: CrossrefWork): SourceRecord {
  const doi = normalizeDoi(work.DOI);
  const title = stripMarkup(work.title?.[0] ?? "");
  const journal = stripMarkup(work["container-title"]?.[0] ?? "") || null;
  const type = (work.type ?? "").toLowerCase();
  const subtype = (work.subtype ?? "").toLowerCase();

  let articleType: string | null = "Journal Article";
  if (type === "posted-content") articleType = "Preprint";
  else if (subtype === "retraction" || (work.title?.[0] ?? "").toLowerCase().startsWith("retraction")) {
    articleType = "Retraction of Publication";
  } else if (type === "book-chapter") articleType = "Book Chapter";
  else if (type === "proceedings-article") articleType = "Conference Paper";
  else if (type === "dataset") articleType = "Dataset";

  const pubTypes = articleType ? [articleType] : [];
  let peerReviewStatus = classifyPeerReview(pubTypes, journal);
  if (type === "posted-content") peerReviewStatus = "preprint";

  const updateTypes = (work["update-to"] ?? []).map((entry) => (entry.type ?? "").toLowerCase());
  let retractionStatus: RetractionStatus = "none";
  let retractionNote: string | null = null;
  if (subtype === "retraction" || articleType === "Retraction of Publication") {
    retractionStatus = "retracted";
    retractionNote = "Crossref: this record is a retraction notice";
  } else if (updateTypes.some((entryType) => entryType.includes("retraction"))) {
    retractionStatus = "retracted";
    retractionNote = "Crossref update-to: retraction";
  } else if (updateTypes.some((entryType) => entryType.includes("expression-of-concern") || entryType.includes("concern"))) {
    retractionStatus = "expression_of_concern";
    retractionNote = "Crossref update-to: expression of concern";
  } else if (updateTypes.some((entryType) => entryType.includes("correction") || entryType.includes("erratum"))) {
    retractionStatus = "correction";
    retractionNote = "Crossref update-to: correction";
  }

  const publicationDate = dateParts(work.published) ?? dateParts(work["published-print"]) ?? dateParts(work["published-online"]);
  const license = work.license?.find((entry) => entry.URL)?.URL ?? null;

  return {
    source: "crossref",
    externalId: doi ?? work.DOI,
    url: work.URL ?? (doi ? `https://doi.org/${doi}` : "https://www.crossref.org/"),
    doi,
    pmid: null,
    pmcid: null,
    openalexId: null,
    title,
    authors: (work.author ?? [])
      .map((author) => author.name || [author.given, author.family].filter(Boolean).join(" "))
      .filter(Boolean),
    journal,
    publicationDate,
    onlinePublicationDate: dateParts(work["published-online"]),
    articleType,
    abstract: work.abstract ? stripMarkup(work.abstract) : null,
    keywords: (work.subject ?? []).slice(0, 15),
    peerReviewStatus,
    publicationStatus:
      retractionStatus === "retracted"
        ? "retracted"
        : peerReviewStatus === "preprint"
          ? "preprint"
          : publicationDate
            ? "published"
            : "unknown",
    retractionStatus,
    retractionNote,
    fullTextAccessStatus: "unknown",
    fullTextUrl: null,
    license,
    citationCount: Number(work["is-referenced-by-count"] ?? 0),
    retrievedAt: nowStamp(),
    raw: work,
  };
}

export async function lookupCrossrefByDoi(doi: string, mailto?: string): Promise<SourceRecord | null> {
  const params = new URLSearchParams();
  if (mailto) params.set("mailto", mailto);
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}${params.size ? `?${params.toString()}` : ""}`;
  try {
    const response = await fetchJson<{ message: CrossrefWork }>(url, {
      headers: { Accept: "application/json" },
      minIntervalMs: 120,
    });
    if (!response.message) return null;
    const record = mapCrossrefWork(response.message);
    return record.title ? record : null;
  } catch (error) {
    if (error instanceof Error && /HTTP 404/.test(error.message)) return null;
    throw error;
  }
}

export function verifyTitle(input: { title: string }, crossref: SourceRecord): { matches: boolean; similarityNote: string } {
  const normalize = (value: string) =>
    stripMarkup(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const left = normalize(input.title);
  const right = normalize(crossref.title);
  if (!left || !right) return { matches: false, similarityNote: "missing title" };
  if (left === right) return { matches: true, similarityNote: "exact title match" };
  const shorter = left.length < right.length ? left : right;
  const longer = left.length < right.length ? right : left;
  if (shorter.length > 20 && longer.includes(shorter)) {
    return { matches: true, similarityNote: "title containment match" };
  }
  return { matches: false, similarityNote: `titles differ: "${left.slice(0, 80)}" vs "${right.slice(0, 80)}"` };
}
