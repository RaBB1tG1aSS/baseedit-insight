import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, CalendarDays, FileText, Sparkles } from "lucide-react";
import { getWeeklyReportMonths, listWeeklyReports } from "@/server/db/repo/knowledge";
import { formatDate, formatDateTime, markdownExcerpt } from "@/lib/format";
import { ActionButton } from "@/components/action-button";
import { Badge, EmptyState, Kicker, cx } from "@/components/ui";

export const metadata: Metadata = { title: "每周研究进展" };
export const dynamic = "force-dynamic";

type Params = Promise<{ month?: string }>;

export default async function WeeklyPage({ searchParams }: { searchParams: Params }) {
  const { month } = await searchParams;
  const months = getWeeklyReportMonths();
  const selectedMonth = month && /^\d{4}-\d{2}$/.test(month) ? month : undefined;
  const reports = listWeeklyReports(36, selectedMonth);

  return (
    <div className="container-page pb-16 pt-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker className="mb-2">Weekly research digest</Kicker>
          <h1 className="display text-3xl font-semibold text-ink md:text-4xl">每周研究进展</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted">
            直接读取中央文献数据库中本周新增、已核验的论文，区分「本周新发表」「新检索到的历史论文」与「通过核验并入库」三类。
            文献不足时会明确说明，不夸大领域趋势。
          </p>
        </div>
        <ActionButton
          endpoint="/api/weekly/generate"
          body={{ force: true }}
          label="生成本周报告"
          pendingLabel="提交中…"
          variant="primary"
          icon={<Sparkles size={13} />}
          redirectTo="/agent?job={jobId}"
        />
      </header>

      {months.length ? (
        <div className="mb-6 flex flex-wrap items-center gap-1.5">
          <Link
            href="/weekly"
            className={cx(
              "rounded-full border px-3 py-1 text-[11px] transition",
              !selectedMonth ? "border-accent/25 bg-accent-soft text-accent-ink" : "border-line text-muted hover:text-ink",
            )}
          >
            全部
          </Link>
          {months.map((item) => (
            <Link
              key={item}
              href={`/weekly?month=${item}`}
              className={cx(
                "rounded-full border px-3 py-1 text-[11px] transition",
                selectedMonth === item
                  ? "border-accent/25 bg-accent-soft text-accent-ink"
                  : "border-line text-muted hover:text-ink",
              )}
            >
              {item}
            </Link>
          ))}
        </div>
      ) : null}

      {reports.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {reports.map((report) => (
            <Link
              key={report.id}
              href={`/weekly/${report.id}`}
              className="card group flex flex-col p-6 transition hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
            >
              <div className="flex items-center justify-between">
                <div className="inline-flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.14em] text-accent">
                  <CalendarDays size={11} />
                  {report.weekStart} — {report.weekEnd}
                </div>
                <Badge variant={report.status === "published" ? "success" : report.status === "failed" ? "danger" : "outline"}>
                  {report.status === "published" ? "已发布" : report.status === "failed" ? "生成失败" : "草稿"}
                </Badge>
              </div>
              <h2 className="display mt-3 text-xl font-semibold leading-8 text-ink group-hover:text-accent-strong">
                {report.title}
              </h2>
              <p className="mt-2 line-clamp-3 text-[12.5px] leading-7 text-muted">
                {markdownExcerpt(report.content?.sections?.[0]?.body_md, 180) ||
                  "打开查看本周研究进展与论文关联。"}
              </p>
              <div className="mt-auto flex items-center justify-between border-t border-line/70 pt-3 text-[10.5px] text-faint">
                <span>
                  {report.citedPapers.length} 篇引用 · {report.model ?? "未知模型"}
                </span>
                <span className="inline-flex items-center gap-1 text-accent">
                  阅读 <ArrowRight size={11} />
                </span>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<FileText size={20} />}
          title={selectedMonth ? "该月没有周报" : "还没有生成周报"}
          description="周报默认在每周日由后台调度生成；也可以立即手动生成。报告只使用中央文献数据库中已核验的论文。"
          action={
            <ActionButton
              endpoint="/api/weekly/generate"
              body={{ force: true }}
              label="生成本周报告"
              variant="primary"
              redirectTo="/agent?job={jobId}"
            />
          }
        />
      )}

      <div className="mt-8 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[11px] leading-6 text-muted">
        <span className="font-medium text-ink-2">生成规则：</span>
        报告周期为周一至周日（{formatDate(new Date().toISOString().slice(0, 10))} 参考）。若本周没有新增已核验论文，报告会如实说明样本不足，
        不进行趋势外推。每节引用的论文均可点击回到精讲页面。
      </div>
    </div>
  );
}
