import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, CalendarDays, Download, Sparkles } from "lucide-react";
import { getWeeklyReport } from "@/server/db/repo/knowledge";
import { getPaperTitles, getPapersForReport } from "@/server/db/repo/papers";
import { getSettings } from "@/server/db/repo/settings";
import { localDateEndIso, localDateStartIso } from "@/server/utils/time";
import { formatDateTime, formatDate } from "@/lib/format";
import { Markdown } from "@/components/markdown";
import { PrintButton } from "@/components/print-button";
import { ActionButton } from "@/components/action-button";
import { TableOfContents } from "@/components/toc";
import { Badge, InlineNotice, Kicker } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const report = getWeeklyReport(id);
  return { title: report?.title ?? "每周研究进展" };
}

export default async function WeeklyReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = getWeeklyReport(id);
  if (!report) notFound();

  const settings = getSettings();
  const startIso = localDateStartIso(report.weekStart, settings.timezone);
  const endIso = localDateEndIso(report.weekEnd, settings.timezone);
  const weekPapers = getPapersForReport(startIso, endIso);
  const titles = getPaperTitles(report.citedPapers);
  const sections = report.content?.sections ?? [];
  const templateMode = report.model === "deterministic";

  const toc = sections.map((section, index) => ({
    id: `section-${index}`,
    label: section.heading,
  }));

  return (
    <div className="container-page pb-16 pt-8">
      <div className="no-print mb-5 flex items-center gap-1.5 text-[11px] text-faint">
        <Link href="/weekly" className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft size={12} /> 每周进展
        </Link>
      </div>

      <header className="border-b border-line pb-7">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">Weekly Insight</Badge>
          <Badge variant="outline">
            <CalendarDays size={10} /> {report.weekStart} — {report.weekEnd}
          </Badge>
          <Badge variant={report.status === "published" ? "success" : "warn"}>
            {report.status === "published" ? "已发布" : report.status === "failed" ? "生成失败" : "草稿"}
          </Badge>
          {templateMode ? <Badge variant="warn">数据模板报告</Badge> : null}
        </div>
        <h1 className="display mt-4 max-w-4xl text-[1.8rem] font-semibold leading-tight text-ink md:text-[2.5rem]">
          {report.title}
        </h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
          <span>{report.content?.period_label}</span>
          <span>引用 {report.citedPapers.length} 篇已核验论文</span>
          <span>生成于 {formatDateTime(report.generatedAt)}</span>
          <span>模型 {report.model ?? "未记录"}</span>
          <span>模板 {report.promptVersion ?? "—"}</span>
        </div>
        <div className="no-print mt-4 flex flex-wrap items-center gap-2">
          <a
            href={`/api/export/weekly/${report.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <Download size={12} /> 导出 Markdown
          </a>
          <PrintButton label="打印 / 导出 PDF" />
          <ActionButton
            endpoint="/api/weekly/generate"
            body={{ weekStart: report.weekStart, weekEnd: report.weekEnd, force: true }}
            label="重新生成"
            pendingLabel="排队中…"
            variant="secondary"
            size="sm"
            icon={<Sparkles size={12} />}
            redirectTo="/agent?job={jobId}"
          />
        </div>
      </header>

      {templateMode ? (
        <div className="mt-5">
          <InlineNotice tone="warn" title="本报告由数据库事实模板生成">
            生成时 AI 分析引擎不可用，因此报告只包含数据库统计与论文事实，没有 AI 综合分析、趋势判断或跨论文比较。
            配置 AI 后重新生成可获得完整报告。
          </InlineNotice>
        </div>
      ) : null}

      <div className="mt-7 grid gap-10 xl:grid-cols-[190px_minmax(0,1fr)]">
        {toc.length ? (
          <aside className="no-print hidden self-start xl:sticky xl:top-24 xl:block">
            <TableOfContents items={toc} />
          </aside>
        ) : null}

        <article className="min-w-0 max-w-4xl">
          {sections.length ? (
            <div className="space-y-10">
              {sections.map((section, index) => {
                const cited = section.paper_ids
                  .map((paperId) => ({ id: paperId, ...titles.get(paperId) }))
                  .filter((item) => item.title);
                return (
                  <section key={`${section.key}-${index}`} id={`section-${index}`} className="scroll-mt-28">
                    <div className="mb-3 flex items-baseline gap-2.5">
                      <span className="num text-[10.5px] font-semibold text-accent">{String(index + 1).padStart(2, "0")}</span>
                      <h2 className="display text-[1.35rem] font-semibold text-ink">{section.heading}</h2>
                    </div>
                    <Markdown content={section.body_md} className="text-[13.5px]" />
                    {cited.length ? (
                      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/70 pt-3">
                        <span className="text-[10px] text-faint">引用：</span>
                        {cited.map((paper) => (
                          <Link
                            key={paper.id}
                            href={`/papers/${paper.id}`}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-0.5 text-[10px] text-muted hover:border-accent/30 hover:text-accent"
                            title={paper.title}
                          >
                            <span className="truncate">{paper.titleZh || paper.title}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : report.contentMd ? (
            <Markdown content={report.contentMd} />
          ) : (
            <p className="text-[13px] text-muted">报告正文缺失。</p>
          )}

          <section className="mt-12 border-t border-line pt-6">
            <div className="kicker mb-3">Corpus snapshot</div>
            <h2 className="display text-xl font-semibold text-ink">本周核验数据</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="num text-2xl font-semibold text-ink">{weekPapers.length}</div>
                <div className="mt-0.5 text-[10.5px] text-faint">本周通过核验并入库</div>
              </div>
              <div className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="num text-2xl font-semibold text-ink">{report.citedPapers.length}</div>
                <div className="mt-0.5 text-[10.5px] text-faint">报告引用的论文</div>
              </div>
              <div className="rounded-xl border border-line bg-surface px-4 py-3">
                <div className="num text-2xl font-semibold text-ink">{formatDate(report.weekEnd)}</div>
                <div className="mt-0.5 text-[10.5px] text-faint">报告周期结束</div>
              </div>
            </div>
            {weekPapers.length ? (
              <div className="mt-4 space-y-1.5">
                {weekPapers.map((paper) => (
                  <Link
                    key={paper.id}
                    href={`/papers/${paper.id}`}
                    className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2 text-[11.5px] text-ink-2 hover:border-line-strong"
                  >
                    <span className="line-clamp-1">{paper.titleZh || paper.title}</span>
                    <span className="shrink-0 text-[10px] text-faint">{paper.journal ?? "—"}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11.5px] text-muted">本周没有新增通过核验的论文。</p>
            )}
          </section>

          <footer className="mt-10 border-t border-line pt-4 text-[10px] leading-5 text-faint">
            <p>
              本报告直接读取中央文献数据库，引用论文均通过身份与质量门槛核验。AI 生成内容可能与原文存在偏差，请结合论文精讲与原文核验。
            </p>
            <p className="mt-1">
              Report ID：<span className="font-mono">{report.id}</span>
            </p>
          </footer>
        </article>
      </div>
    </div>
  );
}
