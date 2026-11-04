"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  Database,
  FlaskConical,
  Loader2,
  Radar,
  Search,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type {
  JobRun,
  JobStatus,
  JobType,
  PaperSummary,
  WorkerStatus,
} from "@/lib/types";
import { formatDate, formatDateTimeZone } from "@/lib/format";
import { ActionButton } from "./action-button";
import { Badge, EmptyState, cx } from "./ui";

export interface ConsoleSearchRun {
  runId: string;
  source: string;
  query: string;
  executedAt: string;
  resultCount: number;
  durationMs: number;
  error: string | null;
}

export interface ConsoleCandidate {
  paperId: string;
  title: string;
  titleZh: string | null;
  status: string;
  qualityScore: number | null;
  reason: string;
}

export interface P0ConsoleProps {
  latest: PaperSummary[];
  landmark: PaperSummary[];
  backlog: PaperSummary[];
  searchRuns: ConsoleSearchRun[];
  candidates: ConsoleCandidate[];
  counts: Record<string, number>;
  worker: WorkerStatus;
  timezone: string;
  recentJobs: JobRun[];
  todayPaperId: string | null;
}

const TABS = [
  { key: "featured", label: "双轨精选", icon: Sparkles },
  { key: "search", label: "手动检索", icon: Search },
  { key: "backlog", label: "精讲队列", icon: BookOpen },
  { key: "candidates", label: "候选审核", icon: ClipboardCheck },
  { key: "operations", label: "运行控制", icon: Activity },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const JOB_LABEL: Record<JobType, string> = {
  daily_pipeline: "每日流水线",
  weekly_report: "每周报告",
  search_only: "手动检索",
  manual_analysis: "生成精讲",
  reanalyze_paper: "重新分析",
  knowledge_update: "知识图谱更新",
  reverify_paper: "重新核验",
  status_watch: "状态复查",
};

const STATUS_LABEL: Record<JobStatus, string> = {
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

export function P0Console(props: P0ConsoleProps) {
  const [tab, setTab] = useState<TabKey>("featured");

  return (
    <section className="card mt-8 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-4">
        <div>
          <div className="kicker">P0 Workspace</div>
          <h2 className="display mt-1 text-xl font-semibold text-ink">研究控制台</h2>
        </div>
        <div className="flex items-center gap-3 text-[10.5px] text-muted">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1">
            <span className={cx("h-1.5 w-1.5 rounded-full", props.worker.online ? "bg-success" : "bg-warn")} />
            Worker {props.worker.online ? "在线" : "离线"}
          </span>
          <span>
            已核验 <span className="num font-medium text-ink-2">{props.counts.accepted ?? 0}</span> ·
            候选 <span className="num font-medium text-ink-2">{(props.counts.candidate ?? 0) + (props.counts.discovered ?? 0)}</span> ·
            拒绝 <span className="num font-medium text-ink-2">{props.counts.rejected ?? 0}</span>
          </span>
        </div>
      </div>

      <div role="tablist" aria-label="P0 工作台" className="flex overflow-x-auto border-b border-line bg-bg-elevated/60 px-3">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(item.key)}
              className={cx(
                "relative inline-flex shrink-0 items-center gap-1.5 px-3.5 py-3 text-[12px] font-medium transition",
                active ? "text-ink" : "text-muted hover:text-ink",
              )}
            >
              <Icon size={13} className={active ? "text-accent" : "text-faint"} />
              {item.label}
              {active ? <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent" /> : null}
            </button>
          );
        })}
      </div>

      <div className="p-5">
        {tab === "featured" ? <FeaturedTab {...props} /> : null}
        {tab === "search" ? <SearchTab worker={props.worker} runs={props.searchRuns} timezone={props.timezone} /> : null}
        {tab === "backlog" ? <BacklogTab backlog={props.backlog} /> : null}
        {tab === "candidates" ? <CandidatesTab candidates={props.candidates} counts={props.counts} /> : null}
        {tab === "operations" ? (
          <OperationsTab worker={props.worker} jobs={props.recentJobs} timezone={props.timezone} />
        ) : null}
      </div>
    </section>
  );
}

