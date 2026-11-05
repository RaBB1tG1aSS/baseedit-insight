/**
 * Fetch OpenAlex journal-level metrics for every journal in the corpus and
 * copy the best available metric onto papers.
 *
 *   npx tsx scripts/refresh-journal-metrics.ts [--force]
 */
import { refreshJournalMetricsForCorpus } from "../src/server/metrics/journals";

async function main(): Promise<void> {
  const result = await refreshJournalMetricsForCorpus({
    force: process.argv.includes("--force"),
    onLog: (level, message) => console.log(`[${level}] ${message}`),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
