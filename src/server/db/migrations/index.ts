import { sql as init } from "./0001_init";
import { sql as journalMetrics } from "./0002_journal_metrics";
import { sql as openMetrics } from "./0003_open_metrics_sources";
import { sql as manualFullText } from "./0004_manual_fulltext";

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  { id: "0001_init", sql: init },
  { id: "0002_journal_metrics", sql: journalMetrics },
  { id: "0003_open_metrics_sources", sql: openMetrics },
  { id: "0004_manual_fulltext", sql: manualFullText },
];
