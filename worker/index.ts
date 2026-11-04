import os from "node:os";
import { schedule, type ScheduledTask } from "node-cron";
import { getDb, todayInZone } from "../src/server/db/client";
import { env } from "../src/server/env";
import { getSettings } from "../src/server/db/repo/settings";
import {
  claimNextJob,
  createJob,
  failJob,
  finishJob,
  getJob,
  requeueStaleJobs,
  appendLog,
} from "../src/server/db/repo/jobs";
import { heartbeat } from "../src/server/db/repo/dashboard";
import { runJob } from "../src/server/jobs/dispatcher";
import { parseTime, weekOf, zonedParts } from "../src/server/utils/time";
import type { JobRun } from "../src/lib/types";

const workerId = `wrk_${os.hostname()}_${process.pid}`;
let running = false;
let stopping = false;
let currentJob: JobRun | null = null;
let lastHeartbeat = 0;
let dailyTask: ScheduledTask | null = null;
let weeklyTask: ScheduledTask | null = null;
let scheduleSignature = "";

function log(message: string, data?: unknown): void {
  const suffix = data ? ` ${JSON.stringify(data)}` : "";
  console.log(`[worker ${new Date().toISOString()}] ${message}${suffix}`);
}

function jobExistsFor(type: string, jsonPath: string, value: string): boolean {
  const row = getDb()
    .prepare(
      `SELECT 1 AS ok FROM jobs WHERE job_type = ? AND json_extract(payload_json, ?) = ? LIMIT 1`,
    )
    .get(type, jsonPath, value) as { ok: number } | undefined;
  return Boolean(row);
}

function enqueueDaily(date: string): void {
  if (jobExistsFor("daily_pipeline", "$.date", date)) {
    log("今日每日流水线已存在，跳过重复调度", { date });
    return;
  }
  const { created, job } = createJob(
    "daily_pipeline",
    { date },
    { requestedBy: "scheduler", dedupe: true },
  );
  log(created ? "已排入每日流水线" : "每日流水线已在队列/运行中", { jobId: job.id, date });
}

function enqueueWeekly(weekStart: string, weekEnd: string): void {
  if (jobExistsFor("weekly_report", "$.weekStart", weekStart)) {
    log("本周周报任务已存在，跳过重复调度", { weekStart });
    return;
  }
  const { created, job } = createJob(
    "weekly_report",
    { weekStart, weekEnd },
    { requestedBy: "scheduler", dedupe: true },
  );
  log(created ? "已排入每周报告" : "每周报告已在队列/运行中", { jobId: job.id, weekStart });
}

function rebuildSchedule(): void {
  const settings = getSettings();
  const signature = [
    settings.schedulerEnabled,
    settings.timezone,
    settings.dailyRunTime,
    settings.weeklyRunTime,
    settings.weeklyRunDay,
  ].join("|");

  if (signature === scheduleSignature) return;
  scheduleSignature = signature;

  dailyTask?.stop();
  weeklyTask?.stop();
  dailyTask = null;
  weeklyTask = null;

  if (!settings.schedulerEnabled) {
    log("定时调度已关闭（仍会处理手动任务）");
    return;
  }

  const daily = parseTime(settings.dailyRunTime);
  const weekly = parseTime(settings.weeklyRunTime);
  const weekday = Math.min(6, Math.max(0, Number(settings.weeklyRunDay) || 0));

  try {
    dailyTask = schedule(
      `${daily.minute} ${daily.hour} * * *`,
      () => enqueueDaily(todayInZone(settings.timezone)),
      { timezone: settings.timezone },
    );
    weeklyTask = schedule(
      `${weekly.minute} ${weekly.hour} * * ${weekday}`,
      () => {
        const { start, end } = weekOf(todayInZone(settings.timezone));
        enqueueWeekly(start, end);
      },
      { timezone: settings.timezone },
    );
    log("定时调度已启用", {
      timezone: settings.timezone,
      daily: settings.dailyRunTime,
      weekly: `周${weekday} ${settings.weeklyRunTime}`,
    });
  } catch (error) {
    log("定时表达式无效", { error: error instanceof Error ? error.message : String(error) });
  }
}

