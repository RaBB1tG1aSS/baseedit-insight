import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, FileText, GitCompare, Network, Search, Sparkles, Timer } from "lucide-react";
import { globalSearch } from "@/server/db/repo/search";
import { ENTITY_TYPE_LABEL, RELATION_LABELS, TIMELINE_CATEGORY_LABEL } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { PaperCard } from "@/components/paper-card";
import { Badge, EmptyState, EvidenceNatureBadge, Kicker, SectionHeading, TextLink } from "@/components/ui";

export const metadata: Metadata = { title: "全局搜索" };
export const dynamic = "force-dynamic";

type Params = Promise<{ q?: string }>;

export default async function SearchPage({ searchParams }: { searchParams: Params }) {
  const { q } = await searchParams;
  const query = (q ?? "").trim();
  const result = globalSearch(query);
  const hasResults =
    result.papers.total + result.entities.length + result.relations.length + result.timeline.length + result.reports.length > 0;

  return (
    <div className="container-page pb-16 pt-10">
      <header className="mb-7">
        <Kicker className="mb-2">Search across the verified corpus</Kicker>
        <h1 className="display text-3xl font-semibold text-ink md:text-4xl">全局搜索</h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted">
          同时搜索已核验论文、知识实体、有证据关系、技术时间线与周报。所有结果均来自中央文献数据库，不包含候选或拒绝记录。
        </p>
        <form action="/search" method="get" className="mt-5 max-w-2xl">
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface p-1.5 pl-4 shadow-soft">
            <Search size={15} className="shrink-0 text-faint" />
            <input
              name="q"
              defaultValue={query}
              autoFocus
              placeholder="搜索标题、作者、DOI、编辑器、疾病、递送技术…"
              className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-ink placeholder:text-faint focus:outline-none"
            />
            <button
              type="submit"
              className="inline-flex h-8 shrink-0 items-center rounded-full bg-accent px-4 text-[12px] font-medium text-white hover:bg-accent-strong"
            >
              搜索
            </button>
          </div>
        </form>
        {query ? (
          <p className="mt-2 text-[11px] text-faint">
            “{query}” 共匹配 {result.total} 条结果 · 论文 {result.papers.total} 篇
          </p>
        ) : null}
      </header>

      {!query ? (
        <EmptyState
          icon={<Search size={20} />}
          title="输入关键词开始搜索"
          description="例如：ABE8e、TadA、off-target、LNP、Leber、prime editing。搜索结果会按论文、知识实体、关系、时间线与周报分组。"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/papers" className="text-[12px] font-medium text-accent hover:text-accent-strong">
                浏览文献库
              </Link>
              <Link href="/graph" className="text-[12px] font-medium text-accent hover:text-accent-strong">
                打开知识图谱
              </Link>
            </div>
          }
        />
      ) : !hasResults ? (
        <EmptyState
          icon={<Search size={20} />}
          title="没有找到匹配内容"
          description="试试更短的关键词、编辑器名称（ABE8e）、疾病名或 DOI。候选与拒绝文献不会出现在全局搜索中。"
          action={<TextLink href="/papers">在文献库中继续查找</TextLink>}
        />
      ) : (
        <div className="space-y-10">
          {result.papers.papers.length ? (
            <section>
              <SectionHeading
                kicker="Papers"
                title={`已核验论文 · ${result.papers.total}`}
                action={<TextLink href={`/papers?q=${encodeURIComponent(query)}`}>在文献库查看全部 <ArrowRight size={13} /></TextLink>}
              />
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {result.papers.papers.slice(0, 6).map((paper) => (
                  <PaperCard key={paper.id} paper={paper} />
                ))}
              </div>
            </section>
          ) : null}

          {result.entities.length ? (
            <section>
              <SectionHeading kicker="Knowledge entities" title="知识实体" description="点击实体进入知识图谱并定位节点。" />
              <div className="mt-4 grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {result.entities.map((entity) => (
                  <Link
                    key={entity.id}
                    href={`/graph?entity=${entity.id}`}
                    className="group rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-line-strong"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[12.5px] font-medium text-ink group-hover:text-accent-strong">
                        {entity.nameZh || entity.name}
                      </span>
                      <Badge variant="outline">{ENTITY_TYPE_LABEL[entity.type]}</Badge>
                    </div>
                    {entity.nameZh ? <div className="mt-0.5 text-[10px] text-faint">{entity.name}</div> : null}
                    <p className="mt-1 line-clamp-2 text-[10.5px] leading-5 text-muted">
                      {entity.description ?? "暂无描述"}
                    </p>
                    <div className="mt-1 text-[9.5px] text-faint">
                      关联 {entity.paperCount} 篇论文{entity.firstYear ? ` · 起始 ${entity.firstYear}` : ""}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {result.relations.length ? (
            <section>
              <SectionHeading kicker="Evidence-backed relations" title="知识关系" />
              <div className="mt-4 space-y-2">
                {result.relations.map((relation) => (
                  <div key={relation.id} className="rounded-xl border border-line bg-surface px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                      <span className="font-medium text-ink">{relation.sourceName}</span>
                      <span className="text-[10px] text-accent">{RELATION_LABELS[relation.relationType] ?? relation.relationType}</span>
                      <span className="font-medium text-ink">{relation.targetName}</span>
                      <EvidenceNatureBadge nature={relation.nature} />
                    </div>
                    <p className="mt-1 line-clamp-2 font-serif text-[11px] italic leading-6 text-muted">“{relation.evidenceText}”</p>
                    <div className="mt-1 text-[9.5px] text-faint">
                      {relation.paperTitle} · {relation.evidenceLocation}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {result.timeline.length ? (
            <section>
              <SectionHeading
                kicker="Timeline"
                title="技术时间线事件"
                action={<TextLink href="/timeline">打开完整时间线 <ArrowRight size={13} /></TextLink>}
              />
              <div className="mt-4 space-y-2">
                {result.timeline.map((event) => (
                  <Link
                    key={event.id}
                    href={`/papers/${event.paperId}`}
                    className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-line-strong"
                  >
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                      <Timer size={13} />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-medium text-ink">{event.titleZh || event.title}</span>
                        <Badge variant="outline">{event.eventDate}</Badge>
                        <Badge variant="outline">{TIMELINE_CATEGORY_LABEL[event.category] ?? event.category}</Badge>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[10.5px] leading-5 text-muted">
                        {event.description}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {result.reports.length ? (
            <section>
              <SectionHeading kicker="Weekly reports" title="周报" />
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {result.reports.map((report) => (
                  <Link
                    key={report.id}
                    href={`/weekly/${report.id}`}
                    className="rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-line-strong"
                  >
                    <div className="flex items-center gap-2 text-[10px] text-faint">
                      <FileText size={11} /> {report.weekStart} — {report.weekEnd}
                    </div>
                    <div className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-6 text-ink">{report.title}</div>
                    <div className="mt-1 text-[10px] text-faint">引用 {report.citedPapers.length} 篇论文</div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[10.5px] text-muted">
            <span className="inline-flex items-center gap-1.5"><Network size={12} /> 关系与时间线仅来自 accepted 论文</span>
            <span className="inline-flex items-center gap-1.5"><GitCompare size={12} /> 在文献卡片点击「对比」可并排阅读</span>
            <span className="inline-flex items-center gap-1.5"><Sparkles size={12} /> 搜索不会调用 AI，不产生新结论</span>
          </div>
        </div>
      )}
    </div>
  );
}
