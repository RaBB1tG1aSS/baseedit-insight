/**
 * Migration 0002 — journal-level impact metrics.
 *
 * JCR Impact Factors are licensed data: the table only stores values the user
 * imports locally. OpenAlex 2-year mean citedness is stored separately and is
 * never labelled as an Impact Factor in the UI.
 */
export const sql = /* sql */ `
ALTER TABLE papers ADD COLUMN journal_issn TEXT;
ALTER TABLE papers ADD COLUMN journal_metric REAL;
ALTER TABLE papers ADD COLUMN journal_metric_source TEXT;
ALTER TABLE papers ADD COLUMN journal_metric_year INTEGER;

CREATE INDEX IF NOT EXISTS ix_papers_journal_metric ON papers(journal_metric);

CREATE TABLE IF NOT EXISTS journal_metrics (
  journal_id      TEXT PRIMARY KEY,
  journal_name    TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  issn            TEXT,
  eissn           TEXT,
  metric_source   TEXT NOT NULL CHECK (metric_source IN ('jcr','openalex','custom')),
  metric_year     INTEGER NOT NULL DEFAULT 0,
  impact_factor   REAL NOT NULL,
  raw_json        TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (normalized_name, metric_source, metric_year)
);

CREATE INDEX IF NOT EXISTS ix_journal_metrics_name ON journal_metrics(normalized_name);
CREATE INDEX IF NOT EXISTS ix_journal_metrics_issn ON journal_metrics(issn);
CREATE INDEX IF NOT EXISTS ix_journal_metrics_eissn ON journal_metrics(eissn);
`;
