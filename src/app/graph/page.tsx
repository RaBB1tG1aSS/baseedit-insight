import type { Metadata } from "next";
import { Network } from "lucide-react";
import { getEntityPaperLinks, getGraph } from "@/server/db/repo/knowledge";
import { KnowledgeGraph } from "@/components/knowledge-graph";
import { Kicker } from "@/components/ui";

export const metadata: Metadata = { title: "知识图谱" };
export const dynamic = "force-dynamic";

type Params = Promise<{ entity?: string }>;

export default async function GraphPage({ searchParams }: { searchParams: Params }) {
  const { entity } = await searchParams;
  const { entities, relations } = getGraph(220);
  const paperLinks = getEntityPaperLinks(1500);

  return (
    <div className="container-page pb-16 pt-10">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker className="mb-2">Evidence-bound knowledge graph</Kicker>
          <h1 className="display text-3xl font-semibold text-ink md:text-4xl">碱基编辑知识图谱</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted">
            节点来自已核验论文，关系必须附带原文证据。系统区分论文事实、作者解释、AI 综合判断与推测；
            不会因为研究方向相似就推断技术继承关系。
          </p>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] text-muted md:flex">
          <Network size={13} className="text-accent" />
          {entities.length} 个实体 · {relations.length} 条证据关系
        </div>
      </header>

      <KnowledgeGraph entities={entities} relations={relations} paperLinks={paperLinks} initialEntityId={entity} />

      <div className="mt-6 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[11px] leading-6 text-muted">
        <span className="font-medium text-ink-2">更新机制：</span>
        每日流水线在论文正式入库后自动抽取实体、关系与时间线事件；关系证据必须能在提供的摘要/精讲材料中逐字匹配，否则会被丢弃并记录在 Agent 日志中。
        你也可以在 Agent 页面手动触发「更新知识图谱」。
      </div>
    </div>
  );
}
