import crypto from "node:crypto";

const DOI_PREFIXES = [
  "https://doi.org/",
  "http://doi.org/",
  "https://dx.doi.org/",
  "http://dx.doi.org/",
  "doi:",
];

/** Canonical DOI form used for every database write and comparison. */
export function normalizeDoi(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let doi = String(raw).trim();
  for (const prefix of DOI_PREFIXES) {
    if (doi.toLowerCase().startsWith(prefix)) {
      doi = doi.slice(prefix.length);
    }
  }
  doi = doi.trim().replace(/[.,;:]+$/, "");
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) return null;
  return doi.toLowerCase();
}

export function normalizePmid(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim().replace(/^pmid:\s*/i, "");
  return /^\d{4,9}$/.test(value) ? value : null;
}

export function normalizePmcid(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim().toUpperCase();
  const match = value.match(/PMC\d+/);
  return match ? match[0] : null;
}

export function normalizeOpenAlexId(raw: unknown): string | null {
  if (raw == null) return null;
  const value = String(raw).trim();
  const match = value.match(/(W\d{5,})/);
  return match ? match[1] : null;
}

const ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&nbsp;": " ",
  "&mdash;": "—",
  "&ndash;": "–",
};

export function stripMarkup(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const code = Number.parseInt(decimal, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : " ";
    })
    .replace(/&[a-z#0-9]+;/gi, (m) => ENTITY_MAP[m.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalized title used for dedupe / identity matching (§1.3). */
export function normalizeTitle(raw: string | null | undefined): string {
  if (!raw) return "";
  return stripMarkup(raw)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleKey(raw: string | null | undefined): string {
  const normalized = normalizeTitle(raw);
  const compact = normalized.replace(/\s+/g, "");
  return crypto.createHash("sha1").update(compact).digest("hex").slice(0, 20);
}

function bigrams(value: string): Map<string, number> {
  const map = new Map<string, number>();
  const compact = value.replace(/\s+/g, "");
  for (let i = 0; i < compact.length - 1; i += 1) {
    const gram = compact.slice(i, i + 2);
    map.set(gram, (map.get(gram) ?? 0) + 1);
  }
  return map;
}

/**
 * Sørensen–Dice coefficient over character bigrams. Works for both English and
 * Chinese titles and is deliberately conservative about short strings.
 */
export function titleSimilarity(a: string, b: string): number {
  const left = normalizeTitle(a);
  const right = normalizeTitle(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.length < 8 || right.length < 8) return 0;

  const gramsA = bigrams(left);
  const gramsB = bigrams(right);
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const count of gramsA.values()) totalA += count;
  for (const count of gramsB.values()) totalB += count;
  for (const [gram, count] of gramsA) {
    const other = gramsB.get(gram);
    if (other) overlap += Math.min(count, other);
  }
  return (2 * overlap) / (totalA + totalB);
}

/** Same paper if identifiers match, or title is near-identical within ±1 year. */
export function isSameWork(
  a: { title: string; year?: number | null; doi?: string | null; pmid?: string | null; pmcid?: string | null },
  b: { title: string; year?: number | null; doi?: string | null; pmid?: string | null; pmcid?: string | null },
): boolean {
  if (a.doi && b.doi && normalizeDoi(a.doi) === normalizeDoi(b.doi)) return true;
  if (a.pmid && b.pmid && a.pmid === b.pmid) return true;
  if (a.pmcid && b.pmcid && a.pmcid.toUpperCase() === b.pmcid.toUpperCase()) return true;

  const similarity = titleSimilarity(a.title, b.title);
  if (similarity >= 0.94) return true;
  if (similarity >= 0.88 && a.year && b.year && Math.abs(a.year - b.year) <= 1) return true;
  return false;
}

export function yearOf(date: string | null | undefined): number | null {
  if (!date) return null;
  const match = date.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

export function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  let match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = value.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }

  const monthNames: Record<string, number> = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  };
  match = value.match(/^(\d{4})\s+([A-Za-z]{3,9})\.?\s*(\d{1,2})?/);
  if (match) {
    const month = monthNames[match[2].slice(0, 3).toLowerCase()];
    if (month) {
      const day = match[3] ? Number(match[3]) : 1;
      return `${match[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }

  match = value.match(/^(\d{4})[-\s]?(\d{2})?[-\s](\d{1,2})$/);
  if (match) {
    return `${match[1]}-${(match[2] || "01").padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  }
  match = value.match(/^(\d{4})$/);
  if (match) return `${match[1]}-01-01`;
  return null;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

/** Stable hash used to detect whether analysis inputs changed. */
export function contentHash(parts: (string | null | undefined)[]): string {
  return crypto
    .createHash("sha256")
    .update(parts.map((p) => p ?? "").join("\u0000"))
    .digest("hex")
    .slice(0, 24);
}
