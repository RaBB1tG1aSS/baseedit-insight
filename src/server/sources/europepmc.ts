import type { RetractionStatus } from "@/lib/types";
import { normalizeDoi, normalizePmcid, normalizePmid, stripMarkup, toIsoDate } from "../utils/normalize";
import { asArray, fetchJson } from "./http";
import {
  classifyPeerReview,
  nowStamp,
  pickArticleType,
  type SearchAdapter,
  type SearchOptions,
  type SourceRecord,
} from "./types";

const BASE = "https://www.ebi.ac.uk/europepmc/webservices/rest";

interface EpmcAuthor {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  collectiveName?: string;
}

interface EpmcResult {
  id: string;
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  authorList?: { author?: EpmcAuthor[] };
  journalInfo?: {
    journal?: { title?: string; medlineAbbreviation?: string; isoabbreviation?: string };
    yearOfPublication?: number;
    printPublicationDate?: string;
    dateOfPublication?: string;
  };
  pubYear?: number;
  firstPublicationDate?: string;
  electronicPublicationDate?: string;
  abstractText?: string;
  pubTypeList?: { pubType?: string[] | string };
  keywordList?: { keyword?: string[] | string };
  meshHeadingList?: { meshHeading?: { descriptorName?: unknown }[] };
  citedByCount?: number;
  isOpenAccess?: string;
  inEPMC?: string;
  inPMC?: string;
  license?: string;
  fullTextUrlList?: { fullTextUrl?: { url?: string; documentStyle?: string; availability?: string }[] };
}

interface EpmcResponse {
  hitCount: number;
  resultList?: { result?: EpmcResult[] };
}

function pubTypesOf(record: EpmcResult): string[] {
  return asArray(record.pubTypeList?.pubType).map((value) => stripMarkup(String(value))).filter(Boolean);
}

function retractionOf(record: EpmcResult): { status: RetractionStatus; note: string | null } {
  const types = pubTypesOf(record).map((type) => type.toLowerCase());
  if (types.includes("retracted publication")) return { status: "retracted", note: "Europe PMC publication type: Retracted Publication" };
  if (types.includes("retraction of publication")) return { status: "retracted", note: "This record is a retraction notice" };
  if (types.includes("expression of concern")) return { status: "expression_of_concern", note: "Europe PMC publication type: Expression of Concern" };
  if (types.includes("published erratum")) return { status: "correction", note: "Europe PMC publication type: Published Erratum" };
  return { status: "none", note: null };
}

function mapRecord(record: EpmcResult): SourceRecord | null {
  const title = stripMarkup(record.title);
  if (!title) return null;

  const pubTypes = pubTypesOf(record);
  const journal = record.journalInfo?.journal?.title ?? record.journalInfo?.journal?.medlineAbbreviation ?? null;
  const peerReviewStatus = classifyPeerReview(pubTypes, journal);
  const retraction = retractionOf(record);
  const publicationDate =
    toIsoDate(record.firstPublicationDate) ??
    toIsoDate(record.electronicPublicationDate) ??
    toIsoDate(record.journalInfo?.printPublicationDate) ??
    (record.pubYear ? `${record.pubYear}-01-01` : null);

  const pmid = normalizePmid(record.pmid);
  const pmcid = normalizePmcid(record.pmcid);
  const isOpen = record.isOpenAccess === "Y";
  const inEpmc = record.inEPMC === "Y" || record.inPMC === "Y";

  const keywords = [
    ...asArray(record.keywordList?.keyword).map((value) => stripMarkup(String(value))),
    ...asArray(record.meshHeadingList?.meshHeading)
      .map((heading) => stripMarkup(String((heading?.descriptorName as string) ?? "")))
      .filter(Boolean),
  ].filter((value, index, list) => value && list.indexOf(value) === index);

  return {
    source: "europepmc",
    externalId: `${record.source}:${record.id}`,
    url: `https://europepmc.org/article/${record.source}/${record.id}`,
    doi: normalizeDoi(record.doi),
    pmid,
    pmcid,
    openalexId: null,
    title,
    authors: asArray(record.authorList?.author)
      .map((author) => author.fullName || [author.firstName, author.lastName].filter(Boolean).join(" ") || author.collectiveName || "")
      .filter(Boolean),
    journal,
    publicationDate,
    onlinePublicationDate: toIsoDate(record.electronicPublicationDate),
    articleType: pickArticleType(pubTypes),
    abstract: record.abstractText ? stripMarkup(record.abstractText) : null,
    keywords: keywords.slice(0, 20),
    peerReviewStatus,
    publicationStatus:
      retraction.status === "retracted"
        ? "retracted"
        : peerReviewStatus === "preprint"
          ? "preprint"
          : "published",
    retractionStatus: retraction.status,
    retractionNote: retraction.note,
    fullTextAccessStatus: isOpen && inEpmc && pmcid ? "oa_fulltext" : "abstract_only",
    fullTextUrl: isOpen && pmcid ? `https://europepmc.org/articles/${pmcid}` : null,
    license: record.license ?? null,
    citationCount: Number(record.citedByCount ?? 0),
    retrievedAt: nowStamp(),
    raw: record,
  };
}

