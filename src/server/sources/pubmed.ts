import { XMLParser } from "fast-xml-parser";
import type { RetractionStatus } from "@/lib/types";
import { normalizeDoi, normalizePmcid, normalizePmid, stripMarkup, toIsoDate } from "../utils/normalize";
import { fetchJson, fetchText } from "./http";
import {
  classifyPeerReview,
  nowStamp,
  pickArticleType,
  type SearchOptions,
  type SourceRecord,
} from "./types";

const EUTILS = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const TOOL = "BaseEditInsight";
const NCBI_TERM_QUERY = [
  '("base editing"[tiab] OR "base editor"[tiab] OR "base editors"[tiab]',
  'OR "cytosine base editor"[tiab] OR "adenine base editor"[tiab]',
  'OR "ABE8e"[tiab] OR "BE4max"[tiab] OR "TadA"[tiab])',
  'AND (CRISPR[tiab] OR Cas9[tiab] OR deaminase[tiab] OR "genome editing"[tiab])',
].join(" ");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  isArray: (name) =>
    [
      "PubmedArticle",
      "Author",
      "AbstractText",
      "PublicationType",
      "CommentsCorrections",
      "ArticleId",
      "Keyword",
      "MeshHeading",
      "ArticleDate",
      "ELocationID",
      "PubmedBookArticle",
    ].includes(name),
});

type XmlNode = Record<string, unknown> | string | number | null | undefined;

/** Recursively flattens mixed-content XML nodes (titles often contain <i>). */
function xmlText(node: unknown): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(xmlText).filter(Boolean).join(" ");
  if (typeof node === "object") {
    return Object.entries(node)
      .filter(([key]) => !key.startsWith("@_"))
      .map(([, value]) => xmlText(value))
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  "jan-feb": 1, "mar-apr": 3, "may-jun": 5, "jul-aug": 7, "sep-oct": 9, "nov-dec": 11,
};

