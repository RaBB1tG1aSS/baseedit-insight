import type {
  FullTextStatus,
  PeerReviewStatus,
  PublicationStatus,
  RetractionStatus,
} from "@/lib/types";
import type { SourceRecord, SourceName } from "../sources/types";
import { normalizeDoi, titleKey, titleSimilarity, yearOf } from "../utils/normalize";

export interface FieldConflict {
  field: string;
  values: { source: string; value: string }[];
}

export interface MergedCandidate {
  key: string;
  records: SourceRecord[];
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  openalexId: string | null;
  title: string;
  titleKey: string;
  authors: string[];
  journal: string | null;
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
  conflicts: FieldConflict[];
  sources: SourceName[];
}

const SOURCE_PRIORITY: Record<SourceName, number> = {
  pubmed: 5,
  europepmc: 4,
  crossref: 3,
  openalex: 2,
  semantic_scholar: 1,
};

function best<T>(
  records: SourceRecord[],
  pick: (record: SourceRecord) => T | null | undefined,
): T | null {
  const sorted = [...records].sort(
    (a, b) => (SOURCE_PRIORITY[b.source] ?? 0) - (SOURCE_PRIORITY[a.source] ?? 0),
  );
  for (const record of sorted) {
    const value = pick(record);
    if (value != null && value !== "") return value;
  }
  return null;
}

function longest<T extends string>(records: SourceRecord[], pick: (record: SourceRecord) => T | null | undefined): T | null {
  let result: T | null = null;
  for (const record of records) {
    const value = pick(record);
    if (typeof value === "string" && (!result || value.length > result.length)) result = value;
  }
  return result;
}

const RETRACTION_SEVERITY: Record<RetractionStatus, number> = {
  retracted: 4,
  expression_of_concern: 3,
  correction: 2,
  none: 1,
  unknown: 0,
};

function worstRetraction(records: SourceRecord[]): { status: RetractionStatus; note: string | null } {
  let status: RetractionStatus = "unknown";
  let note: string | null = null;
  for (const record of records) {
    if ((RETRACTION_SEVERITY[record.retractionStatus] ?? 0) > (RETRACTION_SEVERITY[status] ?? 0)) {
      status = record.retractionStatus;
      note = record.retractionNote;
    }
  }
  if (status === "none" && records.every((record) => record.retractionStatus === "unknown")) {
    return { status: "unknown", note: null };
  }
  return { status, note };
}

function mergePeerReview(records: SourceRecord[]): PeerReviewStatus {
  if (records.some((record) => record.peerReviewStatus === "peer_reviewed")) return "peer_reviewed";
  if (records.some((record) => record.peerReviewStatus === "preprint")) return "preprint";
  return "unknown";
}

function mergePublicationStatus(records: SourceRecord[], retraction: RetractionStatus, peer: PeerReviewStatus): PublicationStatus {
  if (retraction === "retracted") return "retracted";
  if (peer === "preprint") return "preprint";
  if (records.some((record) => record.publicationStatus === "published")) return "published";
  return "unknown";
}

function mergeArticleType(records: SourceRecord[]): string | null {
  const types = records.map((record) => record.articleType).filter((value): value is string => Boolean(value));
  const priority = [
    "Retraction of Publication",
    "Erratum",
    "Expression of Concern",
    "Clinical Trial",
    "Randomized Controlled Trial",
    "Meta-Analysis",
    "Systematic Review",
    "Review",
    "Preprint",
    "Journal Article",
  ];
  for (const candidate of priority) {
    const hit = types.find((type) => type.toLowerCase() === candidate.toLowerCase());
    if (hit) return hit;
  }
  return types[0] ?? null;
}

