"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Clock,
  Database,
  Loader2,
  Radio,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { JobLog, JobProgress, JobRun, JobStatus, JobType, WorkerStatus } from "@/lib/types";
import { ActionButton } from "./action-button";
import { Badge, EmptyState, ProgressBar, cx } from "./ui";
import { formatDateTimeZone, formatTimeZone, relativeTime } from "@/lib/format";

export const JOB_TYPE_LABEL: Record<JobType, string> = {
  daily_pipeline: "每日流水线",
  weekly_report: "每周报告",
  search_only: "手动检索",
  manual_analysis: "生成精讲",
  reanalyze_paper: "重新分析",
  knowledge_update: "知识图谱更新",
  reverify_paper: "重新核验",
  status_watch: "状态复查",
};

export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  queued: "排队中",
  running: "运行中",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

function statusTone(status: JobStatus): "accent" | "success" | "danger" | "warn" | "outline" {
  if (status === "running") return "accent";
  if (status === "succeeded") return "success";
  if (status === "failed") return "danger";
  if (status === "cancelled") return "outline";
  return "warn";
}

function StatusIcon({ status }: { status: JobStatus }) {
  if (status === "running") return <Loader2 size={12} className="animate-spin" />;
  if (status === "succeeded") return <CheckCircle2 size={12} />;
  if (status === "failed") return <XCircle size={12} />;
  if (status === "cancelled") return <XCircle size={12} />;
  return <Clock size={12} />;
}

interface JobsResponse {
  jobs: JobRun[];
  worker: WorkerStatus;
  stats: { total: number; succeeded: number; failed: number; queued: number };
}

