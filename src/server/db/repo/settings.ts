import type { AppSettings } from "@/lib/types";
import { PRIMARY_SEARCH_QUERY } from "@/lib/constants";
import { getDb, nowIso } from "../client";
import { env } from "../../env";

export function defaultSettings(): AppSettings {
  return {
    timezone: env.timezone,
    dailyRunTime: env.dailyRunTime,
    weeklyRunDay: env.weeklyRunDay,
    weeklyRunTime: env.weeklyRunTime,
    schedulerEnabled: env.schedulerEnabled,
    aiProvider: env.aiProvider,
    aiModel: env.aiModel,
    minAcceptScore: env.minAcceptScore,
    minTopicRelevance: env.minTopicRelevance,
    maxCandidatesPerRun: env.maxCandidatesPerRun,
    focusQuery: PRIMARY_SEARCH_QUERY,
    ncbiEmail: env.ncbiEmail,
    openalexMailto: env.openalexMailto,
    enableSemanticScholar: Boolean(env.semanticScholarApiKey),
  };
}

export function getSettings(): AppSettings {
  const defaults = defaultSettings();
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as {
    key: string;
    value: string;
  }[];
  const result = { ...defaults } as Record<string, unknown>;
  for (const row of rows) {
    if (!(row.key in defaults)) continue;
    try {
      result[row.key] = JSON.parse(row.value);
    } catch {
      result[row.key] = row.value;
    }
  }
  return result as unknown as AppSettings;
}

const ALLOWED_KEYS: (keyof AppSettings)[] = [
  "timezone",
  "dailyRunTime",
  "weeklyRunDay",
  "weeklyRunTime",
  "schedulerEnabled",
  "aiProvider",
  "aiModel",
  "minAcceptScore",
  "minTopicRelevance",
  "maxCandidatesPerRun",
  "focusQuery",
  "ncbiEmail",
  "openalexMailto",
  "enableSemanticScholar",
];

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const db = getDb();
  const stmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );
  const run = db.transaction(() => {
    for (const key of ALLOWED_KEYS) {
      if (patch[key] === undefined) continue;
      stmt.run(key, JSON.stringify(patch[key]), nowIso());
    }
  });
  run();
  return getSettings();
}

export function getSettingValue<T>(key: keyof AppSettings): T {
  return getSettings()[key] as T;
}