function FeaturedTab({ latest, landmark, todayPaperId }: P0ConsoleProps) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <TrackList
        kicker="Latest research"
        title="前沿精选"
        description="最近发表且通过质量门槛的论文；每日主推荐会优先从此轨道选择。"
        papers={latest}
        todayPaperId={todayPaperId}
        href="/papers?sort=date"
        metric="date"
      />
      <TrackList
        kicker="Landmark & foundational"
        title="经典奠基"
        description="发表 ≥3 年、引用影响较高的已核验研究；仅在没有合格新论文时进入每日主推荐。"
        papers={landmark}
        todayPaperId={todayPaperId}
        href="/papers?sort=citations"
        metric="citations"
      />
    </div>
  );
}

function TrackList({
  kicker,
  title,
  description,
  papers,
  todayPaperId,
  href,
  metric,
}: {
  kicker: string;
  title: string;
  description: string;
  papers: PaperSummary[];
  todayPaperId: string | null;
  href: string;
  metric: "date" | "citations";
}) {
  return (
    <div className="rounded-xl border border-line bg-bg-elevated/40 p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">{kicker}</div>
          <h3 className="display mt-1 text-[17px] font-semibold text-ink">{title}</h3>
        </div>
        <Link href={href} className="inline-flex shrink-0 items-center gap-1 text-[10.5px] text-accent hover:text-accent-strong">
          全部 <ArrowRight size={11} />
        </Link>
      </div>
      <p className="mb-3 text-[10.5px] leading-5 text-faint">{description}</p>
      {papers.length ? (
        <div className="divide-y divide-line/70">
          {papers.map((paper) => (
            <Link
              key={paper.id}
              href={`/papers/${paper.id}`}
              className="group flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
            >
              <div className="mt-0.5 flex h-8 w-9 shrink-0 flex-col items-center justify-center rounded-md border border-line bg-surface">
                <span className="num text-[11px] font-semibold leading-none text-ink">
                  {paper.qualityScore == null ? "—" : Math.round(paper.qualityScore)}
                </span>
                <span className="mt-0.5 text-[7.5px] text-faint">/100</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="line-clamp-2 text-[12px] font-medium leading-5 text-ink group-hover:text-accent-strong">
                  {paper.titleZh || paper.title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[9.5px] text-faint">
                  <span>{paper.journal ?? "未知期刊"}</span>
                  <span>·</span>
                  <span>{formatDate(paper.publicationDate)}</span>
                  {metric === "citations" ? (
                    <>
                      <span>·</span>
                      <span className="num">引用 {paper.citationCount}</span>
                    </>
                  ) : null}
                  {paper.id === todayPaperId ? (
                    <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[9px] text-accent-ink">今日推荐</span>
                  ) : null}
                </div>
              </div>
              <ArrowUpRight size={12} className="mt-1 shrink-0 text-faint group-hover:text-accent" />
            </Link>
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] text-faint">该轨道暂无合格论文。</p>
      )}
    </div>
  );
}

function SearchTab({ worker, runs, timezone }: { worker: WorkerStatus; runs: ConsoleSearchRun[]; timezone: string }) {
  const [query, setQuery] = useState("");
  const [sinceDays, setSinceDays] = useState(30);
  const [limit, setLimit] = useState(20);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setState("loading");
    setMessage(null);
    setJobId(null);
    try {
      const payload: Record<string, unknown> = { sinceDays, limit };
      if (query.trim()) payload.query = query.trim();
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "search_only", payload }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        job?: { id?: string };
      };
      if (!response.ok) throw new Error(body.error ?? "检索任务创建失败");
      setJobId(body.job?.id ?? null);
      setState("success");
      setMessage(body.message ?? "检索任务已排队");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <div className="flex items-center gap-2">
          <Radar size={14} className="text-accent" />
          <h3 className="text-[13px] font-semibold text-ink">手动触发学术检索</h3>
        </div>
        <p className="mt-1 text-[10.5px] leading-5 text-muted">
          只创建候选论文，必须经过去重、身份核验与质量门槛后才进入中央数据库；不会直接出现在推荐或周报中。
        </p>
        <form onSubmit={submit} className="mt-3 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-medium tracking-wide text-faint">Europe PMC 检索式（留空使用设置中的主检索式）</span>
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              rows={3}
              placeholder='例如：TITLE_ABS:"base editing" AND FIRST_PDATE:[2026-01-01 TO 2026-12-31]'
              className="w-full resize-y rounded-lg border border-line bg-bg px-3 py-2 font-mono text-[11px] leading-5 text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium tracking-wide text-faint">回溯天数</span>
              <select
                value={sinceDays}
                onChange={(event) => setSinceDays(Number(event.target.value))}
                className="h-9 w-full rounded-lg border border-line bg-bg px-2 text-[12px] text-ink focus:outline-none"
              >
                {[7, 30, 90, 180, 365].map((value) => (
                  <option key={value} value={value}>
                    最近 {value} 天
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-medium tracking-wide text-faint">每源上限</span>
              <select
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="h-9 w-full rounded-lg border border-line bg-bg px-2 text-[12px] text-ink focus:outline-none"
              >
                {[10, 20, 30, 50].map((value) => (
                  <option key={value} value={value}>
                    {value} 篇
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="submit"
            disabled={state === "loading"}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12px] font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
          >
            {state === "loading" ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
            {state === "loading" ? "提交中…" : "提交检索任务"}
          </button>
          {message ? (
            <div className={cx("text-[11px] leading-5", state === "error" ? "text-danger" : "text-muted")}>
              {message}
              {jobId ? (
                <Link href={`/agent?job=${jobId}`} className="ml-2 font-medium text-accent hover:text-accent-strong">
                  查看运行 →
                </Link>
              ) : null}
            </div>
          ) : null}
          {!worker.online ? (
            <p className="flex items-start gap-1.5 text-[10px] leading-5 text-warn">
              <TriangleAlert size={11} className="mt-0.5 shrink-0" />
              Worker 当前离线，任务会保持排队直到 `npm run worker` 启动。
            </p>
          ) : null}
        </form>
      </div>

      <div className="rounded-xl border border-line bg-bg-elevated/40 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[12.5px] font-semibold text-ink">最近检索记录</h3>
          <span className="text-[9.5px] text-faint">真实 search_runs</span>
        </div>
        {runs.length ? (
          <div className="mt-2 divide-y divide-line/70">
            {runs.slice(0, 6).map((run) => (
              <div key={run.runId} className="py-2 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="font-medium uppercase tracking-wide text-ink-2">{run.source}</span>
                  <span className="text-faint">{formatDateTimeZone(run.executedAt, timezone)}</span>
                </div>
                <p className="mt-0.5 line-clamp-1 text-[10.5px] text-muted" title={run.query}>
                  {run.query}
                </p>
                <div className="mt-0.5 flex items-center gap-2 text-[9.5px] text-faint">
                  <span>结果 {run.resultCount}</span>
                  <span>·</span>
                  <span>{run.durationMs} ms</span>
                  {run.error ? (
                    <>
                      <span>·</span>
                      <span className="text-danger">失败</span>
                    </>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-faint">尚无检索记录。</p>
        )}
        <p className="mt-3 border-t border-line pt-2 text-[9.5px] leading-4 text-faint">
          Europe PMC 主检索、PubMed 内置精确检索与经典论文 CITED 排序会分别记录来源和结果数。
        </p>
      </div>
    </div>
  );
}

function BacklogTab({ backlog }: { backlog: PaperSummary[] }) {
  if (!backlog.length) {
    return (
      <EmptyState
        icon={<CheckCircle2 size={20} />}
        title="精讲队列已清空"
        description="所有已核验论文都已生成深度精讲。新的论文入库后会自动进入队列。"
      />
    );
  }
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-[13px] font-semibold text-ink">待生成精讲的已核验论文</h3>
          <p className="mt-0.5 text-[10.5px] leading-5 text-muted">
            AI 每轮按预算补齐；点击「生成精讲」会进入后台任务队列，不会阻塞当前页面。
          </p>
        </div>
        <Badge variant="warn">{backlog.length} 篇待处理</Badge>
      </div>
      <div className="mt-3 divide-y divide-line/70 rounded-xl border border-line bg-bg-elevated/40 px-4">
        {backlog.map((paper) => (
          <div key={paper.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
            <div className="min-w-0 flex-1">
              <Link href={`/papers/${paper.id}`} className="line-clamp-1 text-[12px] font-medium text-ink hover:text-accent">
                {paper.titleZh || paper.title}
              </Link>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[9.5px] text-faint">
                <span>{paper.journal ?? "未知期刊"}</span>
                <span>·</span>
                <span>{formatDate(paper.publicationDate)}</span>
                <span>·</span>
                <span className="num">评分 {paper.qualityScore ?? "—"}</span>
                <span>·</span>
                <span>{paper.fullTextAccessStatus === "oa_fulltext" ? "全文可用" : "摘要级"}</span>
              </div>
            </div>
            <ActionButton
              endpoint={`/api/papers/${paper.id}/analysis`}
              body={{ force: false }}
              label="生成精讲"
              pendingLabel="排队中…"
              variant="secondary"
              size="sm"
              icon={<Sparkles size={11} />}
              redirectTo="/agent?job={jobId}"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function CandidatesTab({ candidates, counts }: { candidates: ConsoleCandidate[]; counts: Record<string, number> }) {
  return (
    <div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="已入库" value={counts.accepted ?? 0} tone="success" />
        <MiniStat label="待复核" value={counts.needs_review ?? 0} tone="warn" />
        <MiniStat label="已拒绝" value={counts.rejected ?? 0} tone="danger" />
        <MiniStat label="候选/发现" value={(counts.candidate ?? 0) + (counts.discovered ?? 0)} tone="muted" />
      </div>
      <div className="mt-4 flex items-center justify-between">
        <h3 className="text-[12.5px] font-semibold text-ink">最近未通过 / 待复核记录</h3>
        <Link href="/candidates" className="inline-flex items-center gap-1 text-[10.5px] text-accent hover:text-accent-strong">
          打开审核队列 <ArrowRight size={11} />
        </Link>
      </div>
      {candidates.length ? (
        <div className="mt-2 divide-y divide-line/70 rounded-xl border border-line bg-bg-elevated/40 px-4">
          {candidates.map((candidate) => (
            <div key={candidate.paperId} className="py-2.5">
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-1 text-[11.5px] font-medium text-ink">{candidate.titleZh || candidate.title}</span>
                <Badge variant={candidate.status === "needs_review" ? "warn" : "danger"}>
                  {candidate.status === "needs_review" ? "待复核" : "已拒绝"}
                </Badge>
              </div>
              <p className="mt-0.5 line-clamp-1 text-[10px] leading-5 text-muted" title={candidate.reason}>
                {candidate.reason || "未记录具体原因"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 rounded-xl border border-line bg-bg-elevated/40 px-4 py-3 text-[11px] text-faint">
          当前没有待复核或已拒绝的记录。
        </p>
      )}
      <p className="mt-3 text-[9.5px] leading-4 text-faint">
        候选与正式文献严格隔离：未通过记录只用于审计，不进入推荐、知识图谱、时间线或周报结论。
      </p>
    </div>
  );
}

function OperationsTab({ worker, jobs, timezone }: { worker: WorkerStatus; jobs: JobRun[]; timezone: string }) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <div>
        <h3 className="text-[13px] font-semibold text-ink">手动执行</h3>
        <p className="mt-0.5 text-[10.5px] leading-5 text-muted">
          所有任务进入同一队列，由独立 worker 执行；按钮会跳到 Agent 页面查看真实进度与日志。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <ActionButton endpoint="/api/jobs" body={{ type: "daily_pipeline", payload: {} }} label="每日流水线" size="sm" variant="primary" icon={<Sparkles size={11} />} redirectTo="/agent?job={jobId}" />
          <ActionButton endpoint="/api/jobs" body={{ type: "search_only", payload: {} }} label="仅检索" size="sm" icon={<Search size={11} />} redirectTo="/agent?job={jobId}" />
          <ActionButton endpoint="/api/jobs" body={{ type: "weekly_report", payload: { force: true } }} label="生成周报" size="sm" redirectTo="/agent?job={jobId}" />
          <ActionButton endpoint="/api/jobs" body={{ type: "knowledge_update", payload: {} }} label="更新图谱" size="sm" redirectTo="/agent?job={jobId}" />
          <ActionButton endpoint="/api/jobs" body={{ type: "status_watch", payload: {} }} label="复查撤稿" size="sm" redirectTo="/agent?job={jobId}" />
        </div>
        <dl className="mt-4 space-y-2 rounded-xl border border-line bg-bg-elevated/40 px-3 py-3 text-[10.5px]">
          <Row label="Worker" value={worker.online ? "在线" : "离线"} tone={worker.online ? "text-success" : "text-warn"} />
          <Row label="定时调度" value={worker.schedulerEnabled ? "已启用" : "已关闭"} tone={worker.schedulerEnabled ? "text-success" : "text-warn"} />
          <Row label="下次每日任务" value={worker.nextDailyRun ? formatDateTimeZone(worker.nextDailyRun, timezone) : "—"} />
          <Row label="下次周报" value={worker.nextWeeklyRun ? formatDateTimeZone(worker.nextWeeklyRun, timezone) : "—"} />
        </dl>
        <Link href="/agent" className="mt-3 inline-flex items-center gap-1 text-[10.5px] font-medium text-accent hover:text-accent-strong">
          打开 Agent 运行状态 <ArrowRight size={11} />
        </Link>
      </div>

      <div className="rounded-xl border border-line bg-bg-elevated/40 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[12.5px] font-semibold text-ink">最近任务</h3>
          <span className="text-[9.5px] text-faint">{jobs.length} 条</span>
        </div>
        {jobs.length ? (
          <div className="mt-2 divide-y divide-line/70">
            {jobs.map((job) => (
              <Link key={job.id} href={`/agent?job=${job.id}`} className="flex items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-[11px] font-medium text-ink">{JOB_LABEL[job.type]}</div>
                  <div className="mt-0.5 text-[9.5px] text-faint">
                    {formatDateTimeZone(job.createdAt, timezone)} · {job.requestedBy === "scheduler" ? "定时" : "手动"}
                  </div>
                </div>
                <Badge variant={statusTone(job.status)}>{STATUS_LABEL[job.status]}</Badge>
              </Link>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-[11px] text-faint">暂无任务记录。</p>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: number; tone: "success" | "warn" | "danger" | "muted" }) {
  const color = { success: "text-success", warn: "text-warn", danger: "text-danger", muted: "text-ink" }[tone];
  return (
    <div className="rounded-lg border border-line bg-bg-elevated/50 px-3 py-2">
      <div className="text-[9.5px] text-faint">{label}</div>
      <div className={cx("num mt-0.5 text-lg font-semibold", color)}>{value}</div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-faint">{label}</dt>
      <dd className={cx("text-right text-ink-2", tone)}>{value}</dd>
    </div>
  );
}
