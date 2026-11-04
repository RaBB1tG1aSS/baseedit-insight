/**
 * Run the daily pipeline from the CLI (useful for the first seed / debugging).
 *
 *   npx tsx scripts/run-pipeline.ts --limit=15 --since-days=180 --deep-reads=1 --figures=2
 *   npx tsx scripts/run-pipeline.ts --search-only --limit=10
 */
import { getDb, todayInZone } from "../src/server/db/client";
import { createJob, finishJob, failJob } from "../src/server/db/repo/jobs";
import { getSettings } from "../src/server/db/repo/settings";
import { runDailyPipeline } from "../src/server/pipeline/runDaily";

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const database = getDb();
  database.prepare("SELECT 1").get();

  const searchOnly = flag("search-only");
  const jobType = searchOnly ? "search_only" : "daily_pipeline";
  const localDate = todayInZone(getSettings().timezone);
  const { job } = createJob(
    jobType,
    { date: localDate, cli: true },
    { requestedBy: "cli", dedupe: false },
  );

  getDb()
    .prepare("UPDATE jobs SET status='running', started_at=? WHERE job_id=?")
    .run(new Date().toISOString(), job.id);

  try {
    const summary = await runDailyPipeline({
      jobId: job.id,
      mode: searchOnly ? "search_only" : "full",
      limit: arg("limit") ? Number(arg("limit")) : undefined,
      sinceDays: arg("since-days") ? Number(arg("since-days")) : undefined,
      maxDeepReads: arg("deep-reads") ? Number(arg("deep-reads")) : undefined,
      maxFigures: arg("figures") ? Number(arg("figures")) : undefined,
      forceWeekly: flag("weekly"),
      includeLandmark: !flag("no-landmark"),
    });
    finishJob(job.id, "succeeded");
    console.log("\n=== SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failJob(job.id, message);
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
