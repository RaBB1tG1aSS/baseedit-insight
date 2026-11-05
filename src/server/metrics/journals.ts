import type {
  AppSettings,
  JournalMetricCoverage,
  JournalMetricMode,
  JournalMetricRecord,
  JournalMetricSource,
} from "@/lib/types";
import { getDb, newId, nowIso } from "../db/client";
import { env } from "../env";
import { fetchJson } from "../sources/http";
import { titleSimilarity } from "../utils/normalize";

export interface ResolvedJournalMetric {
  value: number;
  source: JournalMetricSource;
  year: number;
  journalName: string;
  issn: string | null;
}

interface MetricRow extends Record<string, unknown> {
  journal_id: string;
  journal_name: string;
  normalized_name: string;
  issn: string | null;
  eissn: string | null;
  metric_source: JournalMetricSource;
  metric_year: number;
  impact_factor: number;
}

const attempted = new Map<string, ResolvedJournalMetric | null>();

export function normalizeJournalName(name: string | null | undefined): string {
  if (!name) return "";
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^the\s+/, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeIssn(value: string | null | undefined): string | null {
  if (!value) return null;
  const cleaned = value.toUpperCase().replace(/[^0-9X]/g, "");
  return cleaned.length === 8 ? cleaned : null;
}

function sourceOrder(mode: JournalMetricMode): JournalMetricSource[] {
  switch (mode) {
    case "jcr":
      return ["jcr", "custom"];
    case "openalex":
      return ["openalex"];
    case "auto":
    case "off":
    default:
      return ["jcr", "custom", "openalex"];
  }
}

function rowToMetric(row: MetricRow): ResolvedJournalMetric {
  return {
    value: Number(row.impact_factor),
    source: row.metric_source,
    year: Number(row.metric_year ?? 0),
    journalName: row.journal_name,
    issn: row.issn ?? null,
  };
}

function fuzzyLookup(source: JournalMetricSource, journal: string): ResolvedJournalMetric | null {
  const key = normalizeJournalName(journal);
  if (!key) return null;
  const tokens = key
    .split(" ")
    .filter((token) => token.length >= 5)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3);
  if (!tokens.length) return null;

  const conditions = tokens.map(() => "normalized_name LIKE ?").join(" OR ");
  const rows = getDb()
    .prepare(
      `SELECT * FROM journal_metrics WHERE metric_source = ? AND (${conditions})
       ORDER BY metric_year DESC LIMIT 60`,
    )
    .all(source, ...tokens.map((token) => `%${token}%`)) as MetricRow[];

  let best: { metric: ResolvedJournalMetric; similarity: number } | null = null;
  for (const row of rows) {
    const similarity = titleSimilarity(row.journal_name, journal);
    if (similarity < 0.88) continue;
    if (!best || similarity > best.similarity) {
      best = { metric: rowToMetric(row), similarity };
    }
  }
  return best?.metric ?? null;
}

export function findJournalMetric(
  input: { journal?: string | null; issn?: string | null },
  mode: JournalMetricMode,
): ResolvedJournalMetric | null {
  const journal = input.journal?.trim() ?? "";
  const issn = normalizeIssn(input.issn);
  if (!journal && !issn) return null;

  const db = getDb();
  for (const source of sourceOrder(mode)) {
    if (issn) {
      const exactIssn = db
        .prepare(
          `SELECT * FROM journal_metrics WHERE metric_source = ?
           AND (issn = ? OR eissn = ?) ORDER BY metric_year DESC LIMIT 1`,
        )
        .get(source, issn, issn) as MetricRow | undefined;
      if (exactIssn) return rowToMetric(exactIssn);
    }

    const key = normalizeJournalName(journal);
    if (key) {
      const exactName = db
        .prepare(
          `SELECT * FROM journal_metrics WHERE metric_source = ? AND normalized_name = ?
           ORDER BY metric_year DESC LIMIT 1`,
        )
        .get(source, key) as MetricRow | undefined;
      if (exactName) return rowToMetric(exactName);
    }

    const fuzzy = journal ? fuzzyLookup(source, journal) : null;
    if (fuzzy) return fuzzy;
  }

  return null;
}

