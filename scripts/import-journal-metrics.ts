/**
 * Import JCR / custom journal metrics from a local CSV.
 *
 *   npx tsx scripts/import-journal-metrics.ts path/to/jcr.csv --year=2025 --source=jcr
 *
 * JCR Impact Factors are licensed data; the file is parsed locally and never
 * uploaded anywhere.
 */
import fs from "node:fs";
import path from "node:path";
import { importJournalMetricsCsv } from "../src/server/metrics/journals";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

async function main(): Promise<void> {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    throw new Error("Usage: tsx scripts/import-journal-metrics.ts <file.csv> [--year=2025] [--source=jcr|custom]");
  }
  const csv = fs.readFileSync(path.resolve(file), "utf8");
  const source = arg("source") === "custom" ? "custom" : "jcr";
  const year = arg("year") ? Number(arg("year")) : undefined;
  const result = importJournalMetricsCsv(csv, { source, year });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
