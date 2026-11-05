"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import type { AppSettings, JournalMetricCoverage } from "@/lib/types";
import { ActionButton } from "./action-button";
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

export function SettingsForm({
  initial,
  metricCoverage,
}: {
  initial: AppSettings;
  metricCoverage: JournalMetricCoverage;
}) {
  const router = useRouter();
  const [values, setValues] = useState<AppSettings>(initial);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [csv, setCsv] = useState("");
  const [importSource, setImportSource] = useState<"jcr" | "custom">("jcr");
  const [importYear, setImportYear] = useState(new Date().getFullYear());
  const [importState, setImportState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [importMessage, setImportMessage] = useState<string | null>(null);

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    setState("idle");
  };

  const importCsv = async () => {
    if (!csv.trim()) {
      setImportState("error");
      setImportMessage("请先粘贴或选择 CSV 文件");
      return;
    }
    setImportState("loading");
    setImportMessage(null);
    try {
      const response = await fetch("/api/journal-metrics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csv, source: importSource, year: importYear }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        imported?: number;
        updatedPapers?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "导入失败");
      setImportState("success");
      setImportMessage(payload.message ?? `已导入 ${payload.imported ?? 0} 条期刊指标`);
      setCsv("");
      router.refresh();
    } catch (error) {
      setImportState("error");
      setImportMessage(error instanceof Error ? error.message : String(error));
    }
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
      className="space-y-5"
    >
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={state === "saving"}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12px] font-medium text-white transition hover:bg-accent-strong disabled:opacity-60"
        >
          {state === "saving" ? <Loader2 size={13} className="animate-spin" /> : state === "saved" ? <Check size={13} /> : <Save size={13} />}
          {state === "saving" ? "保存中…" : state === "saved" ? "已保存" : "保存设置"}
        </button>
      </div>

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

      <SettingsCard
        title="期刊影响力筛选"
        description="按期刊影响力限制进入推荐/入库的论文。JCR 影响因子是授权数据，系统不内置、不抓取，需你自行导入；OpenAlex 2yr citedness 是公开的引用指标，不是 Clarivate IF。"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="指标来源">
            <select
              value={values.journalMetricMode}
              onChange={(event) => set("journalMetricMode", event.target.value as AppSettings["journalMetricMode"])}
              className={inputClass}
            >
              <option value="off">关闭期刊指标筛选</option>
              <option value="jcr">JCR 影响因子（导入）</option>
              <option value="openalex">OpenAlex 2yr citedness</option>
              <option value="auto">优先 JCR，缺失用 OpenAlex</option>
            </select>
          </Field>
          <Field label="最低指标（0 = 不筛）">
            <input
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={values.minJournalMetric}
              onChange={(event) => set("minJournalMetric", Number(event.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="未知期刊处理">
            <select
              value={values.journalMetricUnknown}
              onChange={(event) => set("journalMetricUnknown", event.target.value as AppSettings["journalMetricUnknown"])}
              className={inputClass}
            >
              <option value="allow">允许（不因缺少指标排除）</option>
              <option value="reject">排除（只收有指标期刊）</option>
            </select>
          </Field>
        </div>

        <div className="rounded-lg border border-line bg-bg-elevated px-3 py-2.5 text-[10.5px] leading-5 text-muted">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-ink-2">指标覆盖</span>
            <span>{metricCoverage.matchedJournals}/{metricCoverage.totalJournals} 个已入库期刊有指标</span>
            <span>JCR {metricCoverage.jcrCount}</span>
            <span>OpenAlex {metricCoverage.openalexCount}</span>
            <span>自定义 {metricCoverage.customCount}</span>
          </div>
          {metricCoverage.missingJournals.length ? (
            <div className="mt-1 text-faint">
              尚无指标：{metricCoverage.missingJournals.slice(0, 6).join("、")}
              {metricCoverage.missingJournals.length > 6 ? "…" : ""}
            </div>
          ) : null}
          {metricCoverage.recent.length ? (
            <div className="mt-2 max-h-28 overflow-y-auto border-t border-line pt-1.5">
              {metricCoverage.recent.slice(0, 6).map((metric) => (
                <div key={metric.journalId} className="flex items-center justify-between gap-2">
                  <span className="truncate">{metric.journalName}</span>
                  <span className="num shrink-0 text-ink-2">
                    {metric.value} · {metric.metricSource} {metric.metricYear}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-line bg-bg-elevated p-3">
          <div className="mb-2 text-[11px] font-medium text-ink-2">导入 JCR / 自定义期刊指标 CSV</div>
          <p className="mb-2 text-[10px] leading-5 text-faint">
            需要列：Journal（或 Title）、Impact Factor（或 JIF）、ISSN（可选）、Year（可选）。CSV 只在本地解析入库，不上传第三方。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="file"
              accept=".csv,.tsv,.txt"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setCsv(await file.text());
                setImportState("idle");
                setImportMessage(`已读取 ${file.name}`);
              }}
              className="max-w-full text-[10.5px] text-muted file:mr-2 file:rounded-full file:border-0 file:bg-accent-soft file:px-3 file:py-1 file:text-[10.5px] file:text-accent-ink"
            />
            <select
              value={importSource}
              onChange={(event) => setImportSource(event.target.value as "jcr" | "custom")}
              className="h-8 rounded-full border border-line bg-surface px-2 text-[10.5px] text-ink-2"
            >
              <option value="jcr">JCR IF</option>
              <option value="custom">自定义</option>
            </select>
            <input
              type="number"
              min={1990}
              max={2100}
              value={importYear}
              onChange={(event) => setImportYear(Number(event.target.value))}
              className="h-8 w-20 rounded-full border border-line bg-surface px-2 text-[10.5px] text-ink-2"
              title="指标年份"
            />
          </div>
          <textarea
            value={csv}
            onChange={(event) => setCsv(event.target.value)}
            rows={3}
            placeholder={"Journal,ISSN,Impact Factor,Year\nNature,0028-0836,50.5,2025\n..."}
            className={cx(inputClass, "mt-2 h-auto resize-y py-2 font-mono text-[10px] leading-5")}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void importCsv()}
              disabled={importState === "loading"}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[11px] font-medium text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {importState === "loading" ? "导入中…" : "导入指标 CSV"}
            </button>
            <ActionButton
              endpoint="/api/jobs"
              body={{ type: "journal_metrics_refresh", payload: { force: true } }}
              label="刷新 OpenAlex 指标"
              pendingLabel="提交中…"
              variant="secondary"
              size="sm"
              redirectTo="/agent?job={jobId}"
            />
            {importMessage ? (
              <span className={cx("text-[10px]", importState === "error" ? "text-danger" : "text-muted")}>
                {importMessage}
              </span>
            ) : null}
          </div>
        </div>
        <p className="text-[9.5px] leading-4 text-faint">
          指标门槛只影响后续入库与每日推荐；历史已入库论文仍保留，但可在文献库按指标筛选。JCR 数据版权归 Clarivate 所有，请勿把导入文件提交到仓库。
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

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3">
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
