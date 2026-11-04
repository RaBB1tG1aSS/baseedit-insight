import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, BookMarked, Library, Search, SlidersHorizontal, X } from "lucide-react";
import { searchAcceptedPapers, getPublicationYears, getTopJournals } from "@/server/db/repo/papers";
import { getFocusAreaCounts } from "@/server/db/repo/dashboard";
import type { FocusArea, RecommendationCategory, SearchFilters } from "@/lib/types";
import { FOCUS_AREAS, FOCUS_LABEL } from "@/lib/constants";
import { PaperCard } from "@/components/paper-card";
import { EmptyState, Kicker, cx } from "@/components/ui";

export const metadata: Metadata = { title: "文献库" };

type Params = Promise<Record<string, string | string[] | undefined>>;

const FOCUS_KEYS = FOCUS_AREAS.map((area) => area.key) as FocusArea[];
const SORTS = ["score", "date", "citations", "added"] as const;

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

export default async function PapersPage({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  const q = one(raw.q)?.trim();
  const author = one(raw.author)?.trim();
  const doi = one(raw.doi)?.trim();
  const journal = one(raw.journal)?.trim();
  const year = positiveInt(one(raw.year));
  const focusRaw = one(raw.focus);
  const focus = FOCUS_KEYS.includes(focusRaw as FocusArea) ? (focusRaw as FocusArea) : undefined;
  const categoryRaw = one(raw.category);
  const category =
    categoryRaw === "latest" || categoryRaw === "landmark" ? (categoryRaw as RecommendationCategory) : undefined;
  const readRaw = one(raw.read);
  const readStatus = readRaw === "unread" || readRaw === "reading" || readRaw === "read" ? readRaw : undefined;
  const favorite = one(raw.favorite) === "1";
  const minScore = positiveInt(one(raw.minScore));
  const sortRaw = one(raw.sort);
  const sort = (SORTS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as (typeof SORTS)[number]) : "score";
  const page = Math.max(1, positiveInt(one(raw.page)) ?? 1);

  const filters: SearchFilters = {
    q,
    author,
    doi,
    year,
    journal,
    focusArea: focus,
    category,
    readStatus,
    favorite: favorite || undefined,
    minScore,
    sort,
    page,
    pageSize: 12,
  };

  const result = searchAcceptedPapers(filters);
  const years = getPublicationYears();
  const journals = getTopJournals(8);
  const focusCounts = getFocusAreaCounts();
  const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));

  const buildQuery = (overrides: Record<string, string | number | undefined>) => {
    const params = new URLSearchParams();
    const values: Record<string, string | number | undefined> = {
      q,
      author,
      doi,
      year,
      journal,
      focus,
      category,
      read: readStatus,
      favorite: favorite ? "1" : undefined,
      minScore,
      sort,
      page,
      ...overrides,
    };
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === "" || value === null) continue;
      params.set(key, String(value));
    }
    return `/papers?${params.toString()}`;
  };

  const activeChips: { label: string; remove: string }[] = [];
  if (q) activeChips.push({ label: `搜索：${q}`, remove: buildQuery({ q: undefined, page: 1 }) });
  if (author) activeChips.push({ label: `作者：${author}`, remove: buildQuery({ author: undefined, page: 1 }) });
  if (doi) activeChips.push({ label: `DOI：${doi}`, remove: buildQuery({ doi: undefined, page: 1 }) });
  if (year) activeChips.push({ label: `${year} 年`, remove: buildQuery({ year: undefined, page: 1 }) });
  if (journal) activeChips.push({ label: journal, remove: buildQuery({ journal: undefined, page: 1 }) });
  if (focus) activeChips.push({ label: FOCUS_LABEL[focus], remove: buildQuery({ focus: undefined, page: 1 }) });
  if (category) activeChips.push({ label: category === "latest" ? "前沿研究" : "经典研究", remove: buildQuery({ category: undefined, page: 1 }) });
  if (readStatus) activeChips.push({ label: readStatus === "unread" ? "未读" : readStatus === "reading" ? "在读" : "已读", remove: buildQuery({ read: undefined, page: 1 }) });
  if (favorite) activeChips.push({ label: "收藏", remove: buildQuery({ favorite: undefined, page: 1 }) });
  if (minScore) activeChips.push({ label: `评分 ≥ ${minScore}`, remove: buildQuery({ minScore: undefined, page: 1 }) });

  const pageWindow: number[] = [];
  for (let index = Math.max(1, page - 2); index <= Math.min(totalPages, page + 2); index += 1) pageWindow.push(index);

  return (
    <div className="container-page pb-16 pt-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker className="mb-2">Central verified library</Kicker>
          <h1 className="display text-3xl font-semibold text-ink md:text-4xl">文献库</h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted">
            只显示已通过身份核验与质量门槛的论文。每篇论文只有一个稳定的 paper_id，精进、图表、知识图谱与周报都引用同一条记录。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/papers?favorite=1"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <BookMarked size={13} /> 我的收藏
          </Link>
          <Link
            href="/candidates"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <Library size={13} /> 候选审核
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[250px_1fr]">
        <aside className="min-w-0 space-y-5">
          <details className="card overflow-hidden lg:!border-0 lg:!bg-transparent lg:!shadow-none" open>
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 lg:px-0 lg:py-0">
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink">
                <SlidersHorizontal size={13} /> 筛选条件
              </span>
              <span className="text-[10px] text-faint lg:hidden">展开 / 收起</span>
            </summary>
            <form action="/papers" method="get" className="min-w-0 space-y-4 px-5 pb-5 lg:px-0 lg:pb-0 lg:pt-4">
              <Field label="标题 / 关键词">
                <div className="relative">
                  <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
                  <input
                    name="q"
                    defaultValue={q}
                    placeholder="如 ABE8e, TadA, LNP"
                    className="h-9 w-full rounded-lg border border-line bg-surface pl-7 pr-2.5 text-[12px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
                  />
                </div>
              </Field>
              <Field label="作者">
                <input
                  name="author"
                  defaultValue={author}
                  placeholder="姓氏或全名"
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-[12px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
                />
              </Field>
              <Field label="DOI 精确匹配">
                <input
                  name="doi"
                  defaultValue={doi}
                  placeholder="10.xxxx/..."
                  className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-[11px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
                />
              </Field>
              <div className="grid min-w-0 grid-cols-2 gap-2">
                <Field label="年份">
                  <select name="year" defaultValue={year ?? ""} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink focus:border-accent/50 focus:outline-none">
                    <option value="">全部</option>
                    {years.map((item) => (
                      <option key={item.year} value={item.year}>
                        {item.year} ({item.count})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="评分">
                  <select name="minScore" defaultValue={minScore ?? ""} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink focus:border-accent/50 focus:outline-none">
                    <option value="">不限</option>
                    <option value="60">≥ 60</option>
                    <option value="70">≥ 70</option>
                    <option value="80">≥ 80</option>
                    <option value="90">≥ 90</option>
                  </select>
                </Field>
              </div>
              <Field label="研究方向">
                <select name="focus" defaultValue={focus ?? ""} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink focus:border-accent/50 focus:outline-none">
                  <option value="">全部方向</option>
                  {FOCUS_AREAS.map((area) => (
                    <option key={area.key} value={area.key}>
                      {area.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="推荐类型">
                  <select name="category" defaultValue={category ?? ""} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink focus:border-accent/50 focus:outline-none">
                    <option value="">全部</option>
                    <option value="latest">前沿</option>
                    <option value="landmark">经典</option>
                  </select>
                </Field>
                <Field label="阅读状态">
                  <select name="read" defaultValue={readStatus ?? ""} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink focus:border-accent/50 focus:outline-none">
                    <option value="">全部</option>
                    <option value="unread">未读</option>
                    <option value="reading">在读</option>
                    <option value="read">已读</option>
                  </select>
                </Field>
              </div>
              <Field label="排序">
                <select name="sort" defaultValue={sort} className="h-9 w-full rounded-lg border border-line bg-surface px-2 text-[12px] text-ink focus:border-accent/50 focus:outline-none">
                  <option value="score">综合评分</option>
                  <option value="date">发表时间</option>
                  <option value="citations">引用次数</option>
                  <option value="added">入库时间</option>
                </select>
              </Field>
              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-2">
                <input type="checkbox" name="favorite" value="1" defaultChecked={favorite} className="h-3.5 w-3.5 accent-[var(--accent)]" />
                只看收藏
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  className="h-9 flex-1 rounded-full bg-accent px-4 text-[12px] font-medium text-white transition hover:bg-accent-strong"
                >
                  应用筛选
                </button>
                <Link
                  href="/papers"
                  className="inline-flex h-9 items-center rounded-full border border-line px-3 text-[12px] text-muted hover:text-ink"
                >
                  重置
                </Link>
              </div>
            </form>
          </details>

          <div className="hidden lg:block">
            <div className="kicker mb-2.5">研究方向分布</div>
            <div className="space-y-1">
              {focusCounts.map((item) => (
                <Link
                  key={item.key}
                  href={buildQuery({ focus: item.key, page: 1 })}
                  className={cx(
                    "flex items-center justify-between rounded-lg px-2.5 py-1.5 text-[11.5px] transition",
                    focus === item.key ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2",
                  )}
                >
                  <span>{item.label}</span>
                  <span className="num text-faint">{item.count}</span>
                </Link>
              ))}
            </div>
          </div>

          {journals.length ? (
            <div className="hidden lg:block">
              <div className="kicker mb-2.5">高频期刊</div>
              <div className="space-y-0.5">
                {journals.map((item) => (
                  <Link
                    key={item.journal}
                    href={buildQuery({ journal: item.journal, page: 1 })}
                    className={cx(
                      "flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11.5px] transition",
                      journal === item.journal ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2",
                    )}
                  >
                    <span className="truncate">{item.journal}</span>
                    <span className="num shrink-0 text-faint">{item.count}</span>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[12px] text-muted">
                共 <span className="num font-semibold text-ink">{result.total}</span> 篇已核验论文
              </span>
              {activeChips.map((chip) => (
                <Link
                  key={chip.label}
                  href={chip.remove}
                  className="inline-flex items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-2.5 py-0.5 text-[10.5px] text-accent-ink hover:border-accent/50"
                >
                  {chip.label} <X size={9} />
                </Link>
              ))}
            </div>
            <span className="text-[11px] text-faint">
              {sort === "score" ? "按综合评分" : sort === "date" ? "按发表时间" : sort === "citations" ? "按引用" : "按入库时间"}
            </span>
          </div>

          {result.papers.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {result.papers.map((paper) => (
                <PaperCard key={paper.id} paper={paper} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Library size={20} />}
              title="没有符合条件的论文"
              description={
                result.total === 0 && !activeChips.length
                  ? "文献库尚未收录论文。运行一次检索后，通过核验的论文会进入这里。"
                  : "尝试放宽筛选条件或清除部分关键词。"
              }
              action={
                activeChips.length ? (
                  <Link href="/papers" className="text-[12px] font-medium text-accent hover:text-accent-strong">
                    清除全部筛选
                  </Link>
                ) : null
              }
            />
          )}

          {totalPages > 1 ? (
            <nav className="mt-8 flex items-center justify-between gap-3" aria-label="分页">
              <PagerLink href={buildQuery({ page: Math.max(1, page - 1) })} disabled={page <= 1}>
                <ArrowLeft size={13} /> 上一页
              </PagerLink>
              <div className="flex items-center gap-1">
                {pageWindow[0] > 1 ? (
                  <>
                    <PageNumber href={buildQuery({ page: 1 })} active={false}>
                      1
                    </PageNumber>
                    {pageWindow[0] > 2 ? <span className="px-1 text-faint">…</span> : null}
                  </>
                ) : null}
                {pageWindow.map((number) => (
                  <PageNumber key={number} href={buildQuery({ page: number })} active={number === page}>
                    {number}
                  </PageNumber>
                ))}
                {pageWindow[pageWindow.length - 1] < totalPages ? (
                  <>
                    {pageWindow[pageWindow.length - 1] < totalPages - 1 ? <span className="px-1 text-faint">…</span> : null}
                    <PageNumber href={buildQuery({ page: totalPages })} active={false}>
                      {totalPages}
                    </PageNumber>
                  </>
                ) : null}
              </div>
              <PagerLink href={buildQuery({ page: Math.min(totalPages, page + 1) })} disabled={page >= totalPages}>
                下一页 <ArrowRight size={13} />
              </PagerLink>
            </nav>
          ) : null}

          <div className="mt-10 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[11px] leading-6 text-muted">
            <span className="font-medium text-ink-2">关于评分：</span>
            综合评分为规则化的可解释评分（学术可靠性 20、创新性 15、研究严谨性 15、领域影响 15、科学价值 15、领域相关性 15、信息完整性 5），
            引用次数只作为影响维度的辅助信号，不单独决定推荐。
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10.5px] font-medium tracking-wide text-faint">{label}</span>
      {children}
    </label>
  );
}

function PagerLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <span className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-3 text-[11px] text-faint opacity-50">
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[11px] text-ink-2 hover:border-line-strong">
      {children}
    </Link>
  );
}

function PageNumber({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-[11px] transition",
        active ? "bg-accent text-white" : "text-ink-2 hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}
