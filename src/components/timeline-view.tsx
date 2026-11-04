"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarRange, Milestone, Search } from "lucide-react";
import type { TimelineEvent } from "@/lib/types";
import { TIMELINE_CATEGORY_LABEL } from "@/lib/constants";
import { Badge, EmptyState, cx } from "./ui";
import { ActionButton } from "./action-button";

const DATE_KIND_LABEL: Record<TimelineEvent["dateKind"], { label: string; variant: "success" | "warn" | "outline" }> = {
  publication: { label: "发表日期", variant: "outline" },
  first_report: { label: "首次报告", variant: "success" },
  validation: { label: "后续验证", variant: "warn" },
};

export function TimelineView({ events }: { events: TimelineEvent[] }) {
  const [year, setYear] = useState(0);
  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");

  const years = useMemo(
    () => [...new Set(events.map((event) => event.eventDate.slice(0, 4)))].sort((a, b) => Number(b) - Number(a)),
    [events],
  );
  const categories = useMemo(() => [...new Set(events.map((event) => event.category))], [events]);

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    return events
      .filter((event) => (year ? Number(event.eventDate.slice(0, 4)) === year : true))
      .filter((event) => (category ? event.category === category : true))
      .filter((event) =>
        value
          ? `${event.title} ${event.titleZh ?? ""} ${event.description ?? ""}`.toLowerCase().includes(value)
          : true,
      )
      .sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  }, [events, year, category, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const event of filtered) {
      const key = event.eventDate.slice(0, 4);
      const list = map.get(key) ?? [];
      list.push(event);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [filtered]);

  if (!events.length) {
    return (
      <EmptyState
        icon={<Milestone size={20} />}
        title="时间线尚未建立"
        description="技术时间线只收录有原文证据的里程碑事件，并严格区分论文发表日期、首次报告时间与后续验证时间。先运行流水线完成论文入库与知识抽取。"
        action={
          <ActionButton
            endpoint="/api/jobs"
            body={{ type: "daily_pipeline", payload: {} }}
            label="运行每日流水线"
            variant="primary"
            redirectTo="/agent?job={jobId}"
          />
        }
      />
    );
  }

  return (
    <div>
      <div className="card mb-6 flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-[180px] flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索技术事件"
            className="h-9 w-full rounded-full border border-line bg-bg pl-8 pr-3 text-[12px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
          />
        </div>
        <select
          value={year}
          onChange={(event) => setYear(Number(event.target.value))}
          className="h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] text-ink-2 focus:outline-none"
        >
          <option value={0}>全部年份</option>
          {years.map((item) => (
            <option key={item} value={item}>
              {item} 年
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          className="h-9 rounded-full border border-line bg-surface px-3 text-[11.5px] text-ink-2 focus:outline-none"
        >
          <option value="">全部方向</option>
          {categories.map((item) => (
            <option key={item} value={item}>
              {TIMELINE_CATEGORY_LABEL[item] ?? item}
            </option>
          ))}
        </select>
        <span className="text-[10.5px] text-faint">{filtered.length} 个事件</span>
      </div>

      {grouped.length ? (
        <div className="relative">
          <div className="absolute bottom-0 left-[52px] top-0 hidden w-px bg-line md:block" aria-hidden />
          <div className="space-y-10">
            {grouped.map(([groupYear, groupEvents]) => (
              <section key={groupYear} className="relative md:pl-[100px]">
                <div className="mb-4 flex items-center gap-3 md:absolute md:left-0 md:top-0 md:block md:w-[70px]">
                  <div className="display text-3xl font-semibold tracking-tight text-ink md:text-[2rem]">{groupYear}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-faint md:mt-1">
                    {groupEvents.length} events
                  </div>
                </div>
                <div className="space-y-3">
                  {groupEvents.map((event) => (
                    <article key={event.id} className="card relative p-5">
                      <span
                        className={cx(
                          "absolute -left-[52px] top-6 hidden h-3 w-3 rounded-full border-2 border-bg md:block",
                          event.dateKind === "first_report"
                            ? "bg-accent"
                            : event.dateKind === "validation"
                              ? "bg-gold"
                              : "bg-line-strong",
                        )}
                        aria-hidden
                      />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="num rounded bg-surface-2 px-1.5 py-0.5 text-[10px] text-ink-2">{event.eventDate}</span>
                        <Badge variant={DATE_KIND_LABEL[event.dateKind].variant}>
                          {DATE_KIND_LABEL[event.dateKind].label}
                        </Badge>
                        <Badge variant="outline">{TIMELINE_CATEGORY_LABEL[event.category] ?? event.category}</Badge>
                        <span className="ml-auto flex items-center gap-0.5" title={`重要度 ${event.significance}/5`}>
                          {Array.from({ length: 5 }).map((_, index) => (
                            <span
                              key={index}
                              className={cx(
                                "h-1 w-1 rounded-full",
                                index < event.significance ? "bg-accent" : "bg-line",
                              )}
                            />
                          ))}
                        </span>
                      </div>
                      <Link href={`/papers/${event.paperId}`} className="group mt-2.5 block">
                        <h3 className="display text-[16px] font-semibold leading-6 text-ink group-hover:text-accent-strong">
                          {event.titleZh || event.title}
                        </h3>
                        {event.titleZh && event.title !== event.titleZh ? (
                          <p className="mt-1 text-[11.5px] leading-6 text-muted">{event.title}</p>
                        ) : null}
                      </Link>
                      {event.description ? (
                        <p className="mt-2 text-[12.5px] leading-7 text-ink-2">{event.description}</p>
                      ) : null}
                      {event.evidenceText ? (
                        <details className="mt-2.5 rounded-lg border border-line bg-bg-elevated px-3 py-2">
                          <summary className="cursor-pointer text-[10px] font-medium text-muted">原文证据</summary>
                          <p className="mt-1.5 font-serif text-[11px] italic leading-6 text-ink-2">“{event.evidenceText}”</p>
                        </details>
                      ) : null}
                      <div className="mt-3 flex items-center justify-between border-t border-line/70 pt-2.5 text-[10.5px]">
                        <span className="truncate text-faint">来源：{event.paperTitle}</span>
                        <Link
                          href={`/papers/${event.paperId}`}
                          className="ml-3 inline-flex shrink-0 items-center gap-1 text-accent hover:text-accent-strong"
                        >
                          查看论文 <ArrowUpRight size={11} />
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<CalendarRange size={20} />}
          title="没有符合筛选条件的事件"
          description="尝试清除年份或方向筛选。"
          action={
            <button
              type="button"
              onClick={() => {
                setYear(0);
                setCategory("");
                setQuery("");
              }}
              className="text-[12px] font-medium text-accent"
            >
              重置筛选
            </button>
          }
        />
      )}
    </div>
  );
}
