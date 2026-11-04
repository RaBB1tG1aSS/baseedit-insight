import type { Metadata } from "next";
import { Kicker } from "@/components/ui";
import { AgentDashboard } from "@/components/agent-dashboard";
import { getJobStats, getRecentLogs, listJobs } from "@/server/db/repo/jobs";
import { getWorkerStatus } from "@/server/db/repo/dashboard";
import { countByStatus } from "@/server/db/repo/papers";
import { getSettings } from "@/server/db/repo/settings";

export const metadata: Metadata = { title: "Agent 运行状态" };
export const dynamic = "force-dynamic";

type Params = Promise<{ job?: string }>;

export default async function AgentPage({ searchParams }: { searchParams: Params }) {
  const { job } = await searchParams;
  const jobs = listJobs(40);
  const worker = getWorkerStatus();
  const stats = getJobStats(new Date(Date.now() - 7 * 86400000).toISOString());
  const counts = countByStatus();
  const logs = getRecentLogs(5);
  const settings = getSettings();

  return (
    <div className="container-page pb-16 pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker className="mb-2">Agent & scheduler telemetry</Kicker>
          <h1 className="display text-3xl font-semibold text-ink md:text-4xl">Agent 运行状态</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted">
            展示后台 worker 的真实执行状态、任务队列、进度与日志。页面不会使用模拟进度；
            worker 离线时任务保持排队，直到进程启动。
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface px-4 py-2 text-[10.5px] text-muted">
          <div className="flex items-center gap-2">
            <span className={worker.online ? "text-success" : "text-warn"}>{worker.online ? "worker 在线" : "worker 离线"}</span>
            <span className="text-line-strong">·</span>
            <span>最近调度日志 {logs.length} 条</span>
          </div>
          <div className="mt-1 text-faint">
            调度时区 {worker.nextDailyRun ? new Date(worker.nextDailyRun).toLocaleString("zh-CN", { timeZone: "Asia/Singapore", hour12: false }) : "—"}
          </div>
        </div>
      </header>

      <AgentDashboard
        initialJobs={jobs}
        initialWorker={worker}
        initialStats={stats}
        initialJobId={job}
        counts={counts}
        timezone={settings.timezone}
      />

      <div className="mt-5 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[11px] leading-6 text-muted">
        <span className="font-medium text-ink-2">调度说明：</span>
        定时任务由独立 worker 进程持有 cron（Asia/Singapore 时区），不依赖浏览器是否打开。worker 启动时会补偿当天错过的时间点，
        但不会重复创建同一天的任务。修改调度时间后，worker 会在 30 秒内重新加载配置。
      </div>
    </div>
  );
}
