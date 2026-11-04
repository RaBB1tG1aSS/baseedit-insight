/**
 * One-off text repair for records ingested before HTML entity decoding was fixed.
 * Safe to run repeatedly: only writes fields that actually change.
 *
 *   npx tsx scripts/repair-text.ts
 */
import { getDb } from "../src/server/db/client";
import { updatePaper } from "../src/server/db/repo/papers";
import { stripMarkup } from "../src/server/utils/normalize";

const db = getDb();
const rows = db
  .prepare("SELECT id, title, abstract, authors_json, keywords_json FROM papers")
  .all() as {
  id: string;
  title: string;
  abstract: string | null;
  authors_json: string;
  keywords_json: string;
}[];

let changed = 0;
for (const row of rows) {
  const patch: Record<string, unknown> = {};
  const title = stripMarkup(row.title);
  if (title && title !== row.title) patch.title = title;
  if (row.abstract) {
    const abstract = stripMarkup(row.abstract);
    if (abstract !== row.abstract) patch.abstract = abstract;
  }
  try {
    const authors = (JSON.parse(row.authors_json) as string[]).map(stripMarkup).filter(Boolean);
    if (JSON.stringify(authors) !== row.authors_json) patch.authors_json = JSON.stringify(authors);
  } catch {
    // ignore malformed JSON
  }
  try {
    const keywords = (JSON.parse(row.keywords_json) as string[]).map(stripMarkup).filter(Boolean);
    if (JSON.stringify(keywords) !== row.keywords_json) patch.keywords_json = JSON.stringify(keywords);
  } catch {
    // ignore malformed JSON
  }

  if (Object.keys(patch).length) {
    updatePaper(row.id, patch, "text normalization repair");
    changed += 1;
  }
}

console.log(`Checked ${rows.length} papers; repaired ${changed}.`);
