import type { EntityType, FocusArea, PaperSummary } from "@/lib/types";
import { ENTITY_TYPE_LABEL, FOCUS_AREAS } from "@/lib/constants";
import { getDb } from "../client";
import { PAPER_COLUMNS, mapPaperSummary, parseJson, type PaperRow } from "../mappers";
import { getPersonalizedRecommendations, type PersonalizedRecommendations } from "./papers";

export interface InsightsData {
  accepted: number;
  rejected: number;
  pending: number;
  byYear: { year: string; count: number }[];
  focus: { key: FocusArea; label: string; count: number }[];
  journals: { journal: string; count: number }[];
  scoreBuckets: { label: string; count: number }[];
  citations: { total: number; average: number; max: number };
  topCited: PaperSummary[];
  entitiesByType: { type: EntityType; label: string; count: number }[];
  reading: { favorites: number; read: number; notes: number };
  weeklyReports: number;
  recommendationTypes: { latest: number; landmark: number };
  personalized: PersonalizedRecommendations;
}

export function getInsightsData(): InsightsData {
  const db = getDb();

  const statusRows = db
    .prepare("SELECT status, COUNT(*) AS n FROM papers GROUP BY status")
    .all() as { status: string; n: number }[];
  const countStatus = (status: string) => statusRows.find((row) => row.status === status)?.n ?? 0;
  const accepted = countStatus("accepted");

  const byYear = db
    .prepare(
      `SELECT substr(publication_date, 1, 4) AS year, COUNT(*) AS count
       FROM papers
       WHERE status = 'accepted' AND publication_date IS NOT NULL
       GROUP BY year ORDER BY year`,
    )
    .all() as { year: string; count: number }[];

  const focusRows = db
    .prepare("SELECT focus_areas_json FROM papers WHERE status = 'accepted'")
    .all() as { focus_areas_json: string }[];
  const focusCounts = new Map<FocusArea, number>();
  for (const row of focusRows) {
    for (const area of parseJson<FocusArea[]>(row.focus_areas_json, [])) {
      focusCounts.set(area, (focusCounts.get(area) ?? 0) + 1);
    }
  }
  const focus = FOCUS_AREAS.map((area) => ({
    key: area.key,
    label: area.label,
    count: focusCounts.get(area.key) ?? 0,
  })).sort((a, b) => b.count - a.count);

  const journals = db
    .prepare(
      `SELECT journal, COUNT(*) AS count FROM papers
       WHERE status = 'accepted' AND journal IS NOT NULL AND journal <> ''
       GROUP BY journal ORDER BY count DESC, journal ASC LIMIT 8`,
    )
    .all() as { journal: string; count: number }[];

  const scoreRows = db
    .prepare("SELECT quality_score FROM papers WHERE status = 'accepted' AND quality_score IS NOT NULL")
    .all() as { quality_score: number }[];
  const scoreBuckets = [
    { label: "60–69", min: 60, max: 70 },
    { label: "70–79", min: 70, max: 80 },
    { label: "80–89", min: 80, max: 90 },
    { label: "90–100", min: 90, max: 101 },
  ].map((bucket) => ({
    label: bucket.label,
    count: scoreRows.filter(
      (row) => row.quality_score >= bucket.min && row.quality_score < bucket.max,
    ).length,
  }));
  if (scoreRows.some((row) => row.quality_score < 60)) {
    scoreBuckets.unshift({
      label: "<60",
      count: scoreRows.filter((row) => row.quality_score < 60).length,
    });
  }

  const citationRow = db
    .prepare(
      `SELECT COUNT(*) AS n, COALESCE(SUM(citation_count),0) AS total,
              COALESCE(AVG(citation_count),0) AS average, COALESCE(MAX(citation_count),0) AS max
       FROM papers WHERE status = 'accepted'`,
    )
    .get() as { n: number; total: number; average: number; max: number };

  const topCitedRows = db
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       WHERE p.status = 'accepted'
       ORDER BY p.citation_count DESC, p.quality_score DESC LIMIT 5`,
    )
    .all() as PaperRow[];

  const entityRows = db
    .prepare(
      `SELECT entity_type, COUNT(*) AS count FROM knowledge_entities
       GROUP BY entity_type ORDER BY count DESC`,
    )
    .all() as { entity_type: EntityType; count: number }[];
  const entitiesByType = entityRows.map((row) => ({
    type: row.entity_type,
    label: ENTITY_TYPE_LABEL[row.entity_type] ?? row.entity_type,
    count: row.count,
  }));

  const readingRow = db
    .prepare(
      `SELECT COALESCE(SUM(favorite),0) AS favorites,
              COALESCE(SUM(CASE WHEN read_status='read' THEN 1 ELSE 0 END),0) AS read,
              COALESCE(SUM(CASE WHEN length(note) > 0 THEN 1 ELSE 0 END),0) AS notes
       FROM user_records`,
    )
    .get() as { favorites: number; read: number; notes: number };

  const weeklyRow = db.prepare("SELECT COUNT(*) AS n FROM weekly_reports").get() as { n: number };
  const recRows = db
    .prepare("SELECT rec_type, COUNT(*) AS count FROM daily_recommendations GROUP BY rec_type")
    .all() as { rec_type: string; count: number }[];

  return {
    accepted,
    rejected: countStatus("rejected"),
    pending:
      countStatus("candidate") + countStatus("discovered") + countStatus("needs_review"),
    byYear,
    focus,
    journals,
    scoreBuckets,
    citations: {
      total: Number(citationRow.total),
      average: Math.round(Number(citationRow.average) * 10) / 10,
      max: Number(citationRow.max),
    },
    topCited: topCitedRows.map(mapPaperSummary),
    entitiesByType,
    reading: {
      favorites: Number(readingRow.favorites),
      read: Number(readingRow.read),
      notes: Number(readingRow.notes),
    },
    weeklyReports: Number(weeklyRow.n),
    recommendationTypes: {
      latest: recRows.find((row) => row.rec_type === "latest")?.count ?? 0,
      landmark: recRows.find((row) => row.rec_type === "landmark")?.count ?? 0,
    },
    personalized: getPersonalizedRecommendations(5),
  };
}
