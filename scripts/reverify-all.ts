/**
 * Re-run identity/quality verification for every accepted paper using the
 * current rules. Useful after policy fixes (e.g. stricter OA/licence handling).
 * Does not call AI and does not touch existing analyses.
 *
 *   npx tsx scripts/reverify-all.ts
 */
import { getDb } from "../src/server/db/client";
import { reverifyPaper } from "../src/server/pipeline/reverify";
import { getPaperById } from "../src/server/db/repo/papers";

async function main(): Promise<void> {
  const ids = getDb()
    .prepare("SELECT id FROM papers WHERE status IN ('accepted','needs_review','rejected') ORDER BY quality_score DESC")
    .all() as { id: string }[];

  for (const { id } of ids) {
    const before = getPaperById(id);
    if (!before) continue;
    try {
      const result = await reverifyPaper(id);
      console.log(
        `${result.status.padEnd(13)} ${String(result.quality).padStart(5)}/100  ${before.status === result.status ? "=" : before.status + "→" + result.status}  ${before.title.slice(0, 60)}`,
      );
    } catch (error) {
      console.log(`FAILED  ${before.title.slice(0, 60)} — ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