export async function ensureOpenAlexJournalMetric(input: {
  journal: string | null | undefined;
  issn?: string | null;
  force?: boolean;
}): Promise<ResolvedJournalMetric | null> {
  const journal = input.journal?.trim() ?? "";
  const issn = normalizeIssn(input.issn);
  if (!journal && !issn) return null;

  const key = `${normalizeJournalName(journal)}|${issn ?? ""}`;
  if (!input.force) {
    const existing = findJournalMetric({ journal, issn }, "openalex");
    if (existing) return existing;
    if (attempted.has(key)) return attempted.get(key) ?? null;
  }

  try {
    const params = new URLSearchParams({
      "per-page": "5",
      mailto: env.openalexMailto || "anonymous@example.com",
    });
    if (issn) params.set("filter", `issn:${issn}`);
    else params.set("search", journal);
    const response = await fetchJson<{ results?: Record<string, unknown>[] }>(
      `https://api.openalex.org/sources?${params.toString()}`,
      { minIntervalMs: 220, timeoutMs: 25_000 },
    );

    const results = response.results ?? [];
    let best: { row: Record<string, unknown>; similarity: number } | null = null;
    for (const row of results) {
      const name = String(row.display_name ?? "");
      const rowIssn = normalizeIssn(String(row.issn_l ?? ""));
      const similarity =
        issn && rowIssn === issn ? 1 : titleSimilarity(name, journal);
      if (similarity < 0.85) continue;
      if (!best || similarity > best.similarity) best = { row, similarity };
    }

    if (!best) {
      attempted.set(key, null);
      return null;
    }

    const summary = (best.row.summary_stats ?? {}) as Record<string, unknown>;
    const value = Number(summary["2yr_mean_citedness"]);
    if (!Number.isFinite(value) || value <= 0) {
      attempted.set(key, null);
      return null;
    }

    const sourceIssns = [(best.row.issn_l as string | undefined), ...((best.row.issn as string[] | undefined) ?? [])]
      .map((item) => normalizeIssn(item ?? null))
      .filter((item): item is string => Boolean(item));
    const displayName = String(best.row.display_name ?? journal);
    const metric: ResolvedJournalMetric = {
      value: Math.round(value * 100) / 100,
      source: "openalex",
      year: new Date().getFullYear(),
      journalName: displayName,
      issn: sourceIssns[0] ?? issn,
    };

    storeMetric({
      journalName: displayName,
      issn: sourceIssns[0] ?? issn,
      eissn: sourceIssns[1] ?? null,
      source: "openalex",
      year: metric.year,
      value: metric.value,
      raw: best.row,
    });
    attempted.set(key, metric);
    return metric;
  } catch {
    attempted.set(key, null);
    return null;
  }
}

function storeMetric(input: {
  journalName: string;
  issn?: string | null;
  eissn?: string | null;
  source: JournalMetricSource;
  year: number;
  value: number;
  raw?: unknown;
}): void {
  const normalized = normalizeJournalName(input.journalName);
  if (!normalized) return;
  const now = nowIso();
  getDb()
    .prepare(
      `INSERT INTO journal_metrics
        (journal_id, journal_name, normalized_name, issn, eissn, metric_source, metric_year, impact_factor, raw_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(normalized_name, metric_source, metric_year) DO UPDATE SET
         journal_name = excluded.journal_name,
         issn = excluded.issn,
         eissn = excluded.eissn,
         impact_factor = excluded.impact_factor,
         raw_json = excluded.raw_json,
         updated_at = excluded.updated_at`,
    )
    .run(
      newId("jrn"),
      input.journalName,
      normalized,
      normalizeIssn(input.issn),
      normalizeIssn(input.eissn),
      input.source,
      input.year,
      input.value,
      input.raw == null ? null : JSON.stringify(input.raw),
      now,
      now,
    );
}

/** Copy the best available metric into papers for display/filtering. */
export function applyMetricsToPapers(): number {
  const db = getDb();
  const papers = db
    .prepare("SELECT id, journal, journal_issn FROM papers WHERE journal IS NOT NULL AND journal <> ''")
    .all() as { id: string; journal: string; journal_issn: string | null }[];
  const update = db.prepare(
    `UPDATE papers SET journal_issn = COALESCE(?, journal_issn), journal_metric = ?,
       journal_metric_source = ?, journal_metric_year = ?, updated_at = ? WHERE id = ?`,
  );
  let changed = 0;
  const run = db.transaction(() => {
    for (const paper of papers) {
      const metric = findJournalMetric(
        { journal: paper.journal, issn: paper.journal_issn },
        "auto",
      );
      if (!metric) continue;
      update.run(metric.issn, metric.value, metric.source, metric.year, nowIso(), paper.id);
      changed += 1;
    }
  });
  run();
  return changed;
}

