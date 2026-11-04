import type { Metadata } from "next";
import { Kicker } from "@/components/ui";
import { TimelineView } from "@/components/timeline-view";
import { getTimelineEvents, getTimelineYears } from "@/server/db/repo/knowledge";

export const metadata: Metadata = { title: "技术时间线" };
export const dynamic = "force-dynamic";

export default function TimelinePage() {
  const events = getTimelineEvents({ limit: 400 });
  const years = getTimelineYears();

  return (
    <div className="container-page pb-16 pt-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker className="mb-2">Milestones with evidence</Kicker>
          <h1 className="display text-3xl font-semibold text-ink md:text-4xl">碱基编辑技术发展时间线</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted">
            记录 CBE/ABE 的起源、关键迭代、安全性发现、递送进展与疾病应用。
            每条事件都区分「论文发表日期」「首次报告」与「后续验证」，不会把发表日期直接当作技术发明日期。
          </p>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-2.5 text-[11px]">
          <div>
            <div className="num text-lg font-semibold text-ink">{events.length}</div>
            <div className="text-[9.5px] text-faint">事件</div>
          </div>
          <div className="h-8 w-px bg-line" />
          <div>
            <div className="num text-lg font-semibold text-ink">{years.length}</div>
            <div className="text-[9.5px] text-faint">年份跨度</div>
          </div>
        </div>
      </header>

      <TimelineView events={events} />

      <div className="mt-8 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[11px] leading-6 text-muted">
        <span className="font-medium text-ink-2">为什么有些事件显示“发表日期”：</span>
        只有当论文明确声称首次提出/首次实现，且证据能在原文中逐字匹配时，系统才标记为「首次报告」；
        否则只记录可核实的发表日期，避免把发表时间误当成技术发明时间。
      </div>
    </div>
  );
}
