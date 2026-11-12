/**
 * Migration 0004 — allow full texts imported manually by the user.
 * SQLite cannot alter a CHECK constraint, so full_texts is rebuilt in place.
 */
export const sql = /* sql */ `
CREATE TABLE full_texts_v4 (
  paper_id                TEXT PRIMARY KEY REFERENCES papers(id) ON DELETE CASCADE,
  access_status           TEXT NOT NULL CHECK (access_status IN ('oa_fulltext','abstract_only','unknown','manual_fulltext')),
  source_name             TEXT,
  source_url              TEXT,
  license                 TEXT,
  license_allows_storage  INTEGER NOT NULL DEFAULT 0,
  sections_json           TEXT,
  char_count              INTEGER NOT NULL DEFAULT 0,
  fetched_at              TEXT,
  error                   TEXT
);

INSERT INTO full_texts_v4
  (paper_id, access_status, source_name, source_url, license, license_allows_storage, sections_json, char_count, fetched_at, error)
SELECT paper_id, access_status, source_name, source_url, license, license_allows_storage, sections_json, char_count, fetched_at, error
FROM full_texts;

DROP TABLE full_texts;
ALTER TABLE full_texts_v4 RENAME TO full_texts;
`;
