import { XMLParser } from "fast-xml-parser";
import type { Paper } from "@/lib/types";
import { getDb, nowIso } from "../db/client";
import { updatePaper } from "../db/repo/papers";
import {
  replaceFigures,
  upsertFullText,
  type FigureInput,
} from "../db/repo/analysis";
import { asArray, fetchText } from "../sources/http";
import { licenseAllowsStorage } from "../utils/license";

const REST = "https://www.ebi.ac.uk/europepmc/webservices/rest";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
  isArray: (name) =>
    [
      "sec",
      "p",
      "fig",
      "fig-group",
      "caption",
      "license",
      "license-p",
      "body",
      "graphic",
      "label",
      "alternatives",
      "list",
      "list-item",
      "table-wrap",
    ].includes(name),
});

type XmlNode = unknown;

/**
 * Flattens JATS mixed content. Structural/reference nodes are skipped so that
 * citation markers do not pollute the scientific text.
 */
function nodeText(node: XmlNode, skip: Set<string> = new Set(["xref", "graphic", "alternatives", "object-id"])): string {
  if (node == null) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => nodeText(child, skip)).filter(Boolean).join(" ");
  if (typeof node === "object") {
    const record = node as Record<string, unknown>;
    const parts: string[] = [];
    for (const [key, value] of Object.entries(record)) {
      if (key.startsWith("@_") || key.startsWith("?")) continue;
      if (skip.has(key)) continue;
      parts.push(nodeText(value, skip));
    }
    return parts.filter(Boolean).join(" ");
  }
  return "";
}

function clean(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s([,.;:])/g, "$1")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")")
    .trim();
}

interface ParsedSection {
  heading: string;
  text: string;
}

function collectSections(node: Record<string, unknown>, path: string[], out: ParsedSection[]): void {
  const title = clean(nodeText(node.title as XmlNode, new Set(["xref"])));
  const currentPath = title ? [...path, title] : path;

  const paragraphs: string[] = [];
  for (const p of asArray(node.p as unknown[])) {
    const text = clean(nodeText(p as XmlNode));
    if (text.length > 20) paragraphs.push(text);
  }
  for (const list of asArray(node.list as unknown[])) {
    const text = clean(nodeText(list as XmlNode));
    if (text.length > 20) paragraphs.push(text);
  }

  if (paragraphs.length) {
    out.push({
      heading: currentPath.join(" › ") || "正文",
      text: paragraphs.join("\n\n"),
    });
  }

  for (const sec of asArray(node.sec as unknown[])) {
    collectSections(sec as Record<string, unknown>, currentPath, out);
  }
}

function collectGraphics(node: unknown, acc: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const child of node) collectGraphics(child, acc);
    return;
  }
  if (typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(record)) {
    if (key === "graphic") {
      for (const graphic of asArray(value as unknown[])) {
        const href =
          (graphic as Record<string, unknown>)["@_xlink:href"] ??
          (graphic as Record<string, unknown>)["@_href"];
        if (typeof href === "string") acc.push(href);
      }
    } else if (typeof value === "object" && key !== "caption") {
      collectGraphics(value, acc);
    }
  }
}

interface ParsedFigure {
  number: string;
  legend: string;
  href: string | null;
  panels: { label: string; description: string }[];
}

export interface ParsedFullText {
  sections: ParsedSection[];
  figures: ParsedFigure[];
  license: string | null;
}

function parsePanels(caption: string): { label: string; description: string }[] {
  const matches = [...caption.matchAll(/\(([A-Z])\)/g)];
  if (matches.length < 2) return [];
  return matches
    .map((match, index) => {
      const start = (match.index ?? 0) + match[0].length;
      const end = index + 1 < matches.length ? matches[index + 1].index ?? caption.length : caption.length;
      return {
        label: match[1],
        description: caption.slice(start, end).trim().slice(0, 900),
      };
    })
    .filter((panel) => panel.description.length > 3);
}

