import { sql as init } from "./0001_init";
import { sql as journalMetrics } from "./0002_journal_metrics";

export interface Migration {
  id: string;
  sql: string;
}

export const MIGRATIONS: Migration[] = [
  { id: "0001_init", sql: init },
  { id: "0002_journal_metrics", sql: journalMetrics },
];
