/**
 * Migration 0001 — full central literature database schema.
 *
 * Design notes
 * - papers.id is the permanent internal key. External identifiers (DOI/PMID/PMCID/
 *   OpenAlex) are matching keys and are nullable (prompt §6.1-A).
 * - Candidate papers live in the same table but are isolated by `status`; every
 *   read-facing repository only exposes `accepted` papers (prompt §1.2).
 * - Every AI artefact carries paper_id + template version + model + time.
 */
export const sql = /* sql */ `
CREATE TABLE IF NOT EXISTS papers (
  id                       TEXT PRIMARY KEY,
  doi                      TEXT,
  pmid                     TEXT,
  pmcid                    TEXT,
  openalex_id              TEXT,
  semantic_scholar_id      TEXT,
  title                    TEXT NOT NULL,
  title_key                TEXT NOT NULL DEFAULT '',
  title_zh                 TEXT,
  authors_json             TEXT NOT NULL DEFAULT '[]',
  journal                  TEXT,
  publication_date         TEXT,
  online_publication_date  TEXT,
  article_type             TEXT,
  abstract                 TEXT,
  keywords_json            TEXT NOT NULL DEFAULT '[]',
  official_url             TEXT,
  peer_review_status       TEXT NOT NULL DEFAULT 'unknown'
                             CHECK (peer_review_status IN ('peer_reviewed','preprint','unknown')),
  publication_status       TEXT NOT NULL DEFAULT 'unknown'
                             CHECK (publication_status IN ('published','ahead_of_print','epub','preprint','retracted','unknown')),
  retraction_status        TEXT NOT NULL DEFAULT 'unknown'
                             CHECK (retraction_status IN ('none','retracted','expression_of_concern','correction','unknown')),
  retraction_note          TEXT,
  full_text_access_status  TEXT NOT NULL DEFAULT 'unknown'
                             CHECK (full_text_access_status IN ('oa_fulltext','abstract_only','unknown')),
  full_text_license        TEXT,
  quality_score            REAL,
  quality_summary          TEXT,
  recommendation_category  TEXT CHECK (recommendation_category IN ('latest','landmark') OR recommendation_category IS NULL),
  focus_areas_json         TEXT NOT NULL DEFAULT '[]',
  citation_count           INTEGER NOT NULL DEFAULT 0,
  status                   TEXT NOT NULL DEFAULT 'discovered'
                             CHECK (status IN ('discovered','candidate','metadata_verified','quality_assessed','accepted','rejected','needs_review')),
  verified_at              TEXT,
  needs_analysis_refresh   INTEGER NOT NULL DEFAULT 0,
  data_version             INTEGER NOT NULL DEFAULT 1,
  created_at               TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_doi    ON papers(doi)         WHERE doi IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_pmid   ON papers(pmid)        WHERE pmid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_pmcid  ON papers(pmcid)       WHERE pmcid IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_papers_oalex  ON papers(openalex_id) WHERE openalex_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_papers_status        ON papers(status);
CREATE INDEX IF NOT EXISTS ix_papers_title_key     ON papers(title_key);
CREATE INDEX IF NOT EXISTS ix_papers_pubdate       ON papers(publication_date DESC);
CREATE INDEX IF NOT EXISTS ix_papers_score         ON papers(quality_score DESC);
CREATE INDEX IF NOT EXISTS ix_papers_category      ON papers(recommendation_category);

CREATE TABLE IF NOT EXISTS sources (
  source_id              TEXT PRIMARY KEY,
  paper_id               TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  source_name            TEXT NOT NULL,
  source_url             TEXT,
  external_id            TEXT,
  retrieval_time         TEXT NOT NULL,
  original_metadata_json TEXT,
  verification_status    TEXT NOT NULL DEFAULT 'unverified'
                           CHECK (verification_status IN ('unverified','verified','conflict','failed')),
  UNIQUE (source_name, external_id)
);
CREATE INDEX IF NOT EXISTS ix_sources_paper ON sources(paper_id);

CREATE TABLE IF NOT EXISTS verification_records (
  verification_id TEXT PRIMARY KEY,
  paper_id        TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  check_item      TEXT NOT NULL,
  result          TEXT NOT NULL CHECK (result IN ('pass','fail','conflict','warning')),
  evidence_source TEXT,
  evidence        TEXT,
  notes           TEXT,
  checked_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_verification_paper ON verification_records(paper_id, checked_at DESC);

CREATE TABLE IF NOT EXISTS quality_assessments (
  assessment_id  TEXT PRIMARY KEY,
  paper_id       TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  dimension      TEXT NOT NULL,
  label          TEXT,
  score          REAL NOT NULL,
  max_score      REAL NOT NULL,
  rationale      TEXT,
  method         TEXT NOT NULL CHECK (method IN ('rule','llm','hybrid')),
  model          TEXT,
  prompt_version TEXT,
  assessed_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_quality_paper ON quality_assessments(paper_id, assessed_at DESC);

CREATE TABLE IF NOT EXISTS full_texts (
  paper_id                TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  access_status           TEXT NOT NULL CHECK (access_status IN ('oa_fulltext','abstract_only','unknown')),
  source_name             TEXT,
  source_url              TEXT,
  license                 TEXT,
  license_allows_storage  INTEGER NOT NULL DEFAULT 0,
  sections_json           TEXT,
  char_count              INTEGER NOT NULL DEFAULT 0,
  fetched_at              TEXT,
  error                   TEXT
);

CREATE TABLE IF NOT EXISTS figures (
  figure_id            TEXT PRIMARY KEY,
  paper_id             TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  figure_number        TEXT NOT NULL,
  figure_title         TEXT,
  legend               TEXT,
  source_url           TEXT,
  image_access_status  TEXT NOT NULL DEFAULT 'unavailable'
                         CHECK (image_access_status IN ('available','link_only','unavailable')),
  attribution          TEXT,
  panels_json          TEXT NOT NULL DEFAULT '[]',
  created_at           TEXT NOT NULL,
  updated_at           TEXT NOT NULL,
  UNIQUE (paper_id, figure_number)
);
CREATE INDEX IF NOT EXISTS ix_figures_paper ON figures(paper_id);

CREATE TABLE IF NOT EXISTS ai_analyses (
  analysis_id      TEXT PRIMARY KEY,
  paper_id         TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  figure_id        TEXT REFERENCES figures(figure_id) ON DELETE CASCADE,
  kind             TEXT NOT NULL CHECK (kind IN ('deep_read','figure','knowledge','weekly')),
  analysis_level   TEXT NOT NULL DEFAULT 'abstract_only'
                     CHECK (analysis_level IN ('full_text','abstract_only')),
  template_version TEXT NOT NULL,
  model            TEXT NOT NULL,
  provider         TEXT NOT NULL,
  content_json     TEXT,
  status           TEXT NOT NULL DEFAULT 'succeeded'
                     CHECK (status IN ('succeeded','failed','stale')),
  error            TEXT,
  source_hash      TEXT,
  generated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_ai_paper ON ai_analyses(paper_id, kind, generated_at DESC);

CREATE TABLE IF NOT EXISTS daily_recommendations (
  recommendation_id TEXT PRIMARY KEY,
  rec_date          TEXT NOT NULL UNIQUE,
  paper_id          TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  rec_type          TEXT NOT NULL CHECK (rec_type IN ('latest','landmark')),
  reason            TEXT NOT NULL,
  innovation        TEXT NOT NULL,
  value             TEXT NOT NULL,
  score             REAL NOT NULL,
  created_at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_recommendations_paper ON daily_recommendations(paper_id);

CREATE TABLE IF NOT EXISTS knowledge_entities (
  entity_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  name_zh         TEXT,
  entity_type     TEXT NOT NULL,
  description     TEXT,
  aliases_json    TEXT NOT NULL DEFAULT '[]',
  normalized_name TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL,
  UNIQUE (entity_type, normalized_name)
);

CREATE TABLE IF NOT EXISTS knowledge_relations (
  relation_id      TEXT PRIMARY KEY,
  source_entity_id TEXT NOT NULL REFERENCES knowledge_entities(entity_id) ON DELETE CASCADE,
  target_entity_id TEXT NOT NULL REFERENCES knowledge_entities(entity_id) ON DELETE CASCADE,
  relation_type    TEXT NOT NULL,
  paper_id         TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  evidence_text    TEXT NOT NULL,
  evidence_location TEXT,
  nature           TEXT NOT NULL
                     CHECK (nature IN ('reported_fact','author_interpretation','ai_synthesis','hypothesis')),
  confidence       REAL NOT NULL DEFAULT 0.5,
  created_at       TEXT NOT NULL,
  UNIQUE (source_entity_id, target_entity_id, relation_type, paper_id)
);
CREATE INDEX IF NOT EXISTS ix_relations_source ON knowledge_relations(source_entity_id);
CREATE INDEX IF NOT EXISTS ix_relations_target ON knowledge_relations(target_entity_id);
CREATE INDEX IF NOT EXISTS ix_relations_paper  ON knowledge_relations(paper_id);

CREATE TABLE IF NOT EXISTS entity_paper_links (
  entity_id TEXT NOT NULL REFERENCES knowledge_entities(entity_id) ON DELETE CASCADE,
  paper_id  TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'mentions',
  PRIMARY KEY (entity_id, paper_id, role)
);

CREATE TABLE IF NOT EXISTS timeline_events (
  event_id       TEXT PRIMARY KEY,
  event_date     TEXT NOT NULL,
  date_kind      TEXT NOT NULL CHECK (date_kind IN ('publication','first_report','validation')),
  title          TEXT NOT NULL,
  title_zh       TEXT,
  description    TEXT,
  category       TEXT NOT NULL,
  paper_id       TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  evidence_text  TEXT,
  significance   INTEGER NOT NULL DEFAULT 3,
  created_at     TEXT NOT NULL,
  UNIQUE (paper_id, title, date_kind)
);
CREATE INDEX IF NOT EXISTS ix_timeline_date ON timeline_events(event_date);

CREATE TABLE IF NOT EXISTS weekly_reports (
  report_id         TEXT PRIMARY KEY,
  week_start        TEXT NOT NULL UNIQUE,
  week_end          TEXT NOT NULL,
  title             TEXT NOT NULL,
  content_json      TEXT,
  content_md        TEXT,
  cited_papers_json TEXT NOT NULL DEFAULT '[]',
  model             TEXT,
  prompt_version    TEXT,
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','failed')),
  generated_at      TEXT NOT NULL,
  created_at        TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_records (
  paper_id         TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  favorite         INTEGER NOT NULL DEFAULT 0,
  read_status      TEXT NOT NULL DEFAULT 'unread' CHECK (read_status IN ('unread','reading','read')),
  reading_progress REAL NOT NULL DEFAULT 0,
  note             TEXT NOT NULL DEFAULT '',
  last_opened_at   TEXT,
  updated_at       TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reading_events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id  TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  opened_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_reading_events_time ON reading_events(opened_at DESC);

CREATE TABLE IF NOT EXISTS jobs (
  job_id         TEXT PRIMARY KEY,
  job_type       TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','running','succeeded','failed','cancelled')),
  payload_json   TEXT NOT NULL DEFAULT '{}',
  requested_by   TEXT NOT NULL DEFAULT 'scheduler',
  created_at     TEXT NOT NULL,
  started_at     TEXT,
  finished_at    TEXT,
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 2,
  error          TEXT,
  progress_json  TEXT,
  worker_id      TEXT,
  locked_at      TEXT
);
CREATE INDEX IF NOT EXISTS ix_jobs_status ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS ix_jobs_type   ON jobs(job_type, created_at DESC);

CREATE TABLE IF NOT EXISTS job_logs (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id    TEXT NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  ts        TEXT NOT NULL,
  level     TEXT NOT NULL CHECK (level IN ('info','warn','error')),
  stage     TEXT NOT NULL,
  message   TEXT NOT NULL,
  data_json TEXT
);
CREATE INDEX IF NOT EXISTS ix_job_logs_job ON job_logs(job_id, id);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id         TEXT PRIMARY KEY,
  last_seen         TEXT NOT NULL,
  version           TEXT NOT NULL,
  pid               INTEGER,
  scheduler_enabled INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS search_runs (
  run_id       TEXT PRIMARY KEY,
  job_id       TEXT,
  source       TEXT NOT NULL,
  query        TEXT NOT NULL,
  executed_at  TEXT NOT NULL,
  result_count INTEGER NOT NULL DEFAULT 0,
  duration_ms  INTEGER NOT NULL DEFAULT 0,
  error        TEXT
);

CREATE TABLE IF NOT EXISTS paper_change_log (
  change_id  INTEGER PRIMARY KEY AUTOINCREMENT,
  paper_id   TEXT NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT,
  changed_at TEXT NOT NULL,
  reason     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_change_paper ON paper_change_log(paper_id, changed_at DESC);
`;
