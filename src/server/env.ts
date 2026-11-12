import fs from "node:fs";
import path from "node:path";

let loaded = false;

/**
 * Minimal .env loader for the worker/scripts. Next.js loads env files for the
 * web process itself; this keeps both processes reading the same configuration
 * without adding a dependency. Existing process env always wins.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const root = process.cwd();
  for (const file of [".env.local", ".env"]) {
    const full = path.join(root, file);
    if (!fs.existsSync(full)) continue;
    const text = fs.readFileSync(full, "utf8");
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      if (!key || key in process.env) continue;
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

loadEnv();

export const env = {
  databasePath: process.env.DATABASE_PATH || "./data/baseedit.db",
  timezone: process.env.APP_TIMEZONE || "Asia/Singapore",
  dailyRunTime: process.env.DAILY_RUN_TIME || "08:00",
  weeklyRunDay: process.env.WEEKLY_RUN_DAY || "0",
  weeklyRunTime: process.env.WEEKLY_RUN_TIME || "18:00",
  schedulerEnabled: (process.env.SCHEDULER_ENABLED ?? "true") !== "false",
  workerPollMs: Number(process.env.WORKER_POLL_MS || 3000),
  aiProvider: (process.env.AI_PROVIDER || "claude-cli") as "claude-cli" | "anthropic",
  aiModel: process.env.AI_MODEL || "",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicBaseUrl: process.env.ANTHROPIC_BASE_URL || "",
  aiMaxBudgetUsd: Number(process.env.AI_MAX_BUDGET_USD || "1.5"),
  ncbiEmail: process.env.NCBI_EMAIL || "",
  ncbiApiKey: process.env.NCBI_API_KEY || "",
  openalexMailto: process.env.OPENALEX_MAILTO || "",
  semanticScholarApiKey: process.env.SEMANTIC_SCHOLAR_API_KEY || "",
  minAcceptScore: Number(process.env.MIN_ACCEPT_SCORE || "60"),
  minTopicRelevance: Number(process.env.MIN_TOPIC_RELEVANCE || "8"),
  maxCandidatesPerRun: Number(process.env.MAX_CANDIDATES_PER_RUN || "40"),
  journalMetricMode: (process.env.JOURNAL_METRIC_MODE || "auto") as "off" | "jcr" | "openalex" | "snip" | "sjr" | "auto",
  minJournalMetric: Number(process.env.MIN_JOURNAL_METRIC || "1"),
  journalMetricUnknown: (process.env.JOURNAL_METRIC_UNKNOWN || "allow") as "allow" | "reject",
  workerVersion: "1.0.0",
};

export function resolveDatabasePath(): string {
  const p = env.databasePath;
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}