export function AgentDashboard({
  initialJobs,
  initialWorker,
  initialStats,
  initialJobId,
  counts,
  timezone,
}: {
  initialJobs: JobRun[];
  initialWorker: WorkerStatus;
  initialStats: { total: number; succeeded: number; failed: number; queued: number };
  initialJobId?: string;
  counts: Record<string, number>;
  timezone: string;
}) {
  const [jobs, setJobs] = useState(initialJobs);
  const [mounted, setMounted] = useState(false);
  const [worker, setWorker] = useState(initialWorker);
  const [stats, setStats] = useState(initialStats);
  const [selectedId, setSelectedId] = useState<string | null>(initialJobId ?? initialJobs[0]?.id ?? null);
  const [detail, setDetail] = useState<{ job: JobRun; logs: JobLog[] } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/jobs?limit=40", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as JobsResponse;
      setJobs(data.jobs);
      setWorker(data.worker);
      setStats(data.stats);
      setUpdatedAt(new Date().toISOString());
      setSelectedId((current) => current ?? data.jobs[0]?.id ?? null);
    } catch {
      // keep last known state
    }
  }, []);

  const loadDetail = useCallback(async (jobId: string) => {
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
      if (!response.ok) {
        setDetail(null);
        return;
      }
      setDetail((await response.json()) as { job: JobRun; logs: JobLog[] });
    } catch {
      // keep last detail
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    void refresh();
    const timer = setInterval(() => void refresh(), 3500);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) return;
    void loadDetail(selectedId);
    const timer = setInterval(() => void loadDetail(selectedId), 2600);
    return () => clearInterval(timer);
  }, [selectedId, loadDetail]);

  useEffect(() => {
    if (!autoScroll || !logRef.current) return;
    logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [detail?.logs, autoScroll]);

  const selected = detail?.job ?? jobs.find((job) => job.id === selectedId) ?? null;
  const progress = (selected?.progress ?? null) as JobProgress | null;

  const failureRate = stats.total ? Math.round((stats.failed / stats.total) * 100) : 0;
  const totals = useMemo(
    () => ({
      accepted: counts.accepted ?? 0,
      candidates: (counts.discovered ?? 0) + (counts.candidate ?? 0) + (counts.metadata_verified ?? 0) + (counts.quality_assessed ?? 0),
      review: counts.needs_review ?? 0,
      rejected: counts.rejected ?? 0,
    }),
    [counts],
  );

  return (
    <div className="space-y-5">
      {!worker.online ? (
        <div className="flex items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[12.5px] text-warn">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Worker 离线：任务会进入队列但不会执行</div>
            <p className="mt-1 text-[11.5px] leading-6 opacity-90">
              在项目目录运行 <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[10.5px]">npm run worker</code> 启动后台调度进程。
              本页面展示的是数据库中的真实任务状态，不使用模拟进度。
            </p>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <StatusTile
          label="Worker"
          value={worker.online ? "在线" : "离线"}
          hint={worker.lastSeen ? `心跳 ${formatDateTimeZone(worker.lastSeen, timezone)}` : "尚无心跳"}
          tone={worker.online ? "success" : "warn"}
          icon={<Radio size={13} />}
        />
        <StatusTile
          label="队列 / 运行中"
          value={stats.queued}
          hint={`近 7 天任务 ${stats.total}`}
          tone={stats.queued ? "accent" : "muted"}
          icon={<Activity size={13} />}
        />
        <StatusTile
          label="近 7 天成功 / 失败"
          value={`${stats.succeeded} / ${stats.failed}`}
          hint={`失败率 ${failureRate}%`}
          tone={stats.failed ? "warn" : "success"}
          icon={<CheckCircle2 size={13} />}
        />
        <StatusTile
          label="中央文献库"
          value={totals.accepted}
          hint={`候选 ${totals.candidates} · 待复核 ${totals.review}`}
          tone="muted"
          icon={<Database size={13} />}
        />
      </div>

      <div className="card flex flex-wrap items-center gap-2 p-4">
        <ActionButton endpoint="/api/jobs" body={{ type: "daily_pipeline", payload: {} }} label="运行每日流水线" variant="primary" size="sm" icon={<RefreshCw size={12} />} redirectTo="/agent?job={jobId}" />
        <ActionButton endpoint="/api/jobs" body={{ type: "search_only", payload: {} }} label="仅检索新论文" variant="secondary" size="sm" icon={<Activity size={12} />} redirectTo="/agent?job={jobId}" />
        <ActionButton endpoint="/api/jobs" body={{ type: "weekly_report", payload: { force: true } }} label="生成周报" variant="secondary" size="sm" redirectTo="/agent?job={jobId}" />
        <ActionButton endpoint="/api/jobs" body={{ type: "knowledge_update", payload: {} }} label="更新知识图谱" variant="secondary" size="sm" redirectTo="/agent?job={jobId}" />
        <ActionButton endpoint="/api/jobs" body={{ type: "status_watch", payload: {} }} label="复查撤稿状态" variant="secondary" size="sm" redirectTo="/agent?job={jobId}" />
        <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] text-faint">
          <span className={cx("h-1.5 w-1.5 rounded-full", worker.online ? "bg-success" : "bg-warn")} />
          自动刷新 · {updatedAt ? new Date(updatedAt).toLocaleTimeString("zh-CN", { hour12: false }) : "同步中…"}
          <button type="button" onClick={() => void refresh()} className="ml-1 rounded p-0.5 hover:text-ink" aria-label="立即刷新">
            <RefreshCw size={11} />
          </button>
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-[12px] font-semibold text-ink">任务队列</span>
            <span className="text-[10px] text-faint">{jobs.length} 条</span>
          </div>
          {jobs.length ? (
            <div className="max-h-[620px] divide-y divide-line/70 overflow-y-auto">
              {jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  onClick={() => setSelectedId(job.id)}
                  className={cx(
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition",
                    selectedId === job.id ? "bg-accent-soft/60" : "hover:bg-surface-2",
                  )}
                >
                  <span
                    className={cx(
                      "mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
                      job.status === "running"
                        ? "bg-accent text-white"
                        : job.status === "succeeded"
                          ? "bg-success-soft text-success"
                          : job.status === "failed"
                            ? "bg-danger-soft text-danger"
                            : "bg-surface-2 text-muted",
                    )}
                  >
                    <StatusIcon status={job.status} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink">{JOB_TYPE_LABEL[job.type]}</span>
                      <Badge variant={statusTone(job.status)}>{JOB_STATUS_LABEL[job.status]}</Badge>
                    </span>
                    <span className="mt-1 flex items-center gap-2 text-[10px] text-faint" suppressHydrationWarning>
                      <span>{mounted ? relativeTime(job.createdAt) : formatDateTimeZone(job.createdAt, timezone)}</span>
                      {job.requestedBy === "scheduler" ? <span>· 定时调度</span> : <span>· 手动触发</span>}
                      {job.attempts > 1 ? <span>· 第 {job.attempts} 次尝试</span> : null}
                    </span>
                    {job.error ? (
                      <span className="mt-1 line-clamp-1 text-[10px] text-danger">{job.error}</span>
                    ) : job.progress?.stageLabel ? (
                      <span className="mt-1 line-clamp-1 text-[10px] text-muted">{job.progress.stageLabel}</span>
                    ) : null}
                  </span>
                  <ChevronRight size={13} className="mt-1 shrink-0 text-faint" />
                </button>
              ))}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                title="还没有任务记录"
                description="运行一次检索或生成周报，任务过程与日志会实时显示在这里。"
              />
            </div>
          )}
        </div>

        <div className="card min-h-[520px] overflow-hidden">
          {selected ? (
            <div className="flex h-full flex-col">
              <div className="border-b border-line px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-[14px] font-semibold text-ink">{JOB_TYPE_LABEL[selected.type]}</h2>
                      <Badge variant={statusTone(selected.status)}>{JOB_STATUS_LABEL[selected.status]}</Badge>
                      {selected.requestedBy === "scheduler" ? <Badge variant="outline">定时</Badge> : null}
                    </div>
                    <div className="mt-1 font-mono text-[9.5px] text-faint">{selected.id}</div>
                  </div>
                  {selected.status === "queued" || selected.status === "running" ? (
                    <ActionButton
                      endpoint={`/api/jobs/${selected.id}`}
                      method="DELETE"
                      label="取消任务"
                      variant="danger"
                      size="sm"
                      confirmText="确定取消该任务？"
                    />
                  ) : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-[10.5px] text-muted sm:grid-cols-4">
                  <Info label="创建" value={formatDateTimeZone(selected.createdAt, timezone)} />
                  <Info label="开始" value={selected.startedAt ? formatDateTimeZone(selected.startedAt, timezone) : "—"} />
                  <Info label="结束" value={selected.finishedAt ? formatDateTimeZone(selected.finishedAt, timezone) : "—"} />
                  <Info label="尝试" value={`${selected.attempts}/${selected.maxAttempts}`} />
                </div>

                {progress ? (
                  <div className="mt-3 rounded-lg border border-line bg-bg-elevated px-3 py-2.5">
                    <div className="flex items-center justify-between text-[10.5px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-ink-2">
                        <CircleDot size={10} className={selected.status === "running" ? "animate-pulse text-accent" : "text-faint"} />
                        {progress.stageLabel ?? progress.stage ?? "处理中"}
                      </span>
                      {progress.total ? (
                        <span className="num text-faint">
                          {progress.current ?? 0}/{progress.total}
                        </span>
                      ) : null}
                    </div>
                    {progress.total ? (
                      <ProgressBar value={progress.current ?? 0} max={progress.total} className="mt-2" />
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-muted">
                      {progress.candidates != null ? <span>候选 {progress.candidates}</span> : null}
                      {progress.verified != null ? <span>通过核验 {progress.verified}</span> : null}
                      {progress.accepted != null ? <span className="text-success">入库 {progress.accepted}</span> : null}
                      {progress.failed ? <span className="text-danger">失败 {progress.failed}</span> : null}
                    </div>
                  </div>
                ) : null}

                {selected.error ? (
                  <div className="mt-3 rounded-lg border border-danger/25 bg-danger-soft px-3 py-2 text-[11px] leading-5 text-danger">
                    {selected.error}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between border-b border-line px-5 py-2">
                <span className="text-[10.5px] font-medium text-muted">执行日志</span>
                <label className="flex items-center gap-1.5 text-[9.5px] text-faint">
                  <input type="checkbox" checked={autoScroll} onChange={(event) => setAutoScroll(event.target.checked)} className="h-3 w-3 accent-[var(--accent)]" />
                  自动滚动
                </label>
              </div>

              <div ref={logRef} className="flex-1 overflow-y-auto bg-bg-elevated/40 px-4 py-3 font-mono text-[10.5px] leading-5">
                {detail?.logs?.length ? (
                  <div className="space-y-1.5">
                    {detail.logs.map((log) => (
                      <div key={log.id} className="flex gap-2">
                        <span className="shrink-0 text-faint">{formatTimeZone(log.ts, timezone)}</span>
                        <span
                          className={cx(
                            "shrink-0 uppercase",
                            log.level === "error" ? "text-danger" : log.level === "warn" ? "text-warn" : "text-accent",
                          )}
                        >
                          {log.stage}
                        </span>
                        <span className="min-w-0 break-words text-ink-2">{log.message}</span>
                      </div>
                    ))}
                    {loadingDetail ? <div className="text-faint">更新中…</div> : null}
                  </div>
                ) : (
                  <p className="text-faint">暂无日志。任务开始时，worker 会写入真实执行记录。</p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-8">
              <EmptyState title="选择一个任务" description="左侧列表展示真实任务状态；点击任务查看进度与执行日志。" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusTile({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string | number;
  hint: string;
  tone: "success" | "warn" | "accent" | "muted";
  icon: React.ReactNode;
}) {
  const toneClass = {
    success: "text-success",
    warn: "text-warn",
    accent: "text-accent",
    muted: "text-ink",
  }[tone];
  return (
    <div className="card-flat px-4 py-3">
      <div className="flex items-center justify-between text-[10px] text-muted">
        <span>{label}</span>
        <span className="text-faint">{icon}</span>
      </div>
      <div className={cx("num mt-1 text-xl font-semibold", toneClass)}>{value}</div>
      <div className="mt-0.5 text-[9.5px] text-faint">{hint}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[9px] uppercase tracking-wider text-faint">{label}</div>
      <div className="num text-ink-2">{value}</div>
    </div>
  );
}