export function applyJournalMetricToPaper(paperId: string, metric: ResolvedJournalMetric | null): void {
  if (!metric) return;
  getDb()
    .prepare(
      `UPDATE papers SET journal_issn = COALESCE(?, journal_issn), journal_metric = ?,
        journal_metric_source = ?, journal_metric_year = ?, updated_at = ? WHERE id = ?`,
    )
    .run(metric.issn, metric.value, metric.source, metric.year, nowIso(), paperId);
}

export async function refreshJournalMetricsForCorpus(options: {
  force?: boolean;
  onLog?: (level: "info" | "warn", message: string) => void;
} = {}): Promise<{ journals: number; fetched: number; failed: number; updatedPapers: number }> {
  const db = getDb();
  const journals = db
    .prepare(
      `SELECT journal, MAX(journal_issn) AS journal_issn, COUNT(*) AS n
       FROM papers WHERE journal IS NOT NULL AND journal <> ''
       GROUP BY journal ORDER BY n DESC`,
    )
    .all() as { journal: string; journal_issn: string | null; n: number }[];

  let fetched = 0;
  let failed = 0;
  for (const item of journals) {
    const metric = await ensureOpenAlexJournalMetric({
      journal: item.journal,
      issn: item.journal_issn,
      force: options.force,
    });
    if (metric) fetched += 1;
    else failed += 1;
    options.onLog?.(
      metric ? "info" : "warn",
      `${item.journal} → ${metric ? `${metric.value} (OpenAlex 2yr citedness)` : "未找到 OpenAlex 指标"}`,
    );
  }

  const updatedPapers = applyMetricsToPapers();
  return { journals: journals.length, fetched, failed, updatedPapers };
}

/** Very small CSV parser with quoted-field support. */
function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((value) => value.some((cell) => cell.trim()));
}

