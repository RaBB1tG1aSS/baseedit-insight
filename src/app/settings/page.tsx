import type { Metadata } from "next";
import Link from "next/link";
import { Database, HardDriveDownload, ServerCog, Sparkles } from "lucide-react";
import { getSettings } from "@/server/db/repo/settings";
import { getWorkerStatus } from "@/server/db/repo/dashboard";
import { aiStatus } from "@/server/ai/client";
import { countByStatus } from "@/server/db/repo/papers";
import { resolveDatabasePath } from "@/server/env";
import { formatDateTimeZone, relativeTime } from "@/lib/format";
import { SettingsForm } from "@/components/settings-form";
import { ActionButton } from "@/components/action-button";
import { Badge, Kicker, cx } from "@/components/ui";

export const metadata: Metadata = { title: "设置" };
export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const settings = getSettings();
  const worker = getWorkerStatus();
  const ai = aiStatus();
  const counts = countByStatus();
  const dbPath = resolveDatabasePath();
  const envFlags = {
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    ncbi: Boolean(process.env.NCBI_API_KEY),
    semantic: Boolean(process.env.SEMANTIC_SCHOLAR_API_KEY),
  };

  return (
    <div className="container-page pb-20 pt-10">
      <header className="mb-7">
        <Kicker className="mb-2">Configuration</Kicker>
        <h1 className="display text-3xl font-semibold text-ink md:text-4xl">设置与数据维护</h1>
        <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted">
          所有设置写入本地数据库，worker 每 30 秒检查一次调度配置。API Key 只存放在服务端环境变量中，不写入数据库、不进入前端。
        </p>
      </header>

      <div className="mb-6 grid gap-3 md:grid-cols-4">
        <StatusCard
          label="Worker"
          value={worker.online ? "在线" : "离线"}
          hint={worker.lastSeen ? `心跳 ${relativeTime(worker.lastSeen)}` : "尚未启动"}
          tone={worker.online ? "success" : "warn"}
          icon={<ServerCog size={13} />}
        />
        <StatusCard
          label="AI 引擎"
          value={ai.available ? "可用" : "不可用"}
          hint={ai.available ? `${ai.provider} · ${ai.model}` : ai.reason ?? "未配置"}
          tone={ai.available ? "success" : "warn"}
          icon={<Sparkles size={13} />}
        />
        <StatusCard
          label="中央文献库"
          value={counts.accepted ?? 0}
          hint={`候选 ${(counts.candidate ?? 0) + (counts.discovered ?? 0)} · 待复核 ${counts.needs_review ?? 0}`}
          tone="muted"
          icon={<Database size={13} />}
        />
        <StatusCard
          label="下次每日任务"
          value={worker.nextDailyRun ? formatDateTimeZone(worker.nextDailyRun, settings.timezone) : "调度关闭"}
          hint={`${settings.timezone} · ${settings.dailyRunTime}`}
          tone={worker.schedulerEnabled ? "accent" : "warn"}
          icon={<HardDriveDownload size={13} />}
        />
      </div>

      {!ai.available ? (
        <div className="mb-5 rounded-xl border border-warn/30 bg-warn-soft px-4 py-3 text-[12px] leading-6 text-warn">
          <span className="font-medium">AI 当前不可用：</span>
          {ai.reason}
          <span className="block text-[11px] opacity-90">
            文献检索、核验、入库与数据模板周报仍然可用；AI 精讲、逐图分析与 AI 知识抽取会跳过，并在任务日志中明确记录。
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <SettingsForm initial={settings} />

        <aside className="space-y-4">
          <div className="card p-5">
            <div className="kicker mb-2">运行环境</div>
            <dl className="space-y-2.5 text-[11px]">
              <Row label="SQLite 路径" value={dbPath} mono />
              <Row label="调度时区" value={settings.timezone} />
              <Row label="每日任务" value={settings.dailyRunTime} />
              <Row label="每周任务" value={`周${settings.weeklyRunDay} ${settings.weeklyRunTime}`} />
              <Row label="Scheduler" value={settings.schedulerEnabled ? "启用" : "关闭"} />
              <Row label="Worker 版本" value={worker.version ?? "—"} />
              <Row label="下次周报" value={worker.nextWeeklyRun ? formatDateTimeZone(worker.nextWeeklyRun, settings.timezone) : "调度关闭"} />
            </dl>
          </div>

          <div className="card p-5">
            <div className="kicker mb-2">密钥状态（只读）</div>
            <div className="space-y-2">
              <KeyRow label="ANTHROPIC_API_KEY" set={envFlags.anthropic} />
              <KeyRow label="NCBI_API_KEY" set={envFlags.ncbi} />
              <KeyRow label="SEMANTIC_SCHOLAR_API_KEY" set={envFlags.semantic} />
            </div>
            <p className="mt-3 text-[10px] leading-5 text-faint">
              在项目根目录的 <code className="rounded bg-surface-2 px-1 font-mono">.env.local</code> 中配置；修改后需要重启 Next.js 与 worker。
              不配置 NCBI Key 也能运行（速率较低）。
            </p>
          </div>

          <div className="card p-5">
            <div className="kicker mb-2">数据维护</div>
            <p className="mb-3 text-[11px] leading-6 text-muted">
              备份使用 SQLite 在线备份 API，生成一致性快照，不中断 worker 写入。
            </p>
            <ActionButton
              endpoint="/api/maintenance/backup"
              label="立即备份数据库"
              pendingLabel="备份中…"
              successMessage="备份完成"
              variant="secondary"
              size="sm"
              icon={<HardDriveDownload size={12} />}
            />
            <div className="mt-3 rounded-lg border border-line bg-bg-elevated px-3 py-2 text-[10px] leading-5 text-faint">
              命令行备份：<code className="font-mono">npm run db:backup</code>
              <br />
              恢复：停止 web 与 worker，将备份文件复制为 <code className="font-mono">data/baseedit.db</code>（同时删除 <code className="font-mono">-wal/-shm</code>），再启动。
            </div>
          </div>

          <div className="card p-5">
            <div className="kicker mb-2">相关页面</div>
            <div className="space-y-1.5 text-[11.5px]">
              <Link href="/agent" className="block text-accent hover:text-accent-strong">
                Agent 运行状态与日志
              </Link>
              <Link href="/candidates" className="block text-accent hover:text-accent-strong">
                候选文献审核队列
              </Link>
              <Link href="/api/health" className="block text-accent hover:text-accent-strong">
                JSON 健康检查
              </Link>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[10px] leading-5 text-faint">
            <div className="mb-1 font-medium text-muted">部署边界</div>
            本应用按单用户、本地优先设计，默认不提供账号体系。若部署到公网，请在反向代理层增加认证，并限制 <code className="font-mono">/api/*</code> 的访问。
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusCard({
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
      <div className={cx("mt-1 truncate text-[15px] font-semibold", toneClass)} title={String(value)}>
        {value}
      </div>
      <div className="mt-0.5 line-clamp-2 text-[9.5px] leading-4 text-faint">{hint}</div>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
      <dt className="shrink-0 text-faint">{label}</dt>
      <dd className={cx("truncate text-right text-ink-2", mono && "font-mono text-[9.5px]")} title={value}>
        {value}
      </dd>
    </div>
  );
}

function KeyRow({ label, set }: { label: string; set: boolean }) {
  return (
    <div className="flex items-center justify-between gap-2 text-[10px]">
      <span className="truncate font-mono text-faint">{label}</span>
      <Badge variant={set ? "success" : "outline"}>{set ? "已配置" : "未配置"}</Badge>
    </div>
  );
}
