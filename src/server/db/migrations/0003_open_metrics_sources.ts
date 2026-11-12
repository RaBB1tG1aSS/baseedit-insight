/**
 * Migration 0003 — allow CWTS SNIP and SCImago SJR as metric sources.
 * SQLite cannot alter a CHECK constraint, so the table is rebuilt in place.
 */
export const sql = /* sql */ `
CREATE TABLE journal_metrics_v3 (
  journal_id      TEXT PRIMARY KEY,
  journal_name    TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  issn            TEXT,
  eissn           TEXT,
  metric_source   TEXT NOT NULL CHECK (metric_source IN ('jcr','openalex','custom','snip','sjr')),
  metric_year     INTEGER NOT NULL DEFAULT 0,
  impact_factor   REAL NOT NULL,
  raw_json        TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (normalized_name, metric_source, metric_year)
);

INSERT INTO journal_metrics_v3
  (journal_id, journal_name, normalized_name, issn, eissn, metric_source, metric_year, impact_factor, raw_json, created_at, updated_at)
SELECT journal_id, journal_name, normalized_name, issn, eissn, metric_source, metric_year, impact_factor, raw_json, created_at, updated_at
FROM journal_metrics;

DROP TABLE journal_metrics;
ALTER TABLE journal_metrics_v3 RENAME TO journal_metrics;

CREATE INDEX ix_journal_metrics_name ON journal_metrics(normalized_name);
CREATE INDEX ix_journal_metrics_issn ON journal_metrics(issn);
CREATE INDEX ix_journal_metrics_eissn ON journal_metrics(eissn);
`;
