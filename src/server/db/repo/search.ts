import type {
  KnowledgeEntity,
  KnowledgeRelation,
  PaperSearchResult,
  TimelineEvent,
  WeeklyReport,
} from "@/lib/types";
import { searchAcceptedPapers } from "./papers";
import {
  searchEntities,
  searchRelations,
  searchTimeline,
  searchWeeklyReports,
} from "./knowledge";

export interface GlobalSearchResult {
  query: string;
  papers: PaperSearchResult;
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  timeline: TimelineEvent[];
  reports: WeeklyReport[];
  total: number;
}

export function globalSearch(query: string, options: { paperLimit?: number } = {}): GlobalSearchResult {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      query: "",
      papers: { papers: [], total: 0, page: 1, pageSize: 6 },
      entities: [],
      relations: [],
      timeline: [],
      reports: [],
      total: 0,
    };
  }

  const paperLimit = options.paperLimit ?? 8;
  const papers = searchAcceptedPapers({ q: trimmed, page: 1, pageSize: paperLimit, sort: "score" });
  const entities = searchEntities(trimmed, 6);
  const relations = searchRelations(trimmed, 6);
  const timeline = searchTimeline(trimmed, 6);
  const reports = searchWeeklyReports(trimmed, 4);

  return {
    query: trimmed,
    papers,
    entities,
    relations,
    timeline,
    reports,
    total:
      papers.total + entities.length + relations.length + timeline.length + reports.length,
  };
}