function collectFigures(node: Record<string, unknown>, out: ParsedFigure[]): void {
  for (const fig of asArray(node.fig as unknown[])) {
    const record = fig as Record<string, unknown>;
    const label = clean(nodeText(record.label as XmlNode)) || `Figure ${out.length + 1}`;
    const legend = clean(nodeText(record.caption as XmlNode, new Set(["xref"])));
    const graphics: string[] = [];
    collectGraphics(record, graphics);
    const href = graphics.find((value) => /\.(webp|jpe?g|png|gif)$/i.test(value)) ?? graphics[0] ?? null;
    out.push({
      number: normalizeFigureLabel(label, out.length + 1),
      legend,
      href,
      panels: parsePanels(legend),
    });
  }
  for (const group of asArray(node["fig-group"] as unknown[])) {
    collectFigures(group as Record<string, unknown>, out);
  }
  for (const sec of asArray(node.sec as unknown[])) {
    collectFigures(sec as Record<string, unknown>, out);
  }
}

function normalizeFigureLabel(label: string, index: number): string {
  const value = label.trim();
  if (/^fig(ure)?\.?\s*/i.test(value)) {
    return value.replace(/^fig(ure)?\.?\s*/i, "Figure ");
  }
  if (/^table\s*/i.test(value)) return value.replace(/^table\s*/i, "Table ");
  return `Figure ${index}`;
}

function extractLicense(article: Record<string, unknown>, fallback: string | null): string | null {
  const front = (article.front ?? {}) as Record<string, unknown>;
  const meta = (front["article-meta"] ?? {}) as Record<string, unknown>;
  const permissions = (meta.permissions ?? {}) as Record<string, unknown>;
  const licenseText = clean(nodeText(permissions.license as XmlNode));
  if (!licenseText) return fallback;
  const match = licenseText.match(/(CC(?:0|\s*BY(?:[-\s]?(?:NC|SA|ND))*)[\d.\s]*)/i);
  if (match) return match[1].replace(/\s+/g, " ").trim();
  if (/open access/i.test(licenseText)) return fallback ?? "Open access";
  return fallback;
}

export function parseJatsFullText(xml: string, fallbackLicense: string | null = null): ParsedFullText {
  const parsed = parser.parse(xml) as Record<string, unknown>;
  const article = (parsed.article ?? {}) as Record<string, unknown>;
  const license = extractLicense(article, fallbackLicense);
  const bodyNode = (asArray(article.body as unknown[])[0] ?? {}) as Record<string, unknown>;

  const sections: ParsedSection[] = [];
  if (Object.keys(bodyNode).length) collectSections(bodyNode, [], sections);

  const figures: ParsedFigure[] = [];
  collectFigures(bodyNode, figures);

  return { sections, figures, license };
}

export async function fetchJatsXml(pmcid: string): Promise<string> {
  return fetchText(`${REST}/${pmcid}/fullTextXML`, {
    timeoutMs: 45_000,
    minIntervalMs: 250,
    accept: "application/xml",
  });
}

export { resolvePmcImageUrls };