function detectDelimiter(text: string): string {
  const line = text.split(/\r?\n/).find((value) => value.trim()) ?? "";
  const counts: [string, number][] = [
    [",", (line.match(/,/g) ?? []).length],
    ["\t", (line.match(/\t/g) ?? []).length],
    [";", (line.match(/;/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

function headerIndex(headers: string[], aliases: string[]): number {
  return headers.findIndex((header) => aliases.includes(header));
}

function parseMetricValue(raw: string): number | null {
  const value = raw.replace(/[<>≈~,\s]/g, "");
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function importJournalMetricsCsv(
  csv: string,
  options: { source?: "jcr" | "custom"; year?: number } = {},
): { imported: number; skipped: number; updatedPapers: number } {
  const source = options.source ?? "jcr";
  const fallbackYear = options.year ?? new Date().getFullYear();
  const delimiter = detectDelimiter(csv);
  const rows = parseDelimited(csv, delimiter);
  if (rows.length < 2) throw new Error("CSV 至少需要表头和一行数据");

  const normalizeHeader = (header: string) =>
    header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const headerRowIndex = rows.findIndex((row) => {
    const normalized = row.map(normalizeHeader);
    const hasJournal = normalized.some((header) =>
      ["journal", "journal name", "title", "full journal title"].includes(header),
    );
    const hasMetric = normalized.some(
      (header) => header.includes("impact factor") || header.endsWith(" jif") || header === "jif",
    );
    return hasJournal && hasMetric;
  });
  if (headerRowIndex < 0) {
    throw new Error("无法识别表头：需要期刊名称列（Journal/Title）和影响因子列（Impact Factor/JIF）");
  }

  const headers = rows[headerRowIndex].map(normalizeHeader);
  const journalIndex = headerIndex(headers, ["journal", "journal name", "title", "full journal title"]);
  let metricIndex = headerIndex(headers, [
    "impact factor",
    "journal impact factor",
    "jif",
    "if",
    "2024 jif",
    "2025 jif",
    "journal impact factor jif",
  ]);
  if (metricIndex < 0) {
    metricIndex = headers.findIndex(
      (header) => header.includes("impact factor") || header.endsWith(" jif"),
    );
  }
  const issnIndex = headerIndex(headers, ["issn", "issn print", "print issn"]);
  const eissnIndex = headerIndex(headers, ["eissn", "issn online", "online issn"]);
  const yearIndex = headerIndex(headers, ["year", "jcr year", "metric year"]);
  const headerYearMatch = /^(\d{4})\s+jif$/.exec(headers[metricIndex] ?? "");

  if (journalIndex < 0 || metricIndex < 0) {
    throw new Error("无法识别表头：需要期刊名称列（Journal/Title）和影响因子列（Impact Factor/JIF）");
  }

  let imported = 0;
  let skipped = 0;
  const run = getDb().transaction(() => {
    for (const row of rows.slice(headerRowIndex + 1)) {
      const journalName = (row[journalIndex] ?? "").trim();
      const metricValue = parseMetricValue(row[metricIndex] ?? "");
      if (!journalName || metricValue == null) {
        skipped += 1;
        continue;
      }
      const rowYear = yearIndex >= 0 ? Number.parseInt(row[yearIndex] ?? "", 10) : NaN;
      const year =
        Number.isFinite(rowYear) && rowYear > 1900
          ? rowYear
          : headerYearMatch
            ? Number(headerYearMatch[1])
            : fallbackYear;
      const issn = issnIndex >= 0 ? normalizeIssn(row[issnIndex]) : null;
      const eissn = eissnIndex >= 0 ? normalizeIssn(row[eissnIndex]) : null;
      storeMetric({
        journalName,
        issn,
        eissn,
        source,
        year,
        value: metricValue,
        raw: row,
      });
      imported += 1;
    }
  });
  run();

  const updatedPapers = applyMetricsToPapers();
  return { imported, skipped, updatedPapers };
}

export function getJournalMetricCoverage(): JournalMetricCoverage {
  const db = getDb();
  const total = db
    .prepare(
      "SELECT COUNT(DISTINCT journal) AS n FROM papers WHERE status='accepted' AND journal IS NOT NULL AND journal <> ''",
    )
    .get() as { n: number };
  const matched = db
    .prepare(
      "SELECT COUNT(DISTINCT journal) AS n FROM papers WHERE status='accepted' AND journal_metric IS NOT NULL",
    )
    .get() as { n: number };
  const sourceRows = db
    .prepare("SELECT metric_source, COUNT(*) AS n FROM journal_metrics GROUP BY metric_source")
    .all() as { metric_source: string; n: number }[];
  const missing = db
    .prepare(
      `SELECT journal, COUNT(*) AS n FROM papers
       WHERE status='accepted' AND journal IS NOT NULL AND journal <> '' AND journal_metric IS NULL
       GROUP BY journal ORDER BY n DESC LIMIT 12`,
    )
    .all() as { journal: string; n: number }[];
  const recentRows = db
    .prepare(
      `SELECT * FROM journal_metrics ORDER BY updated_at DESC LIMIT 8`,
    )
    .all() as MetricRow[];
  const count = (source: string) => sourceRows.find((row) => row.metric_source === source)?.n ?? 0;

  return {
    totalJournals: Number(total.n),
    matchedJournals: Number(matched.n),
    jcrCount: count("jcr"),
    openalexCount: count("openalex"),
    customCount: count("custom"),
    missingJournals: missing.map((row) => row.journal),
    recent: recentRows.map((row) => ({
      journalId: row.journal_id,
      journalName: row.journal_name,
      issn: row.issn,
      eissn: row.eissn,
      metricSource: row.metric_source,
      metricYear: Number(row.metric_year),
      value: Number(row.impact_factor),
    })),
  };
}

export function listJournalMetrics(limit = 30): JournalMetricRecord[] {
  const rows = getDb()
    .prepare("SELECT * FROM journal_metrics ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as MetricRow[];
  return rows.map((row) => ({
    journalId: row.journal_id,
    journalName: row.journal_name,
    issn: row.issn,
    eissn: row.eissn,
    metricSource: row.metric_source,
    metricYear: Number(row.metric_year),
    value: Number(row.impact_factor),
  }));
}

/** Whether a paper passes the configured metric gate (used by recommendations). */
export function paperPassesJournalMetric(
  paper: { journal: string | null; journalIssn: string | null },
  settings: AppSettings,
): boolean {
  if (settings.journalMetricMode === "off" || settings.minJournalMetric <= 0) return true;
  const metric = findJournalMetric(
    { journal: paper.journal, issn: paper.journalIssn },
    settings.journalMetricMode,
  );
  if (!metric) return settings.journalMetricUnknown === "allow";
  return metric.value >= settings.minJournalMetric;
}
