import type { DashboardData, FocusArea, WorkerStatus } from "@/lib/types";
import { FOCUS_AREAS } from "@/lib/constants";
import { getDb, nowIso } from "../client";
import { env } from "../../env";
import { getSettings } from "./settings";
import { nextRun } from "../../utils/time";
import { countByStatus, getRecentAccepted } from "./papers";
import { getReadingHistory, countReadingThisWeek } from "./user";
import { getLatestWeeklyReport, getRecentRelations, getRecommendationForDate } from "./knowledge";
import { todayInZone } from "../client";
import { mapPaperSummary, parseJson, PAPER_COLUMNS, type PaperRow } from "../mappers";

export function heartbeat(workerId: string, schedulerEnabled: boolean): void {
  getDb()
    .prepare(
      `INSERT INTO worker_heartbeats (worker_id, last_seen, version, pid, scheduler_enabled)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(worker_id) DO UPDATE SET
         last_seen = excluded.last_seen,
         version = excluded.version,
         pid = excluded.pid,
         scheduler_enabled = excluded.scheduler_enabled`,
    )
    .run(workerId, nowIso(), env.workerVersion, process.pid, schedulerEnabled ? 1 : 0);
}

export function getWorkerStatus(): WorkerStatus {
  const settings = getSettings();
  const row = getDb()
    .prepare("SELECT * FROM worker_heartbeats ORDER BY last_seen DESC LIMIT 1")
    .get() as Record<string, unknown> | undefined;

  const lastSeen = (row?.last_seen as string | null) ?? null;
  const online = lastSeen ? Date.now() - Date.parse(lastSeen) < 25_000 : false;
  const daily = nextRun(settings.timezone, settings.dailyRunTime);
  const weekly = nextRun(settings.timezone, settings.weeklyRunTime, {
    weekday: Number(settings.weeklyRunDay) || 0,
  });

  return {
    online,
    lastSeen,
    version: (row?.version as string | null) ?? null,
    nextDailyRun: settings.schedulerEnabled ? daily.iso : null,
    nextWeeklyRun: settings.schedulerEnabled ? weekly.iso : null,
    schedulerEnabled: Boolean(row?.scheduler_enabled ?? settings.schedulerEnabled),
  };
}

export function getDashboardData(): DashboardData {
  const settings = getSettings();
  const today = todayInZone(settings.timezone);
  const weekAgoIso = new Date(Date.now() - 7 * 86400000).toISOString();

  const todayRecommendation = getRecommendationForDate(today);
  const recentPapers = getRecentAccepted(6).map((paper) => ({
    id: paper.id,
    title: paper.title,
    titleZh: paper.titleZh,
    authors: paper.authors,
    journal: paper.journal,
    publicationDate: paper.publicationDate,
    articleType: paper.articleType,
    peerReviewStatus: paper.peerReviewStatus,
    retractionStatus: paper.retractionStatus,
    qualityScore: paper.qualityScore,
    recommendationCategory: paper.recommendationCategory,
    focusAreas: paper.focusAreas,
    status: paper.status,
    citationCount: paper.citationCount,
    fullTextAccessStatus: paper.fullTextAccessStatus,
  }));

  const statusCounts = countByStatus();
  const papersTotal = statusCounts.accepted ?? 0;

  const acceptedThisWeek = (
    getDb()
      .prepare(
        "SELECT COUNT(*) AS n FROM papers WHERE status='accepted' AND verified_at >= ?",
      )
      .get(weekAgoIso) as { n: number }
  ).n;

  const newEntities = (
    getDb()
      .prepare("SELECT COUNT(*) AS n FROM knowledge_entities WHERE created_at >= ?")
      .get(weekAgoIso) as { n: number }
  ).n;

  const readingThisWeek = countReadingThisWeek(weekAgoIso);

  // Topic distribution is computed from the verified corpus only.
  const focusRows = getDb()
    .prepare("SELECT focus_areas_json FROM papers WHERE status='accepted'")
    .all() as { focus_areas_json: string }[];
  const focusCounts = new Map<FocusArea, number>();
  for (const row of focusRows) {
    for (const area of parseJson<FocusArea[]>(row.focus_areas_json, [])) {
      focusCounts.set(area, (focusCounts.get(area) ?? 0) + 1);
    }
  }
  const hotTopics = FOCUS_AREAS.map((area) => ({
    key: area.key,
    label: area.label,
    count: focusCounts.get(area.key) ?? 0,
  })).sort((a, b) => b.count - a.count);

  return {
    today: todayRecommendation,
    recentPapers,
    weeklyProgress: {
      acceptedThisWeek,
      readingThisWeek,
      newEntities,
      papersTotal,
    },
    readingHistory: getReadingHistory(4).map((entry) => ({ paper: entry.paper, openedAt: entry.openedAt })),
    hotTopics,
    graphUpdates: getRecentRelations(5),
    latestReport: getLatestWeeklyReport(),
    worker: getWorkerStatus(),
  };
}

/** Library landing stats (counts per focus area) — kept out of the dashboard model. */
export function getFocusAreaCounts(): { key: FocusArea; label: string; count: number }[] {
  const rows = getDb()
    .prepare("SELECT focus_areas_json FROM papers WHERE status='accepted'")
    .all() as { focus_areas_json: string }[];
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const area of parseJson<string[]>(row.focus_areas_json, [])) {
      counts.set(area, (counts.get(area) ?? 0) + 1);
    }
  }
  return FOCUS_AREAS.map((area) => ({
    key: area.key,
    label: area.label,
    count: counts.get(area.key) ?? 0,
  }));
}

export function getRecentPaperSummaries(limit = 12) {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p WHERE p.status='accepted'
       ORDER BY p.created_at DESC LIMIT ?`,
    )
    .all(limit) as PaperRow[];
  return rows.map(mapPaperSummary);
}