async function resolvePmcImageUrls(pmcid: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const html = await fetchText(`https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`, {
      timeoutMs: 30_000,
      minIntervalMs: 400,
      accept: "text/html",
    });
    const urls = html.match(/https:\/\/cdn\.ncbi\.nlm\.nih\.gov\/pmc\/blobs\/[^"'\s<>\\]+/g) ?? [];
    for (const url of urls) {
      const cleanUrl = url.replace(/&amp;/g, "&");
      const basename = cleanUrl.split("/").pop();
      if (basename) map.set(basename, cleanUrl);
    }
  } catch {
    // images will fall back to link-only
  }
  return map;
}

export interface FullTextResult {
  accessStatus: "oa_fulltext" | "abstract_only";
  sections: number;
  figures: number;
  license: string | null;
  error: string | null;
}

function storeAbstractOnly(paper: Paper, error: string | null, permanent = true): FullTextResult {
  if (permanent && paper.fullTextAccessStatus !== "abstract_only") {
    updatePaper(paper.id, { full_text_access_status: "abstract_only" }, "full-text access downgraded");
  }
  upsertFullText({
    paperId: paper.id,
    accessStatus: "abstract_only",
    sourceName: null,
    sourceUrl: paper.officialUrl,
    license: paper.fullTextLicense,
    licenseAllowsStorage: false,
    sections: [],
    charCount: 0,
    fetchedAt: nowIso(),
    error,
  });
  return { accessStatus: "abstract_only", sections: 0, figures: 0, license: paper.fullTextLicense, error };
}

/**
 * Fetches JATS full text + figure captions from Europe PMC for open-access
 * papers only. Copyrighted material is never stored (§6.1-E, §15).
 */
export async function fetchAndStoreFullText(
  paper: Paper,
  options: { force?: boolean } = {},
): Promise<FullTextResult> {
  const row = getDb()
    .prepare("SELECT pmcid, full_text_access_status FROM papers WHERE id = ?")
    .get(paper.id) as { pmcid: string | null; full_text_access_status: string } | undefined;
  const pmcid = row?.pmcid ?? paper.pmcid;

  if (!options.force) {
    const existing = getDb()
      .prepare("SELECT access_status, char_count, sections_json FROM full_texts WHERE paper_id = ?")
      .get(paper.id) as { access_status: string; char_count: number; sections_json: string | null } | undefined;
    if (existing?.access_status === "oa_fulltext" && existing.char_count > 0) {
      const figureCount = (
        getDb().prepare("SELECT COUNT(*) AS n FROM figures WHERE paper_id = ?").get(paper.id) as { n: number }
      ).n;
      let sectionCount = 0;
      try {
        const parsed = JSON.parse(existing.sections_json ?? "[]");
        sectionCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        sectionCount = 0;
      }
      return {
        accessStatus: "oa_fulltext",
        sections: sectionCount,
        figures: figureCount,
        license: paper.fullTextLicense,
        error: null,
      };
    }
  }

  if (!pmcid) return storeAbstractOnly(paper, "缺少 PMCID，无法获取开放获取全文");
  if (paper.fullTextAccessStatus !== "oa_fulltext") {
    return storeAbstractOnly(paper, "该论文不在开放获取全文集合中");
  }
  // Respect the license before making any full-text request.
  if (paper.fullTextLicense && !licenseAllowsStorage(paper.fullTextLicense)) {
    return storeAbstractOnly(
      paper,
      `许可 ${paper.fullTextLicense} 不允许本地保存全文`,
    );
  }

  let xml: string;
  try {
    xml = await fetchJatsXml(pmcid);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return storeAbstractOnly(paper, `全文 XML 获取失败：${message}`, false);
  }

  let parsedFullText: ParsedFullText;
  try {
    parsedFullText = parseJatsFullText(xml, paper.fullTextLicense);
  } catch (error) {
    return storeAbstractOnly(paper, `XML 解析失败：${error instanceof Error ? error.message : String(error)}`, false);
  }

  const { sections, figures, license } = parsedFullText;
  if (!licenseAllowsStorage(license)) {
    return storeAbstractOnly(paper, `许可 ${license ?? "未知"} 不允许本地保存全文`);
  }

  const imageUrls = figures.some((figure) => figure.href) ? await resolvePmcImageUrls(pmcid) : new Map();

  const figureInputs: FigureInput[] = figures.map((figure) => {
    const cdnUrl = figure.href ? imageUrls.get(figure.href) ?? null : null;
    return {
      number: figure.number,
      title: null,
      legend: figure.legend,
      sourceUrl: cdnUrl ?? `https://pmc.ncbi.nlm.nih.gov/articles/${pmcid}/`,
      imageAccessStatus: cdnUrl ? "available" : "link_only",
      attribution: `Europe PMC / PMC ${pmcid} · 许可 ${license}`,
      panels: figure.panels,
    };
  });

  replaceFigures(paper.id, figureInputs);

  const charCount = sections.reduce((sum, section) => sum + section.text.length, 0);
  upsertFullText({
    paperId: paper.id,
    accessStatus: sections.length ? "oa_fulltext" : "abstract_only",
    sourceName: "Europe PMC",
    sourceUrl: `https://europepmc.org/articles/${pmcid}`,
    license,
    licenseAllowsStorage: true,
    sections,
    charCount,
    fetchedAt: nowIso(),
    error: sections.length ? null : "XML 中未解析到正文段落",
  });

  if (license && license !== paper.fullTextLicense) {
    updatePaper(paper.id, { full_text_license: license }, "full-text license discovered");
  }

  return {
    accessStatus: sections.length ? "oa_fulltext" : "abstract_only",
    sections: sections.length,
    figures: figureInputs.length,
    license,
    error: null,
  };
}
