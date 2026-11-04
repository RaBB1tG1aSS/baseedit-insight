import type { DeepReadContent, Paper, WeeklyReport, WeeklyReportContent } from "@/lib/types";
import { getPapersForReport, getNewlyPublishedPapers, getNewlyRetrievedPapers, getPaperTitles } from "../db/repo/papers";
import { getLatestAnalysis } from "../db/repo/analysis";
import { getWeeklyReportByWeekStart, upsertWeeklyReport } from "../db/repo/knowledge";
import { localDateEndIso, localDateStartIso } from "../utils/time";
import { getSettings } from "../db/repo/settings";
import { callStructured, isAiAvailable } from "./client";
import { weeklyReportSchema } from "./schemas";
import { weeklyPrompt } from "./prompts";

const TEMPLATE_VERSION = "weekly-v1";

export interface WeeklyGenerationResult {
  reportId: string;
  mode: "ai" | "template" | "reused";
  paperCount: number;
  model: string | null;
  costUsd: number | null;
  error?: string | null;
}

function analysisFor(paperId: string): DeepReadContent | null {
  const analysis = getLatestAnalysis(paperId, "deep_read");
  return analysis ? (analysis.content as DeepReadContent) : null;
}

function section(key: string, heading: string, body: string, paperIds: string[]): WeeklyReportContent["sections"][number] {
  return { key, heading, body_md: body.trim(), paper_ids: paperIds };
}

function templateReport(params: {
  weekStart: string;
  weekEnd: string;
  verified: Paper[];
  newlyPublished: Paper[];
  newlyRetrieved: Paper[];
}): WeeklyReportContent {
  const { verified, newlyPublished, newlyRetrieved } = params;
  const focusCounts = new Map<string, number>();
  for (const paper of verified) {
    for (const area of paper.focusAreas) focusCounts.set(area, (focusCounts.get(area) ?? 0) + 1);
  }

  const top = [...verified].sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0)).slice(0, 3);
  const representative = top
    .map((paper) => {
      const analysis = analysisFor(paper.id);
      return `- **${paper.title}**${paper.titleZh ? `（${paper.titleZh}）` : ""} — ${analysis?.one_liner ?? "（尚未生成精讲，可进入论文页查看原始摘要）"}`;
    })
    .join("\n");

  const overviewLines = [
    `本周通过核验并入库的论文共 **${verified.length}** 篇；本周新发表（含尚未入库）**${newlyPublished.length}** 篇；新检索到的历史论文 **${newlyRetrieved.length}** 篇。`,
    verified.length
      ? `研究方向分布：${[...focusCounts.entries()].map(([area, count]) => `${area}(${count})`).join("、")}。`
      : "本周没有新增通过核验的论文，因此不进行趋势推断。",
  ];

  const sections = [
    section("overview", "本周研究概览", overviewLines.join("\n\n"), verified.map((p) => p.id)),
    section(
      "representative",
      "代表性研究",
      representative ||
        "本周没有新增的已核验论文。历史论文可在文献库中查看。",
      top.map((p) => p.id),
    ),
    section(
      "trends",
      "研究方向变化",
      verified.length >= 3
        ? `本周入库论文的主题集中在：${[...focusCounts.keys()].join("、")}。以上仅为文献计量分布，不足以断言领域趋势。`
        : "本周新增核验论文不足 3 篇，样本量不足以分析研究方向变化。",
      verified.map((p) => p.id),
    ),
    section(
      "knowledge",
      "本周知识积累",
      verified.length
        ? verified
            .map((paper) => {
              const analysis = analysisFor(paper.id);
              if (!analysis) return `- ${paper.title}（暂无精讲）`;
              return `- ${paper.title}：${analysis.takeaways.slice(0, 2).join("；")}`;
            })
            .join("\n")
        : "本周没有新增知识点。",
      verified.map((p) => p.id),
    ),
  ];

  return {
    title: `碱基编辑研究进展 · ${params.weekStart} 至 ${params.weekEnd}`,
    period_label: `${params.weekStart} – ${params.weekEnd}`,
    sections,
  };
}

export function reportToMarkdown(content: WeeklyReportContent, paperTitles: Map<string, string>): string {
  const lines: string[] = [`# ${content.title}`, "", `> 报告周期：${content.period_label}`, ""];
  for (const section of content.sections) {
    lines.push(`## ${section.heading}`, "", section.body_md, "");
    if (section.paper_ids.length) {
      lines.push(
        `**引用论文**：${section.paper_ids
          .map((id) => `[${paperTitles.get(id) ?? id}](/papers/${id})`)
          .join("；")}`,
        "",
      );
    }
  }
  lines.push("---", "由 BaseEdit Insight 基于中央文献数据库中已核验论文生成。");
  return lines.join("\n");
}

