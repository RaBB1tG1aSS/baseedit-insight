import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BarChart3, BookOpen, Heart, NotebookPen, Quote, Sparkles, TrendingUp } from "lucide-react";
import { getInsightsData } from "@/server/db/repo/insights";
import { formatDate } from "@/lib/format";
import { Badge, EmptyState, Kicker, ProgressBar, Stat, TextLink, cx } from "@/components/ui";

export const metadata: Metadata = { title: "研究洞察" };
export const dynamic = "force-dynamic";

export default function InsightsPage() {
  const data = getInsightsData();
  const maxYear = Math.max(1, ...data.byYear.map((item) => item.count));
  const maxFocus = Math.max(1, ...data.focus.map((item) => item.count));
  const maxScore = Math.max(1, ...data.scoreBuckets.map((item) => item.count));
  const maxEntity = Math.max(1, ...data.entitiesByType.map((item) => item.count));

  return (
    <div className="container-page pb-16 pt-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker className="mb-2">Corpus analytics</Kicker>
          <h1 className="display text-3xl font-semibold text-ink md:text-4xl">研究洞察</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted">
            基于中央文献库中已核验论文的统计与个人阅读记录。所有数字均来自数据库；
            样本有限时只呈现分布，不把局部数据包装成领域趋势。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/papers"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <BookOpen size={13} /> 浏览文献库
          </Link>
          <Link
            href="/graph"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <BarChart3 size={13} /> 知识图谱
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="已核验论文" value={data.accepted} hint="中央文献库 accepted" icon={<BookOpen size={14} />} />
        <Stat label="累计被引" value={data.citations.total} hint={`均被引 ${data.citations.average} · 最高 ${data.citations.max}`} icon={<Quote size={14} />} />
        <Stat label="收藏 / 已读" value={`${data.reading.favorites} / ${data.reading.read}`} hint={`${data.reading.notes} 篇有个人笔记`} icon={<Heart size={14} />} />
        <Stat label="周报" value={data.weeklyReports} hint="历史周报档案" icon={<NotebookPen size={14} />} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-8">
          <section className="card p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="kicker mb-1">Publication years</div>
                <h2 className="display text-lg font-semibold text-ink">发表年份分布</h2>
              </div>
              <span className="text-[10px] text-faint">按已核验论文的发表日期</span>
            </div>
            {data.byYear.length ? (
              <div className="mt-4">
                <div className="flex items-end gap-2">
                  {data.byYear.map((item) => (
                    <div key={item.year} className="flex h-36 flex-1 flex-col items-center justify-end gap-1">
                      <span className="num text-[10px] text-muted">{item.count}</span>
                      <div
                        className="w-full rounded-t bg-accent/80 transition-all"
                        style={{ height: `${Math.max(4, (item.count / maxYear) * 100)}%` }}
                        title={`${item.year}: ${item.count} 篇`}
                      />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  {data.byYear.map((item) => (
                    <div key={item.year} className="flex-1 text-center text-[9.5px] text-faint">
                      {item.year}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-faint">暂无发表日期数据。</p>
            )}
          </section>

          <div className="grid gap-6 md:grid-cols-2">
            <section className="card p-5">
              <div className="kicker mb-1">Research focus</div>
              <h2 className="display text-lg font-semibold text-ink">研究方向分布</h2>
              <div className="mt-4 space-y-3">
                {data.focus.map((item) => (
                  <div key={item.key}>
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span className="text-ink-2">{item.label}</span>
                      <span className="num text-faint">{item.count}</span>
                    </div>
                    <ProgressBar value={item.count} max={maxFocus} />
                  </div>
                ))}
              </div>
            </section>

            <section className="card p-5">
              <div className="kicker mb-1">Quality distribution</div>
              <h2 className="display text-lg font-semibold text-ink">综合评分分布</h2>
              <div className="mt-4 space-y-2">
                {data.scoreBuckets.map((bucket) => (
                  <div key={bucket.label} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-[10.5px] text-muted">{bucket.label}</span>
                    <div className="h-5 flex-1 overflow-hidden rounded-md bg-surface-2">
                      <div
                        className="flex h-full items-center justify-end rounded-md bg-accent/70 px-2 text-[9px] font-medium text-white"
                        style={{ width: `${bucket.count ? Math.max(8, (bucket.count / maxScore) * 100) : 0}%` }}
                      >
                        {bucket.count || ""}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[9.5px] leading-4 text-faint">
                评分为可解释的规则评分，不是同行评议结论。
              </p>
            </section>
          </div>

          <section className="card p-5">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="kicker mb-1">Most cited</div>
                <h2 className="display text-lg font-semibold text-ink">高被引已核验论文</h2>
              </div>
              <TextLink href="/papers?sort=citations">按引用排序 <ArrowRight size={12} /></TextLink>
            </div>
            {data.topCited.length ? (
              <div className="mt-3 divide-y divide-line/70">
                {data.topCited.map((paper, index) => (
                  <Link
                    key={paper.id}
                    href={`/papers/${paper.id}`}
                    className="group flex items-start gap-3 py-2.5 first:pt-0 last:pb-0"
                  >
                    <span className="num mt-0.5 w-5 shrink-0 text-[11px] font-semibold text-faint">{index + 1}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[12px] font-medium leading-5 text-ink group-hover:text-accent-strong">
                        {paper.titleZh || paper.title}
                      </span>
                      <span className="mt-0.5 block text-[9.5px] text-faint">
                        {paper.journal ?? "未知期刊"} · {formatDate(paper.publicationDate)} · 被引 {paper.citationCount}
                      </span>
                    </span>
                    <Badge variant="outline">{paper.qualityScore == null ? "—" : Math.round(paper.qualityScore)}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-faint">暂无数据。</p>
            )}
          </section>
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <section className="card p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="kicker mb-1">For you</div>
                <h2 className="display text-lg font-semibold text-ink">个性化推荐</h2>
              </div>
              <Sparkles size={15} className="text-accent" />
            </div>
            <p className="mt-1 text-[10px] leading-5 text-faint">
              {data.personalized.basis === "history"
                ? `基于你的阅读记录，偏好方向：${data.personalized.topAreas.join("、") || "尚未形成"}。`
                : "暂无阅读记录，当前按综合评分推荐未读论文。"}
            </p>
            {data.personalized.items.length ? (
              <div className="mt-3 space-y-2">
                {data.personalized.items.map((item) => (
                  <Link
                    key={item.paper.id}
                    href={`/papers/${item.paper.id}`}
                    className="group block rounded-lg border border-line bg-bg-elevated/40 px-3 py-2 transition hover:border-line-strong"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-[11.5px] font-medium leading-5 text-ink group-hover:text-accent-strong">
                        {item.paper.titleZh || item.paper.title}
                      </span>
                      <span className="num shrink-0 text-[10px] text-faint">{Math.round(item.paper.qualityScore ?? 0)}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-[9px] text-faint">{item.reason}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[11px] text-faint">暂无可推荐论文。</p>
            )}
            <p className="mt-3 text-[9px] leading-4 text-faint">
              仅根据你的收藏、已读、笔记与打开记录计算方向权重；不使用外部画像。
            </p>
          </section>

          <section className="card p-5">
            <div className="kicker mb-1">Journals</div>
            <h2 className="display text-lg font-semibold text-ink">期刊分布</h2>
            <div className="mt-3 space-y-2">
              {data.journals.map((item) => (
                <Link
                  key={item.journal}
                  href={`/papers?journal=${encodeURIComponent(item.journal)}`}
                  className="flex items-center justify-between gap-3 text-[10.5px] text-ink-2 hover:text-accent"
                >
                  <span className="truncate">{item.journal}</span>
                  <span className="num shrink-0 text-faint">{item.count}</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="card p-5">
            <div className="kicker mb-1">Knowledge entities</div>
            <h2 className="display text-lg font-semibold text-ink">知识实体类型</h2>
            <div className="mt-3 space-y-2.5">
              {data.entitiesByType.slice(0, 8).map((item) => (
                <div key={item.type}>
                  <div className="mb-1 flex items-center justify-between text-[10px]">
                    <span className="text-ink-2">{item.label}</span>
                    <span className="num text-faint">{item.count}</span>
                  </div>
                  <ProgressBar value={item.count} max={maxEntity} />
                </div>
              ))}
            </div>
            <TextLink href="/graph" className="mt-3 inline-flex">打开知识图谱 <ArrowRight size={11} /></TextLink>
          </section>

          <section className="rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[10px] leading-5 text-muted">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-ink-2">
              <TrendingUp size={12} /> 解读提示
            </div>
            当前样本 {data.accepted} 篇，且文献来自不同年份。这里的分布用于了解本库积累与研究兴趣，
            不能外推为整个碱基编辑领域的趋势或产出。
          </section>
        </aside>
      </div>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-[10.5px] text-muted">
        <span>
          共 {data.accepted} 篇已核验、{data.rejected} 条拒绝候选；累计 {data.weeklyReports} 份周报。
        </span>
        <div className="flex gap-3">
          <Link href="/compare" className="text-accent hover:text-accent-strong">论文对比</Link>
          <Link href="/search" className="text-accent hover:text-accent-strong">全局搜索</Link>
        </div>
      </div>
    </div>
  );
}
