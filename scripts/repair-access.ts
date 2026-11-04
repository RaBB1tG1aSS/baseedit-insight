/**
 * Reconcile papers.full_text_access_status with what was actually stored in
 * full_texts (e.g. an OpenAlex "gold OA" flag does not mean we can legally
 * store and parse the full text). Idempotent.
 *
 *   npx tsx scripts/repair-access.ts
 */
import { getDb } from "../src/server/db/client";
import { getPaperById } from "../src/server/db/repo/papers";
import { fetchAndStoreFullText } from "../src/server/fulltext/europepmc";

async function main(): Promise<void> {
  const ids = getDb()
    .prepare("SELECT id FROM papers WHERE status = 'accepted' ORDER BY quality_score DESC")
    .all() as { id: string }[];

  for (const { id } of ids) {
    const paper = getPaperById(id);
    if (!paper) continue;
    try {
      const result = await fetchAndStoreFullText(paper);
      console.log(
        `${result.accessStatus.padEnd(13)} | sections=${String(result.sections).padStart(3)} figures=${String(result.figures).padStart(2)} | ${paper.title.slice(0, 60)}`,
      );
      if (result.error) console.log(`  ↳ ${result.error}`);
    } catch (error) {
      console.log(`FAILED | ${paper.title.slice(0, 60)} | ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