function parseDateNode(node: unknown): string | null {
  if (!node || typeof node !== "object") return null;
  const record = node as Record<string, unknown>;
  const year = Number(record.Year);
  if (!year) {
    const medlineDate = xmlText(record.MedlineDate as XmlNode);
    const yearMatch = medlineDate.match(/(\d{4})/);
    if (!yearMatch) return null;
    const monthMatch = /^[A-Za-z]{3}/.exec(medlineDate.replace(/^\d{4}\s*/, ""));
    const smonth = monthMatch ? MONTHS[monthMatch[0].toLowerCase()] : 1;
    return `${yearMatch[1]}-${String(smonth ?? 1).padStart(2, "0")}-01`;
  }
  let month = 1;
  const rawMonth = xmlText(record.Month as XmlNode).toLowerCase();
  if (rawMonth) {
    month = MONTHS[rawMonth] ?? (Number.parseInt(rawMonth, 10) || 1);
  }
  const day = Number(xmlText(record.Day as XmlNode)) || 1;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

interface ParsedArticle {
  record: SourceRecord;
}

function parsePubmedArticle(article: Record<string, unknown>): ParsedArticle | null {
  const citation = (article.MedlineCitation ?? {}) as Record<string, unknown>;
  const pmid = normalizePmid(xmlText(citation.PMID as XmlNode));
  const articleNode = (citation.Article ?? {}) as Record<string, unknown>;
  const title = stripMarkup(xmlText(articleNode.ArticleTitle as XmlNode));
  if (!title) return null;

  const journalNode = (articleNode.Journal ?? {}) as Record<string, unknown>;
  const journalIssue = (journalNode.JournalIssue ?? {}) as Record<string, unknown>;
  const journal = stripMarkup(xmlText(journalNode.Title as XmlNode)) || stripMarkup(xmlText(journalNode.ISOAbbreviation as XmlNode)) || null;

  const pubTypeNodes = ((articleNode.PublicationTypeList as Record<string, unknown> | undefined)
    ?.PublicationType as unknown[]) ?? [];
  const pubTypes = pubTypeNodes
    .map((node) => stripMarkup(xmlText(node as XmlNode)))
    .filter(Boolean);

  const authorList = (articleNode.AuthorList ?? {}) as Record<string, unknown>;
  const authors = ((authorList.Author as unknown[]) ?? [])
    .map((authorNode) => {
      const author = authorNode as Record<string, unknown>;
      const collective = stripMarkup(xmlText(author.CollectiveName as XmlNode));
      if (collective) return collective;
      const fore = stripMarkup(xmlText(author.ForeName as XmlNode));
      const last = stripMarkup(xmlText(author.LastName as XmlNode));
      const initials = stripMarkup(xmlText(author.Initials as XmlNode));
      return [fore || initials, last].filter(Boolean).join(" ").trim();
    })
    .filter(Boolean);

  const abstractNodes = ((articleNode.Abstract as Record<string, unknown> | undefined)?.AbstractText as unknown[]) ?? [];
  const abstractParts = abstractNodes
    .map((node) => {
      const text = stripMarkup(xmlText(node as XmlNode));
      const label = (node as Record<string, unknown>)?.["@_Label"];
      return text ? (label ? `${String(label)}: ${text}` : text) : "";
    })
    .filter(Boolean);
  const abstract = abstractParts.length ? abstractParts.join("\n") : null;

  const pubmedData = (article.PubmedData ?? {}) as Record<string, unknown>;
  const articleIds = (((pubmedData.ArticleIdList as Record<string, unknown> | undefined)?.ArticleId as unknown[]) ?? []).map(
    (node) => ({
      type: String((node as Record<string, unknown>)?.["@_IdType"] ?? ""),
      value: stripMarkup(xmlText(node as XmlNode)),
    }),
  );
  const doiFromIds = articleIds.find((id) => id.type === "doi")?.value;
  const pmcidFromIds = articleIds.find((id) => id.type === "pmc")?.value;

  const elocations = ([] as unknown[]).concat((articleNode.ELocationID as unknown[]) ?? []);
  const doiFromElocation = elocations
    .map((node) => {
      const record = node as Record<string, unknown>;
      return String(record["@_EIdType"] ?? "") === "doi" ? stripMarkup(xmlText(node as XmlNode)) : "";
    })
    .find(Boolean);

  const comments = (((citation.CommentsCorrectionsList as Record<string, unknown> | undefined)?.CommentsCorrections as unknown[]) ?? []).map(
    (node) => ({
      refType: String((node as Record<string, unknown>)?.["@_RefType"] ?? ""),
      source: stripMarkup(xmlText((node as Record<string, unknown>).RefSource as XmlNode)),
    }),
  );

  let retractionStatus: RetractionStatus = "none";
  let retractionNote: string | null = null;
  const lowerTypes = pubTypes.map((type) => type.toLowerCase());
  const isRetractionNotice =
    lowerTypes.includes("retraction of publication") ||
    comments.some((c) => c.refType === "RetractionOf");

  if (lowerTypes.includes("retracted publication") || comments.some((c) => c.refType === "RetractionIn")) {
    retractionStatus = "retracted";
    retractionNote = comments.find((c) => c.refType === "RetractionIn")?.source ?? "PubMed: Retracted Publication";
  } else if (comments.some((c) => c.refType === "ExpressionOfConcernIn") || lowerTypes.includes("expression of concern")) {
    retractionStatus = "expression_of_concern";
    retractionNote = "PubMed: Expression of Concern";
  } else if (comments.some((c) => c.refType === "ErratumIn") || lowerTypes.includes("published erratum")) {
    retractionStatus = "correction";
    retractionNote = "PubMed: Published Erratum";
  }

  const publicationDate =
    parseDateNode(journalIssue.PubDate) ??
    parseDateNode(((articleNode.ArticleDate as unknown[]) ?? [])[0]);
  const onlineDate = parseDateNode(((articleNode.ArticleDate as unknown[]) ?? [])[0]);

  const peerReviewStatus = classifyPeerReview(pubTypes, journal);
  const articleType = isRetractionNotice
    ? "Retraction of Publication"
    : pickArticleType(pubTypes);

  const pmcid = normalizePmcid(pmcidFromIds);
  const keywords = ([] as unknown[])
    .concat(((citation.KeywordList as Record<string, unknown> | undefined)?.Keyword as unknown[]) ?? [])
    .map((node) => stripMarkup(xmlText(node as XmlNode)))
    .filter(Boolean);
  const mesh = ([] as unknown[])
    .concat(((citation.MeshHeadingList as Record<string, unknown> | undefined)?.MeshHeading as unknown[]) ?? [])
    .map((node) => stripMarkup(xmlText((node as Record<string, unknown>).DescriptorName as XmlNode)))
    .filter(Boolean);

  const record: SourceRecord = {
    source: "pubmed",
    externalId: pmid ?? title,
    url: pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "https://pubmed.ncbi.nlm.nih.gov/",
    doi: normalizeDoi(doiFromIds ?? doiFromElocation),
    pmid,
    pmcid,
    openalexId: null,
    title,
    authors,
    journal,
    issn: stripMarkup(xmlText(journalNode.ISSN as XmlNode)) || null,
    publicationDate,
    onlinePublicationDate: onlineDate,
    articleType,
    abstract,
    keywords: [...keywords, ...mesh].filter((value, index, list) => list.indexOf(value) === index).slice(0, 24),
    peerReviewStatus,
    publicationStatus:
      retractionStatus === "retracted"
        ? "retracted"
        : peerReviewStatus === "preprint"
          ? "preprint"
          : "published",
    retractionStatus,
    retractionNote,
    fullTextAccessStatus: "unknown",
    fullTextUrl: pmcid ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcid}/` : null,
    license: null,
    citationCount: 0,
    retrievedAt: nowStamp(),
    raw: article,
  };

  return { record };
}

function parsePubmedXml(xml: string): SourceRecord[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const set = (parsed.PubmedArticleSet ?? {}) as Record<string, unknown>;
  const articles = ([] as unknown[]).concat((set.PubmedArticle as unknown[]) ?? []);
  return articles
    .map((article) => parsePubmedArticle(article as Record<string, unknown>))
    .filter((value): value is ParsedArticle => Boolean(value))
    .map((value) => value.record);
}

function eutilsParams(options: SearchOptions, extra: Record<string, string>): string {
  const params = new URLSearchParams({
    tool: TOOL,
    email: options.mailto || "anonymous@example.com",
    ...(options.apiKey ? { api_key: options.apiKey } : {}),
    ...extra,
  });
  return params.toString();
}

export async function searchPubmed(options: SearchOptions): Promise<SourceRecord[]> {
  const { limit, since, mode = "latest" } = options;
  const term = `(${NCBI_TERM_QUERY})`;
  const searchParams: Record<string, string> = {
    db: "pubmed",
    retmode: "json",
    retmax: String(Math.min(100, limit)),
    term,
    sort: mode === "landmark" ? "relevance" : "pub_date",
  };
  if (since && mode === "latest") {
    searchParams.datetype = "pdat";
    searchParams.mindate = since.replace(/-/g, "/");
    searchParams.maxdate = new Date().toISOString().slice(0, 10).replace(/-/g, "/");
  }

  const search = await fetchJson<{ esearchresult?: { idlist?: string[] } }>(
    `${EUTILS}/esearch.fcgi?${eutilsParams(options, searchParams)}`,
    { minIntervalMs: options.apiKey ? 120 : 380 },
  );
  const ids = search.esearchresult?.idlist ?? [];
  if (!ids.length) return [];

  const xml = await fetchText(
    `${EUTILS}/efetch.fcgi?${eutilsParams(options, {
      db: "pubmed",
      retmode: "xml",
      id: ids.join(","),
    })}`,
    { minIntervalMs: options.apiKey ? 120 : 380 },
  );
  return parsePubmedXml(xml);
}

export async function lookupPubmedByPmid(
  pmid: string,
  options: SearchOptions,
): Promise<SourceRecord | null> {
  const xml = await fetchText(
    `${EUTILS}/efetch.fcgi?${eutilsParams(options, {
      db: "pubmed",
      retmode: "xml",
      id: pmid,
    })}`,
    { minIntervalMs: options.apiKey ? 120 : 380 },
  );
  return parsePubmedXml(xml)[0] ?? null;
}

export async function lookupPubmedByDoi(
  doi: string,
  options: SearchOptions,
): Promise<SourceRecord | null> {
  const search = await fetchJson<{ esearchresult?: { idlist?: string[] } }>(
    `${EUTILS}/esearch.fcgi?${eutilsParams(options, {
      db: "pubmed",
      retmode: "json",
      retmax: "3",
      term: `"${doi}"[doi]`,
    })}`,
    { minIntervalMs: options.apiKey ? 120 : 380 },
  );
  const ids = search.esearchresult?.idlist ?? [];
  if (!ids.length) return null;
  return lookupPubmedByPmid(ids[0], options);
}

export { parsePubmedXml };
