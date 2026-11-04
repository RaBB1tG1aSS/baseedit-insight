"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import type { AppSettings } from "@/lib/types";
import { cx } from "./ui";

const TIMEZONES = [
  "Asia/Singapore",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

const WEEKDAYS = [
  { value: "0", label: "周日" },
  { value: "1", label: "周一" },
  { value: "2", label: "周二" },
  { value: "3", label: "周三" },
  { value: "4", label: "周四" },
  { value: "5", label: "周五" },
  { value: "6", label: "周六" },
];

export function SettingsForm({ initial }: { initial: AppSettings }) {
  const router = useRouter();
  const [values, setValues] = useState<AppSettings>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setState("idle");
  };

  const save = async () => {
    setState("saving");
    setMessage(null);
    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...values,
          minAcceptScore: Number(values.minAcceptScore),
          minTopicRelevance: Number(values.minTopicRelevance),
          maxCandidatesPerRun: Number(values.maxCandidatesPerRun),
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        settings?: AppSettings;
      };
      if (!response.ok) throw new Error(payload.error ?? "保存失败");
      if (payload.settings) setValues(payload.settings);
      setState("saved");
      setMessage(payload.message ?? "设置已保存");
      router.refresh();
      setTimeout(() => setState((current) => (current === "saved" ? "idle" : current)), 4000);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
      className="space-y-5 pb-24"
    >
      <SettingsCard title="调度与自动化" description="定时任务由独立 worker 进程持有 cron；修改后 worker 会在 30 秒内重新加载。">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="时区">
            <input
              list="timezones"
              value={values.timezone}
              onChange={(event) => set("timezone", event.target.value)}
              className={inputClass}
            />
            <datalist id="timezones">
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone} />
              ))}
            </datalist>
          </Field>
          <Field label="每日流水线时间">
            <input
              type="time"
              value={values.dailyRunTime}
              onChange={(event) => set("dailyRunTime", event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="周报生成日">
            <select
              value={values.weeklyRunDay}
              onChange={(event) => set("weeklyRunDay", event.target.value)}
              className={inputClass}
            >
              {WEEKDAYS.map((day) => (
                <option key={day.value} value={day.value}>
                  {day.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="周报生成时间">
            <input
              type="time"
              value={values.weeklyRunTime}
              onChange={(event) => set("weeklyRunTime", event.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
        <Toggle
          checked={values.schedulerEnabled}
          onChange={(checked) => set("schedulerEnabled", checked)}
          label="启用后台定时调度"
          hint="关闭后 worker 仍会处理手动任务，但不会自动按时间运行。"
        />
      </SettingsCard>

      <SettingsCard title="AI 分析引擎" description="默认使用本机已登录的 Claude Code CLI；也可切换到 Anthropic Messages API。密钥只从服务端环境变量读取。">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider">
            <select
              value={values.aiProvider}
              onChange={(event) => set("aiProvider", event.target.value as AppSettings["aiProvider"])}
              className={inputClass}
            >
              <option value="claude-cli">claude-cli（本机 Claude Code）</option>
              <option value="anthropic">anthropic（Messages API）</option>
            </select>
          </Field>
          <Field label="模型（可选）">
            <input
              value={values.aiModel}
              onChange={(event) => set("aiModel", event.target.value)}
              placeholder="留空使用默认模型，例如 claude-sonnet-5-5"
              className={inputClass}
            />
          </Field>
        </div>
        <div className="rounded-lg border border-line bg-bg-elevated px-3 py-2.5 text-[11px] leading-6 text-muted">
          <span className="font-medium text-ink-2">切换提示：</span>
          claude-cli 模式不需要 API Key，但要求本机安装并登录 Claude Code；
          anthropic 模式需要在 <code className="rounded bg-surface px-1 font-mono text-[10px]">.env.local</code> 配置{" "}
          <code className="rounded bg-surface px-1 font-mono text-[10px]">ANTHROPIC_API_KEY</code>。
        </div>
      </SettingsCard>

      <SettingsCard title="质量门槛与检索策略" description="门槛只决定能否进入中央数据库与每日推荐；降低门槛不会改变已入库论文的历史状态。">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="最低综合评分">
            <input
              type="number"
              min={0}
              max={100}
              value={values.minAcceptScore}
              onChange={(event) => set("minAcceptScore", Number(event.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="最低领域相关性（0–15）">
            <input
              type="number"
              min={0}
              max={15}
              value={values.minTopicRelevance}
              onChange={(event) => set("minTopicRelevance", Number(event.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="单次最多核验候选">
            <input
              type="number"
              min={1}
              max={200}
              value={values.maxCandidatesPerRun}
              onChange={(event) => set("maxCandidatesPerRun", Number(event.target.value))}
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="主检索式（Europe PMC 语法）">
          <textarea
            rows={4}
            value={values.focusQuery}
            onChange={(event) => set("focusQuery", event.target.value)}
            className={cx(inputClass, "h-auto resize-y py-2.5 font-mono text-[11px] leading-6")}
          />
        </Field>
        <p className="text-[10px] leading-5 text-faint">
          PubMed 使用内置的碱基编辑精确检索式（tiab + CRISPR/脱氨酶），不受该字段影响；Europe PMC 主检索式决定候选发现范围。
        </p>
      </SettingsCard>

      <SettingsCard title="学术数据源" description="用于 NCBI/OpenAlex 的礼貌池标识，不会上传到第三方服务之外。">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="NCBI 联系邮箱">
            <input
              value={values.ncbiEmail}
              onChange={(event) => set("ncbiEmail", event.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>
          <Field label="OpenAlex mailto">
            <input
              value={values.openalexMailto}
              onChange={(event) => set("openalexMailto", event.target.value)}
              placeholder="you@example.com"
              className={inputClass}
            />
          </Field>
        </div>
        <Toggle
          checked={values.enableSemanticScholar}
          onChange={(checked) => set("enableSemanticScholar", checked)}
          label="启用 Semantic Scholar 补充引用数据"
          hint="需要在环境变量中配置 SEMANTIC_SCHOLAR_API_KEY；未配置时即使开启也不会调用。"
        />
      </SettingsCard>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur">
        <button
          type="submit"
          disabled={state === "saving"}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {state === "saving" ? <Loader2 size={13} className="animate-spin" /> : state === "saved" ? <Check size={13} /> : <Save size={13} />}
          {state === "saving" ? "保存中…" : state === "saved" ? "已保存" : "保存设置"}
        </button>
        <span className={cx("text-[11px]", state === "error" ? "text-danger" : "text-muted")}>
          {message ?? "修改只影响后续任务，不会重写历史分析。"}
        </span>
      </div>
    </form>
  );
}

const inputClass =
  "h-9 w-full rounded-lg border border-line bg-bg px-3 text-[12.5px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none";

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5 md:p-6">
      <div className="mb-4">
        <h2 className="display text-lg font-semibold text-ink">{title}</h2>
        <p className="mt-1 text-[11.5px] leading-6 text-muted">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-medium tracking-wide text-faint">{label}</span>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  hint: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line bg-bg-elevated px-3 py-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-3.5 w-3.5 accent-[var(--accent)]"
      />
      <span>
        <span className="block text-[12px] font-medium text-ink-2">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-5 text-faint">{hint}</span>
      </span>
    </label>
  );
}