/** Restart-safe catch-up: enqueue today's job if its time has passed and it never ran. */
function catchUp(): void {
  const settings = getSettings();
  if (!settings.schedulerEnabled) return;

  const now = zonedParts(new Date(), settings.timezone);
  const nowMinutes = now.hour * 60 + now.minute;

  const daily = parseTime(settings.dailyRunTime);
  if (nowMinutes >= daily.hour * 60 + daily.minute) {
    if (!jobExistsFor("daily_pipeline", "$.date", now.date)) {
      enqueueDaily(now.date);
    }
  }

  const weekly = parseTime(settings.weeklyRunTime);
  const weekday = Number(settings.weeklyRunDay) || 0;
  if (now.weekday === weekday && nowMinutes >= weekly.hour * 60 + weekly.minute) {
    const week = weekOf(now.date);
    if (!jobExistsFor("weekly_report", "$.weekStart", week.start)) {
      if (!jobExistsFor("daily_pipeline", "$.date", now.date)) {
        enqueueWeekly(week.start, week.end);
      }
    }
  }
}

async function tick(): Promise<void> {
  if (running || stopping) return;
  running = true;
  try {
    if (Date.now() - lastHeartbeat > 10_000) {
      heartbeat(workerId, getSettings().schedulerEnabled);
      lastHeartbeat = Date.now();
    }

    const job = claimNextJob(workerId);
    if (!job) return;

    currentJob = job;
    log("开始执行任务", { jobId: job.id, type: job.type, attempt: job.attempts });
    try {
      appendLog(job.id, "info", "worker", `worker ${workerId} 已领取任务（第 ${job.attempts} 次尝试）`);
      await runJob(job);
      finishJob(job.id, "succeeded");
      appendLog(job.id, "info", "worker", "任务成功完成");
      log("任务完成", { jobId: job.id, type: job.type });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const { retried } = failJob(job.id, message);
      appendLog(job.id, "error", "worker", `任务失败：${message}${retried ? "（已重新排队）" : "（重试次数已用尽）"}`);
      log("任务失败", { jobId: job.id, type: job.type, message, retried });
    } finally {
      currentJob = null;
    }
  } finally {
    running = false;
  }
}

function shutdown(signal: string): void {
  log(`收到 ${signal}，正在停止 worker...`);
  stopping = true;
  dailyTask?.stop();
  weeklyTask?.stop();
  if (currentJob) {
    try {
      const job = getJob(currentJob.id);
      if (job?.status === "running") {
        appendLog(job.id, "warn", "worker", "worker 关闭，任务重新排队");
        failJob(job.id, "worker shutdown during execution");
      }
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(0), 300);
}

async function main(): Promise<void> {
  getDb();
  heartbeat(workerId, getSettings().schedulerEnabled);
  lastHeartbeat = Date.now();

  const requeued = requeueStaleJobs(new Date(Date.now() - 45 * 60_000).toISOString());
  log("BaseEdit Insight worker 已启动", {
    workerId,
    database: env.databasePath,
    version: env.workerVersion,
    requeuedStaleJobs: requeued,
  });

  rebuildSchedule();
  catchUp();
  setInterval(catchUp, 5 * 60_000).unref?.();
  setInterval(rebuildSchedule, 30_000).unref?.();
  setInterval(() => {
    try {
      requeueStaleJobs(new Date(Date.now() - 45 * 60_000).toISOString());
    } catch {
      // ignore
    }
  }, 60_000).unref?.();
  setInterval(() => {
    heartbeat(workerId, getSettings().schedulerEnabled);
    lastHeartbeat = Date.now();
  }, 10_000).unref?.();

  const poll = setInterval(() => {
    void tick();
  }, env.workerPollMs);

  process.on("SIGINT", () => {
    clearInterval(poll);
    shutdown("SIGINT");
  });
  process.on("SIGTERM", () => {
    clearInterval(poll);
    shutdown("SIGTERM");
  });

  await tick();
}

main().catch((error) => {
  console.error("worker failed to start:", error);
  process.exit(1);
});