export async function generateWeeklyReport(params: {
  weekStart: string;
  weekEnd: string;
  force?: boolean;
}): Promise<WeeklyGenerationResult> {
  const settings = getSettings();
  const { weekStart, weekEnd } = params;
  const existing = getWeeklyReportByWeekStart(weekStart);
  if (existing && !params.force && existing.status === "published") {
    return {
      reportId: existing.id,
      mode: "reused",
      paperCount: existing.citedPapers.length,
      model: existing.model,
      costUsd: null,
    };
  }

  const startIso = localDateStartIso(weekStart, settings.timezone);
  const endIso = localDateEndIso(weekEnd, settings.timezone);
  const verified = getPapersForReport(startIso, endIso);
  const newlyPublished = getNewlyPublishedPapers(weekStart, weekEnd);
  const newlyRetrieved = getNewlyRetrievedPapers(startIso, endIso, weekStart);

  const buildAndStore = (
    content: WeeklyReportContent,
    meta: { mode: "ai" | "template"; model: string | null; costUsd: number | null; error?: string | null },
  ): WeeklyGenerationResult => {
    const cited = Array.from(
      new Set(content.sections.flatMap((section) => section.paper_ids)),
    );
    const titles = getPaperTitles(cited);
    const titleMap = new Map([...titles.entries()].map(([id, value]) => [id, value.title]));
    const markdown = reportToMarkdown(content, titleMap);
    const reportId = upsertWeeklyReport({
      weekStart,
      weekEnd,
      title: content.title,
      content,
      contentMd: markdown,
      citedPapers: cited,
      model: meta.model,
      promptVersion: meta.mode === "ai" ? TEMPLATE_VERSION : "template-v1",
      status: "published",
    });
    return {
      reportId,
      mode: meta.mode,
      paperCount: verified.length,
      model: meta.model,
      costUsd: meta.costUsd,
      error: meta.error ?? null,
    };
  };

  if (!isAiAvailable()) {
    const content = templateReport({ weekStart, weekEnd, verified, newlyPublished, newlyRetrieved });
    return buildAndStore(content, {
      mode: "template",
      model: "deterministic",
      costUsd: null,
      error: "AI 不可用：已生成仅含数据库事实的模板报告，无 AI 综合分析。",
    });
  }

  try {
    const { data, meta } = await callStructured(weeklyReportSchema, {
      prompt: weeklyPrompt({
        weekStart,
        weekEnd,
        newlyVerified: verified.map((paper) => {
          const analysis = analysisFor(paper.id);
          return {
            paper,
            oneLiner: analysis?.one_liner,
            innovations: analysis?.innovations.map((item) => item.description),
            significance: analysis?.significance,
            analysisLevel: analysis ? "已生成精讲" : "未生成精讲",
          };
        }),
        newlyPublished: newlyPublished.map((paper) => ({ id: paper.id, title: paper.title, date: paper.publicationDate })),
        newlyRetrieved: newlyRetrieved.map((paper) => ({ id: paper.id, title: paper.title, date: paper.publicationDate })),
      }),
      templateVersion: TEMPLATE_VERSION,
      timeoutMs: 300_000,
    });

    const allowed = new Set(verified.map((paper) => paper.id));
    const titles = getPaperTitles(verified.map((paper) => paper.id));
    const prefixToId = new Map<string, string>();
    for (const paper of verified) {
      prefixToId.set(paper.id.slice(0, 12), paper.id);
    }
    const linkify = (markdown: string): string =>
      markdown
        .split(/(```[\s\S]*?```)/g)
        .map((part, index) => {
          // Never rewrite links inside fenced code blocks (e.g. a tool lineage tree).
          if (index % 2 === 1) return part;
          return part.replace(/pap_[0-9a-f]{8}/g, (match) => {
            const paperId = prefixToId.get(match);
            if (!paperId) return match;
            const title = titles.get(paperId);
            const full = title?.titleZh || title?.title || paperId;
            const label = full.length > 22 ? `${full.slice(0, 21)}…` : full;
            return `[${label}](/papers/${paperId})`;
          });
        })
        .join("");

    const content: WeeklyReportContent = {
      title: data.title,
      period_label: data.period_label,
      sections: data.sections.map((section) => {
        const linked = [
          ...section.body_md.matchAll(
            /\/papers\/(pap_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/g,
          ),
        ]
          .map((match) => match[1])
          .filter((id) => allowed.has(id));

        const declared = section.paper_ids
          .map((raw) => {
            const value = raw.trim();
            if (allowed.has(value)) return value;
            const prefix = value.slice(0, 12);
            return prefixToId.get(prefix) ?? null;
          })
          .filter((id): id is string => Boolean(id));

        return {
          ...section,
          body_md: linkify(section.body_md),
          paper_ids: [...new Set([...declared, ...linked])].filter((id) => allowed.has(id)),
        };
      }),
    };
    return buildAndStore(content, {
      mode: "ai",
      model: meta.model,
      costUsd: meta.costUsd,
    });
  } catch (error) {
    const content = templateReport({ weekStart, weekEnd, verified, newlyPublished, newlyRetrieved });
    return buildAndStore(content, {
      mode: "template",
      model: "deterministic",
      costUsd: null,
      error: `AI 生成失败，已回退为数据模板报告：${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function getWeeklyReportByWeek(weekStart: string): WeeklyReport | null {
  return getWeeklyReportByWeekStart(weekStart);
}

export function weeklyPaperCount(report: WeeklyReport): number {
  return report.citedPapers.length;
}

export function paperTitleLookup(ids: string[]): Map<string, string> {
  const titles = getPaperTitles(ids);
  return new Map([...titles.entries()].map(([id, value]) => [id, value.title]));
}