function mergeOne(group: SourceRecord[]): MergedCandidate {
  const title = best(group, (record) => record.title) ?? group[0].title;
  const dates = group
    .map((record) => record.publicationDate)
    .filter((value): value is string => Boolean(value));
  const publicationDate = dates.sort()[0] ?? null;

  const retraction = worstRetraction(group);
  const peer = mergePeerReview(group);

  const conflicts: FieldConflict[] = [];
  const normalizedTitles = new Set(group.map((record) => record.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()));
  if (normalizedTitles.size > 1) {
    const variants = [...normalizedTitles];
    const near = variants.every((variant) =>
      variants.every((other) => titleSimilarity(variant, other) >= 0.9),
    );
    if (!near) {
      conflicts.push({
        field: "title",
        values: group.map((record) => ({ source: record.source, value: record.title })),
      });
    }
  }

  const journals = new Set(group.map((record) => (record.journal ?? "").toLowerCase().trim()).filter(Boolean));
  if (journals.size > 1 && group.filter((record) => record.journal).length > 1) {
    conflicts.push({
      field: "journal",
      values: group.map((record) => ({ source: record.source, value: record.journal ?? "" })).filter((item) => item.value),
    });
  }

  const yearValues = new Set(dates.map((date) => yearOf(date)).filter((year): year is number => year != null));
  if (yearValues.size > 1) {
    const years = [...yearValues].sort();
    if (Number(years[years.length - 1]) - Number(years[0]) > 1) {
      conflicts.push({
        field: "publication_date",
        values: group.map((record) => ({ source: record.source, value: record.publicationDate ?? "" })).filter((item) => item.value),
      });
    }
  }

  const retractionValues = new Set(group.map((record) => record.retractionStatus).filter((status) => status !== "unknown"));
  if (retractionValues.size > 1) {
    conflicts.push({
      field: "retraction_status",
      values: group.map((record) => ({ source: record.source, value: record.retractionStatus })),
    });
  }

  const doi = group.map((record) => normalizeDoi(record.doi)).find(Boolean) ?? null;
  const pmid = group.map((record) => record.pmid).find(Boolean) ?? null;
  const pmcid = group.map((record) => record.pmcid).find(Boolean) ?? null;
  const openalexId = group.map((record) => record.openalexId).find(Boolean) ?? null;

  const oaRecord = group.find((record) => record.fullTextAccessStatus === "oa_fulltext");
  const abstract = longest(group, (record) => record.abstract);
  const authors = [...group]
    .sort((a, b) => (b.authors?.length ?? 0) - (a.authors?.length ?? 0))
    .find((record) => record.authors?.length)?.authors ?? [];

  const keywords = [
    ...new Set(group.flatMap((record) => record.keywords ?? [])),
  ].slice(0, 30);

  const key = doi ?? (pmid ? `pmid:${pmid}` : pmcid ? `pmcid:${pmcid}` : titleKey(title));

  return {
    key,
    records: group,
    doi,
    pmid,
    pmcid,
    openalexId,
    title,
    titleKey: titleKey(title),
    authors,
    journal: best(group, (record) => record.journal),
    publicationDate,
    onlinePublicationDate: best(group, (record) => record.onlinePublicationDate),
    articleType: mergeArticleType(group),
    abstract,
    keywords,
    peerReviewStatus: peer,
    publicationStatus: mergePublicationStatus(group, retraction.status, peer),
    retractionStatus: retraction.status,
    retractionNote: retraction.note,
    fullTextAccessStatus: oaRecord?.fullTextAccessStatus ?? best(group, (record) => record.fullTextAccessStatus) ?? "unknown",
    fullTextUrl: oaRecord?.fullTextUrl ?? best(group, (record) => record.fullTextUrl),
    license: oaRecord?.license ?? best(group, (record) => record.license),
    citationCount: Math.max(0, ...group.map((record) => record.citationCount ?? 0)),
    conflicts,
    sources: [...new Set(group.map((record) => record.source))],
  };
}

/**
 * Groups records that describe the same work. Identifier matches win; otherwise
 * near-identical titles (±1 year) are merged. A paper from PubMed, Europe PMC,
 * Crossref and OpenAlex therefore becomes exactly one candidate (§1.3).
 */
export function mergeSourceRecords(records: SourceRecord[]): MergedCandidate[] {
  const groups: SourceRecord[][] = [];

  for (const record of records) {
    let target: SourceRecord[] | null = null;
    for (const group of groups) {
      const representative = group[0];
      const idMatch =
        (record.doi && group.some((item) => normalizeDoi(item.doi) === normalizeDoi(record.doi))) ||
        (record.pmid && group.some((item) => item.pmid === record.pmid)) ||
        (record.pmcid && group.some((item) => item.pmcid?.toUpperCase() === record.pmcid?.toUpperCase())) ||
        (record.openalexId && group.some((item) => item.openalexId === record.openalexId));

      if (idMatch) {
        target = group;
        break;
      }

      // Conflicting strong identifiers prove these are different works, even if
      // the titles are similar ("Base editor A treats X" vs "Base editor B").
      const doiConflict = group.some(
        (item) =>
          item.doi && record.doi && normalizeDoi(item.doi) !== normalizeDoi(record.doi),
      );
      const pmidConflict = group.some((item) => item.pmid && record.pmid && item.pmid !== record.pmid);
      if (doiConflict || pmidConflict) continue;

      const similarity = titleSimilarity(record.title, representative.title);
      const yearA = yearOf(record.publicationDate);
      const yearB = yearOf(representative.publicationDate);
      const yearClose = !yearA || !yearB || Math.abs(yearA - yearB) <= 1;
      if (similarity >= 0.94 || (similarity >= 0.88 && yearClose)) {
        target = group;
        break;
      }
    }

    if (target) target.push(record);
    else groups.push([record]);
  }

  return groups.map(mergeOne);
}
