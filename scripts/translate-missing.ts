/**
 * Translate Chinese titles for accepted papers that do not have one yet.
 *   npx tsx scripts/translate-missing.ts
 */
import { getDb } from "../src/server/db/client";
import { translateTitles } from "../src/server/ai/translate";

async function main(): Promise<void> {
  const rows = getDb()
    .prepare(
      "SELECT id FROM papers WHERE status = 'accepted' AND (title_zh IS NULL OR title_zh = '') ORDER BY quality_score DESC",
    )
    .all() as { id: string }[];

  if (!rows.length) {
    console.log("All accepted papers already have Chinese titles.");
    return;
  }
  const result = await translateTitles(rows.map((row) => row.id), { batchSize: 10 });
  console.log(`Translated ${result.translated}; failed ${result.failed}; total ${rows.length}.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
