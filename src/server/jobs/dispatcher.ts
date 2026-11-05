import type { JobRun } from "@/lib/types";
import { appendLog, setJobProgress } from "../db/repo/jobs";
import { getSettings } from "../db/repo/settings";
import { runDailyPipeline } from "../pipeline/runDaily";
import { analyzeFiguresOnly, analyzePaper, knowledgeBacklog } from "../pipeline/analyze";
import { reverifyPaper } from "../pipeline/reverify";
import { recheckPaperStatus } from "../pipeline/statusWatch";
import { extractKnowledgeAI, extractKnowledgeRuleBased } from "../ai/knowledge";
import { generateWeeklyReport } from "../ai/weekly";
import { refreshJournalMetricsForCorpus } from "../metrics/journals";
import { isAiAvailable } from "../ai/client";
import { getPaperById, getPapersPendingStatusWatch } from "../db/repo/papers";
import { todayInZone } from "../db/client";
import { weekOf } from "../utils/time";

type Payload = Record<string, unknown>;

function str(payload: Payload, key: string): string | undefined {
  const value = payload[key];
  return typeof value === "string" ? value : undefined;
}

function num(payload: Payload, key: string): number | undefined {
  const value = payload[key];
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function runJob(job: JobRun): Promise<void> {
  const log = (level: "info" | "warn" | "error", stage: string, message: string, data?: unknown) => {
    console.log(`[job:${job.type}:${job.id}] ${message}`);
    appendLog(job.id, level, stage, message, data);
  };
  const setStage = (stage: string, stageLabel: string, extra: Record<string, unknown> = {}) => {
    setJobProgress(job.id, { stage, stageLabel, ...extra });
  };

  log("info", "job", `开始执行 ${job.type}`, { payload: job.payload });
  setStage("start", "任务已启动");

  const payload = job.payload as Payload;

  switch (job.type) {
    case "daily_pipeline": {
      const summary = await runDailyPipeline({
        jobId: job.id,
        sinceDays: num(payload, "sinceDays"),
        limit: num(payload, "limit"),
        maxDeepReads: num(payload, "maxDeepReads"),
        maxFigures: num(payload, "maxFigures"),
        forceWeekly: payload.forceWeekly === true,
      });
      setStage("done", "每日流水线完成", {
        candidates: summary.candidates,
        verified: summary.verified,
        accepted: summary.accepted,
        failed: summary.failed,
      });
      log("info", "done", "每日流水线完成", summary);
      return;
    }

    case "search_only": {
      const summary = await runDailyPipeline({
        jobId: job.id,
        mode: "search_only",
        query: str(payload, "query"),
        sinceDays: num(payload, "sinceDays"),
        limit: num(payload, "limit"),
        includeLandmark: false,
      });
      setStage("done", "检索任务完成", {
        candidates: summary.candidates,
        verified: summary.verified,
        accepted: summary.accepted,
      });
      log("info", "done", "手动检索完成", summary);
      return;
    }

    case "manual_analysis":
    case "reanalyze_paper": {
      const paperId = str(payload, "paperId");
      if (!paperId) throw new Error("缺少 paperId");
      const paper = getPaperById(paperId);
      if (!paper) throw new Error(`论文不存在：${paperId}`);
      const figuresOnly = payload.figuresOnly === true;

      if (figuresOnly) {
        setStage("figures", "重新生成图表分析");
        const result = await analyzeFiguresOnly(paperId, {
          force: true,
          onLog: (level, message) => log(level, "figures", message),
        });
        log("info", "done", `图表分析完成 ${result.count} 张`, result);
      } else {
        setStage("analyze", "生成深度精讲与图表分析");
        const result = await analyzePaper(paperId, {
          force: job.type === "reanalyze_paper" || payload.force === true,
          maxFigures: num(payload, "maxFigures") ?? 6,
          onLog: (level, message) => log(level, "analysis", message),
        });
        if (result.error) throw new Error(result.error);
        log("info", "done", "论文分析完成", result);
      }
      setStage("done", "分析完成");
      return;
    }

    case "knowledge_update": {
      setStage("knowledge", "更新知识图谱");
      const explicit = payload.paperIds;
      const paperIds = Array.isArray(explicit)
        ? explicit.filter((value): value is string => typeof value === "string")
        : knowledgeBacklog(6).map((paper) => paper.id);
      if (!paperIds.length) {
        log("info", "knowledge", "没有需要更新知识图谱的论文");
        return;
      }
      const result = isAiAvailable()
        ? await extractKnowledgeAI(paperIds)
        : extractKnowledgeRuleBased(paperIds);
      log("info", "knowledge", `知识更新完成`, result);
      setStage("done", "知识图谱更新完成", { total: paperIds.length });
      return;
    }

    case "weekly_report": {
      const settings = getSettings();
      const today = todayInZone(settings.timezone);
      const week = weekOf(today);
      const weekStart = str(payload, "weekStart") ?? week.start;
      const weekEnd = str(payload, "weekEnd") ?? week.end;
      setStage("weekly", "生成每周研究进展报告");
      const result = await generateWeeklyReport({ weekStart, weekEnd, force: payload.force === true });
      log("info", "weekly", `周报完成`, result);
      if (result.error) log("warn", "weekly", result.error);
      setStage("done", "周报生成完成", { reportId: result.reportId });
      return;
    }

    case "reverify_paper": {
      const paperId = str(payload, "paperId");
      if (!paperId) throw new Error("缺少 paperId");
      setStage("verify", "重新核验论文");
      const result = await reverifyPaper(paperId);
      log("info", "verify", `重新核验完成：${result.status}，质量 ${result.quality}/100`, result);
      setStage("done", "重新核验完成");
      return;
    }

    case "journal_metrics_refresh": {
      setStage("metrics", "刷新期刊影响力指标");
      const result = await refreshJournalMetricsForCorpus({
        force: payload.force === true,
        onLog: (level, message) => log(level, "metrics", message),
      });
      log("info", "metrics", `期刊指标刷新完成：${result.fetched}/${result.journals} 个期刊有指标，${result.updatedPapers} 篇论文已更新`);
      setStage("done", "期刊指标刷新完成", { total: result.journals, fetched: result.fetched });
      return;
    }

    case "status_watch": {
      setStage("watch", "复查撤稿/勘误状态");
      const cutoff = new Date(Date.now() - 14 * 86400000).toISOString();
      const targets = getPapersPendingStatusWatch(cutoff, num(payload, "limit") ?? 5);
      let changed = 0;
      for (const paper of targets) {
        const result = await recheckPaperStatus(paper.id);
        if (result.changed) changed += 1;
        log("info", "watch", `${paper.title.slice(0, 60)} → ${result.retractionStatus}`, result.notes);
      }
      setStage("done", "状态复查完成", { checked: targets.length, changed });
      log("info", "done", `状态复查 ${targets.length} 篇，变化 ${changed} 篇`);
      return;
    }

    default:
      throw new Error(`未知任务类型：${job.type}`);
  }
}
