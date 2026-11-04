import type { JobLog, JobProgress, JobRun, JobStatus, JobType } from "@/lib/types";
import { getDb, newId, nowIso } from "../client";

export interface CreateJobOptions {
  requestedBy?: string;
  maxAttempts?: number;
  /** Avoid creating a duplicate when an identical job is already waiting. */
  dedupe?: boolean;
}

export function createJob(
  type: JobType,
  payload: Record<string, unknown> = {},
  options: CreateJobOptions = {},
): { job: JobRun; created: boolean } {
  const db = getDb();
  const payloadJson = JSON.stringify(payload);

  if (options.dedupe !== false) {
    const existing = db
      .prepare(
        `SELECT * FROM jobs WHERE job_type = ? AND payload_json = ? AND status IN ('queued','running')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(type, payloadJson) as Record<string, unknown> | undefined;
    if (existing) return { job: mapJob(existing), created: false };
  }

  const jobId = newId("job");
  db.prepare(
    `INSERT INTO jobs (job_id, job_type, status, payload_json, requested_by, created_at, attempts, max_attempts)
     VALUES (?, ?, 'queued', ?, ?, ?, 0, ?)`,
  ).run(jobId, type, payloadJson, options.requestedBy ?? "user", nowIso(), options.maxAttempts ?? 2);

  return { job: getJob(jobId)!, created: true };
}

function mapJob(row: Record<string, unknown>): JobRun {
  return {
    id: String(row.job_id),
    type: row.job_type as JobType,
    status: row.status as JobStatus,
    payload: safeParse(row.payload_json),
    requestedBy: String(row.requested_by ?? ""),
    createdAt: String(row.created_at),
    startedAt: (row.started_at as string | null) ?? null,
    finishedAt: (row.finished_at as string | null) ?? null,
    attempts: Number(row.attempts ?? 0),
    maxAttempts: Number(row.max_attempts ?? 1),
    error: (row.error as string | null) ?? null,
    progress: row.progress_json ? (safeParse(row.progress_json) as JobProgress) : null,
  };
}

function safeParse(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function getJob(jobId: string): JobRun | null {
  const row = getDb().prepare("SELECT * FROM jobs WHERE job_id = ?").get(jobId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapJob(row) : null;
}

export function listJobs(limit = 30): JobRun[] {
  const rows = getDb()
    .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map(mapJob);
}

/**
 * Atomically claims the oldest queued job. Safe with more than one worker
 * because the UPDATE re-checks the queued status.
 */
export function claimNextJob(workerId: string): JobRun | null {
  const db = getDb();
  const claim = db.transaction(() => {
    const row = db
      .prepare("SELECT job_id FROM jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
      .get() as { job_id: string } | undefined;
    if (!row) return null;
    const ts = nowIso();
    const result = db
      .prepare(
        `UPDATE jobs SET status='running', started_at=?, worker_id=?, locked_at=?, attempts=attempts+1
         WHERE job_id=? AND status='queued'`,
      )
      .run(ts, workerId, ts, row.job_id);
    if (result.changes !== 1) return null;
    return getJob(row.job_id);
  });
  return claim.immediate();
}

export function setJobProgress(jobId: string, progress: JobProgress): void {
  getDb()
    .prepare("UPDATE jobs SET progress_json = ?, locked_at = ? WHERE job_id = ?")
    .run(JSON.stringify(progress), nowIso(), jobId);
}

export function finishJob(jobId: string, status: "succeeded" | "failed" | "cancelled", error?: string | null): void {
  getDb()
    .prepare("UPDATE jobs SET status = ?, finished_at = ?, error = ?, progress_json = progress_json WHERE job_id = ?")
    .run(status, nowIso(), error ?? null, jobId);
}

/**
 * Failure with retry. A job whose attempts are exhausted becomes failed;
 * otherwise it is re-queued (prompt §13: 异常重试).
 */
export function failJob(jobId: string, error: string): { retried: boolean } {
  const db = getDb();
  const job = getJob(jobId);
  if (!job) return { retried: false };
  if (job.attempts < job.maxAttempts) {
    db.prepare(
      `UPDATE jobs SET status='queued', error=?, locked_at=NULL, worker_id=NULL, started_at=NULL WHERE job_id=?`,
    ).run(error, jobId);
    return { retried: true };
  }
  db.prepare("UPDATE jobs SET status='failed', finished_at=?, error=? WHERE job_id=?").run(
    nowIso(),
    error,
    jobId,
  );
  return { retried: false };
}

export function appendLog(
  jobId: string,
  level: "info" | "warn" | "error",
  stage: string,
  message: string,
  data?: unknown,
): void {
  getDb()
    .prepare("INSERT INTO job_logs (job_id, ts, level, stage, message, data_json) VALUES (?, ?, ?, ?, ?, ?)")
    .run(jobId, nowIso(), level, stage, message, data == null ? null : JSON.stringify(data));
}

export function getJobLogs(jobId: string, limit = 500): JobLog[] {
  const rows = getDb()
    .prepare("SELECT * FROM job_logs WHERE job_id = ? ORDER BY id ASC LIMIT ?")
    .all(jobId, limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    id: Number(row.id),
    jobId: String(row.job_id),
    ts: String(row.ts),
    level: row.level as JobLog["level"],
    stage: String(row.stage),
    message: String(row.message),
    data: row.data_json ? safeParse(row.data_json) : null,
  }));
}

export function getRecentLogs(limit = 80): JobLog[] {
  const rows = getDb()
    .prepare("SELECT * FROM job_logs ORDER BY id DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.reverse().map((row) => ({
    id: Number(row.id),
    jobId: String(row.job_id),
    ts: String(row.ts),
    level: row.level as JobLog["level"],
    stage: String(row.stage),
    message: String(row.message),
    data: row.data_json ? safeParse(row.data_json) : null,
  }));
}

/** Recover jobs whose worker crashed mid-run (timeout handling). */
export function requeueStaleJobs(staleBeforeIso: string): number {
  const db = getDb();
  const stale = db
    .prepare("SELECT job_id FROM jobs WHERE status='running' AND locked_at < ?")
    .all(staleBeforeIso) as { job_id: string }[];
  for (const row of stale) {
    db.prepare(
      `UPDATE jobs SET status='queued', locked_at=NULL, worker_id=NULL, started_at=NULL,
       error='worker heartbeat lost; job re-queued' WHERE job_id=?`,
    ).run(row.job_id);
  }
  return stale.length;
}

export function cancelJob(jobId: string): void {
  getDb()
    .prepare("UPDATE jobs SET status='cancelled', finished_at=?, error='cancelled by user' WHERE job_id=? AND status IN ('queued','running')")
    .run(nowIso(), jobId);
}

export function getJobStats(sinceIso: string): {
  total: number;
  succeeded: number;
  failed: number;
  queued: number;
} {
  const rows = getDb()
    .prepare("SELECT status, COUNT(*) AS n FROM jobs WHERE created_at >= ? GROUP BY status")
    .all(sinceIso) as { status: string; n: number }[];
  const get = (status: string) => rows.find((r) => r.status === status)?.n ?? 0;
  return {
    total: rows.reduce((sum, row) => sum + row.n, 0),
    succeeded: get("succeeded"),
    failed: get("failed"),
    queued: get("queued") + get("running"),
  };
}

export function pruneOldLogs(beforeIso: string): void {
  getDb().prepare("DELETE FROM job_logs WHERE ts < ?").run(beforeIso);
}

export interface SearchRun {
  runId: string;
  source: string;
  query: string;
  executedAt: string;
  resultCount: number;
  durationMs: number;
  error: string | null;
}

export function listSearchRuns(limit = 8): SearchRun[] {
  const rows = getDb()
    .prepare("SELECT * FROM search_runs ORDER BY executed_at DESC LIMIT ?")
    .all(limit) as Record<string, unknown>[];
  return rows.map((row) => ({
    runId: String(row.run_id),
    source: String(row.source ?? ""),
    query: String(row.query ?? ""),
    executedAt: String(row.executed_at ?? ""),
    resultCount: Number(row.result_count ?? 0),
    durationMs: Number(row.duration_ms ?? 0),
    error: (row.error as string | null) ?? null,
  }));
}