export async function searchEuropePmc(options: SearchOptions): Promise<SourceRecord[]> {
  const { query, limit, since, mode = "latest" } = options;
  const dateClause = since ? ` AND FIRST_PDATE:[${since} TO ${new Date().toISOString().slice(0, 10)}]` : "";
  const fullQuery = `${query}${dateClause}`;

  const params = new URLSearchParams({
    query: fullQuery,
    format: "json",
    pageSize: String(Math.min(100, limit)),
    resultType: "core",
    sort: mode === "landmark" ? "CITED desc" : "P_PDATE_D desc",
  });

  const response = await fetchJson<EpmcResponse>(`${BASE}/search?${params.toString()}`, {
    minIntervalMs: 150,
  });

  return asArray(response.resultList?.result)
    .map(mapRecord)
    .filter((record): record is SourceRecord => Boolean(record));
}

export async function lookupEuropePmcByDoi(doi: string): Promise<SourceRecord | null> {
  const query = `DOI:"${doi.replace(/"/g, "")}"`;
  const params = new URLSearchParams({
    query,
    format: "json",
    pageSize: "5",
    resultType: "core",
  });
  const response = await fetchJson<EpmcResponse>(`${BASE}/search?${params.toString()}`);
  const records = asArray(response.resultList?.result)
    .map(mapRecord)
    .filter((record): record is SourceRecord => Boolean(record));
  return records[0] ?? null;
}

export async function lookupEuropePmcByPmid(pmid: string): Promise<SourceRecord | null> {
  const query = `EXT_ID:${pmid} AND SRC:MED`;
  const params = new URLSearchParams({
    query,
    format: "json",
    pageSize: "3",
    resultType: "core",
  });
  const response = await fetchJson<EpmcResponse>(`${BASE}/search?${params.toString()}`);
  const records = asArray(response.resultList?.result)
    .map(mapRecord)
    .filter((record): record is SourceRecord => Boolean(record));
  return records[0] ?? null;
}

export async function lookupEuropePmcByPmcid(pmcid: string): Promise<SourceRecord | null> {
  const query = `PMCID:${pmcid}`;
  const params = new URLSearchParams({
    query,
    format: "json",
    pageSize: "3",
    resultType: "core",
  });
  const response = await fetchJson<EpmcResponse>(`${BASE}/search?${params.toString()}`);
  const records = asArray(response.resultList?.result)
    .map(mapRecord)
    .filter((record): record is SourceRecord => Boolean(record));
  return records[0] ?? null;
}

export const europePmcAdapter: SearchAdapter = {
  name: "europepmc",
  enabled: () => true,
  search: searchEuropePmc,
};
