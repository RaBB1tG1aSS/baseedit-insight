"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ExternalLink,
  Filter,
  Maximize2,
  Network,
  RotateCcw,
  Search,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  EntityType,
  EvidenceNature,
  KnowledgeEntity,
  KnowledgeRelation,
} from "@/lib/types";
import type { EntityPaperLink } from "@/server/db/repo/knowledge";
import { ENTITY_TYPE_LABEL, RELATION_LABELS } from "@/lib/constants";
import { Badge, EmptyState, EvidenceNatureBadge, TextLink, cx } from "./ui";
import { ActionButton } from "./action-button";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false }) as unknown as React.ComponentType<
  Record<string, unknown>
>;

const TYPE_COLORS: Record<EntityType, string> = {
  editor: "#0f766e",
  editor_generation: "#14b8a6",
  editing_window: "#0891b2",
  efficiency: "#4f46e5",
  specificity: "#7c3aed",
  off_target: "#c2543f",
  delivery: "#b7791f",
  in_vivo: "#d97706",
  disease: "#93251c",
  application: "#6b7f2e",
  research_team: "#64748b",
  researcher: "#94a3b8",
  technology: "#2563eb",
  research_direction: "#0d9488",
  concept: "#5b6b67",
};

const TYPE_GROUPS: { key: string; label: string; types: EntityType[] }[] = [
  { key: "editors", label: "编辑器", types: ["editor", "editor_generation", "editing_window", "efficiency", "specificity"] },
  { key: "safety", label: "安全性", types: ["off_target"] },
  { key: "delivery", label: "递送与体内", types: ["delivery", "in_vivo"] },
  { key: "disease", label: "疾病与应用", types: ["disease", "application"] },
  { key: "field", label: "领域与团队", types: ["technology", "research_direction", "research_team", "researcher", "concept"] },
];

interface GNode {
  id: string;
  kind: "entity" | "paper";
  label: string;
  sublabel?: string;
  color: string;
  val: number;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  entityId?: string;
  paperId?: string;
  entityType?: EntityType;
  nameZh?: string | null;
  description?: string | null;
  paperCount?: number;
  firstYear?: number | null;
  qualityScore?: number | null;
  year?: number | null;
  visible?: boolean;
}

interface GLink {
  id: string;
  source: string;
  target: string;
  kind: "relation" | "mentions";
  color: string;
  relationType?: string;
  nature?: EvidenceNature;
  paperId?: string;
  paperTitle?: string;
  evidence?: string;
  location?: string;
  confidence?: number;
}

const NATURE_COLORS: Record<EvidenceNature, string> = {
  reported_fact: "rgba(15, 118, 110, 0.55)",
  author_interpretation: "rgba(37, 99, 235, 0.45)",
  ai_synthesis: "rgba(183, 121, 31, 0.5)",
  hypothesis: "rgba(180, 83, 9, 0.45)",
};

export function KnowledgeGraph({
  entities,
  relations,
  paperLinks,
}: {
  entities: KnowledgeEntity[];
  relations: KnowledgeRelation[];
  paperLinks: EntityPaperLink[];
}) {
  const [activeTypes, setActiveTypes] = useState<Set<EntityType>>(
    () => new Set(entities.map((entity) => entity.type)),
  );
  const [showPapers, setShowPapers] = useState(true);
  const [sinceYear, setSinceYear] = useState(0);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<GNode | null>(null);
  const [hovered, setHovered] = useState<GNode | null>(null);
  const [size, setSize] = useState({ width: 900, height: 620 });
  const containerRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<{
    zoomToFit?: (duration?: number, padding?: number) => void;
    zoom?: (value: number, duration?: number) => void;
    centerAt?: (x?: number, y?: number, duration?: number) => void;
  } | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setSize({ width: Math.max(320, rect.width), height: window.innerWidth < 768 ? 480 : 620 });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const years = useMemo(() => {
    const values = new Set<number>();
    for (const entity of entities) if (entity.firstYear) values.add(entity.firstYear);
    for (const link of paperLinks) if (link.publicationDate) values.add(Number(link.publicationDate.slice(0, 4)));
    return [...values].filter((value) => Number.isFinite(value)).sort((a, b) => b - a);
  }, [entities, paperLinks]);

  const visibleEntityIds = useMemo(() => {
    const ids = new Set<string>();
    for (const entity of entities) if (activeTypes.has(entity.type)) ids.add(entity.id);
    return ids;
  }, [entities, activeTypes]);

  const paperMeta = useMemo(() => {
    const map = new Map<string, EntityPaperLink>();
    for (const link of paperLinks) map.set(link.paperId, link);
    return map;
  }, [paperLinks]);

  const { graphData, nodeMap } = useMemo(() => {
    const nodes: GNode[] = [];
    const nodeMap = new Map<string, GNode>();
    const links: GLink[] = [];

    for (const entity of entities) {
      if (!visibleEntityIds.has(entity.id)) continue;
      const node: GNode = {
        id: `e:${entity.id}`,
        kind: "entity",
        label: entity.name,
        sublabel: entity.nameZh ?? undefined,
        color: TYPE_COLORS[entity.type] ?? TYPE_COLORS.concept,
        val: 5 + Math.min(10, Math.sqrt(Math.max(1, entity.paperCount)) * 2.6),
        entityId: entity.id,
        entityType: entity.type,
        nameZh: entity.nameZh,
        description: entity.description,
        paperCount: entity.paperCount,
        firstYear: entity.firstYear,
      };
      nodes.push(node);
      nodeMap.set(node.id, node);
    }

    const paperNodeIds = new Set<string>();
    if (showPapers) {
      for (const link of paperLinks) {
        if (!visibleEntityIds.has(link.entityId)) continue;
        const year = link.publicationDate ? Number(link.publicationDate.slice(0, 4)) : null;
        if (sinceYear && year && year < sinceYear) continue;
        const id = `p:${link.paperId}`;
        if (!paperNodeIds.has(id)) {
          const node: GNode = {
            id,
            kind: "paper",
            label: link.titleZh || link.title,
            color: "#94a3b8",
            val: 1.4,
            paperId: link.paperId,
            year,
            qualityScore: link.qualityScore,
          };
          nodes.push(node);
          nodeMap.set(id, node);
          paperNodeIds.add(id);
        }
        links.push({
          id: `m:${link.entityId}:${link.paperId}`,
          source: `e:${link.entityId}`,
          target: id,
          kind: "mentions",
          color: "rgba(148, 163, 184, 0.2)",
          paperId: link.paperId,
        });
      }
    }

    for (const relation of relations) {
      if (!visibleEntityIds.has(relation.sourceId) || !visibleEntityIds.has(relation.targetId)) continue;
      const year = relation.paperId ? Number((paperMeta.get(relation.paperId)?.publicationDate ?? "").slice(0, 4)) : null;
      if (sinceYear && year && Number.isFinite(year) && year < sinceYear) continue;
      links.push({
        id: relation.id,
        source: `e:${relation.sourceId}`,
        target: `e:${relation.targetId}`,
        kind: "relation",
        color: NATURE_COLORS[relation.nature] ?? NATURE_COLORS.reported_fact,
        relationType: relation.relationType,
        nature: relation.nature,
        paperId: relation.paperId,
        paperTitle: relation.paperTitle,
        evidence: relation.evidenceText,
        location: relation.evidenceLocation,
        confidence: relation.confidence,
      });
    }

    return { graphData: { nodes, links }, nodeMap };
  }, [entities, relations, paperLinks, activeTypes, visibleEntityIds, showPapers, sinceYear, paperMeta]);

  const queryMatches = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return null;
    const set = new Set<string>();
    for (const node of graphData.nodes) {
      if (`${node.label} ${node.nameZh ?? ""}`.toLowerCase().includes(value)) set.add(node.id);
    }
    return set;
  }, [query, graphData.nodes]);

  const toggleGroup = (group: { types: EntityType[] }, enabled: boolean) => {
    setActiveTypes((current) => {
      const next = new Set(current);
      for (const type of group.types) {
        if (enabled) next.add(type);
        else next.delete(type);
      }
      return next;
    });
  };

  const reset = () => {
    setActiveTypes(new Set(entities.map((entity) => entity.type)));
    setShowPapers(true);
    setSinceYear(0);
    setQuery("");
    setSelected(null);
    graphRef.current?.zoomToFit?.(500, 70);
  };

  const selectedEntity = selected?.kind === "entity" ? entities.find((entity) => entity.id === selected.entityId) : null;
  const selectedEntityRelations = selectedEntity
    ? relations.filter((relation) => relation.sourceId === selectedEntity.id || relation.targetId === selectedEntity.id)
    : [];
  const selectedEntityPapers = selectedEntity
    ? paperLinks
        .filter((link) => link.entityId === selectedEntity.id)
        .sort((a, b) => (b.publicationDate ?? "").localeCompare(a.publicationDate ?? ""))
        .slice(0, 8)
    : [];

  const totalPapers = new Set(paperLinks.map((link) => link.paperId)).size;

  if (!entities.length) {
    return (
      <EmptyState
        icon={<Network size={20} />}
        title="知识图谱尚未建立"
        description="知识实体与关系只从已核验论文中抽取，并且每条关系必须有原文证据。先运行每日流水线，或手动触发知识图谱更新。"
        action={
          <ActionButton
            endpoint="/api/jobs"
            body={{ type: "knowledge_update", payload: {} }}
            label="更新知识图谱"
            variant="primary"
            redirectTo="/agent?job={jobId}"
          />
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[180px] flex-1">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索实体名称（如 ABE8e、TadA、LNP）"
              className="h-9 w-full rounded-full border border-line bg-bg pl-8 pr-3 text-[12px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted">
            <Filter size={12} />
            <select
              value={sinceYear}
              onChange={(event) => setSinceYear(Number(event.target.value))}
              className="h-8 rounded-full border border-line bg-surface px-2.5 text-[11px] text-ink-2 focus:outline-none"
            >
              <option value={0}>全部年份</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year} 年起
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
            <input
              type="checkbox"
              checked={showPapers}
              onChange={(event) => setShowPapers(event.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--accent)]"
            />
            显示论文节点
          </label>
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-8 items-center gap-1 rounded-full border border-line px-2.5 text-[11px] text-muted hover:text-ink"
          >
            <RotateCcw size={11} /> 重置
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {TYPE_GROUPS.map((group) => {
            const enabled = group.types.some((type) => activeTypes.has(type));
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => toggleGroup(group, !enabled)}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] transition",
                  enabled
                    ? "border-accent/25 bg-accent-soft text-accent-ink"
                    : "border-line bg-surface text-faint hover:text-ink-2",
                )}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: enabled ? TYPE_COLORS[group.types[0]] : "var(--line-strong)" }}
                />
                {group.label}
              </button>
            );
          })}
          <span className="ml-auto text-[10px] text-faint">
            {graphData.nodes.filter((node) => node.kind === "entity").length} 个实体 ·{" "}
            {graphData.links.filter((link) => link.kind === "relation").length} 条关系 ·{" "}
            {graphData.nodes.filter((node) => node.kind === "paper").length} 篇论文
          </span>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <div className="card relative overflow-hidden" ref={containerRef}>
          <div className="absolute left-3 top-3 z-10 flex flex-col gap-1">
            <GraphControl label="放大" onClick={() => graphRef.current?.zoom?.(1.3, 300)} icon={<ZoomIn size={13} />} />
            <GraphControl label="缩小" onClick={() => graphRef.current?.zoom?.(0.77, 300)} icon={<ZoomOut size={13} />} />
            <GraphControl label="适应视图" onClick={() => graphRef.current?.zoomToFit?.(500, 60)} icon={<Maximize2 size={13} />} />
          </div>
          <div className="absolute bottom-3 left-3 z-10 rounded-full bg-surface/90 px-3 py-1 text-[9.5px] text-faint shadow-sm backdrop-blur">
            拖拽节点 · 滚轮缩放 · 点击查看证据
          </div>
          <ForceGraph2D
            ref={graphRef}
            graphData={graphData}
            width={size.width}
            height={size.height}
            backgroundColor="transparent"
            cooldownTicks={140}
            d3AlphaDecay={0.03}
            nodeRelSize={1}
            nodeVal={(node: GNode) => node.val}
            onNodeClick={(node: GNode) => setSelected(node)}
            onNodeHover={(node: GNode | null) => setHovered(node)}
            linkColor={(link: GLink) => link.color}
            linkWidth={(link: GLink) => (link.kind === "relation" ? 1.1 : 0.5)}
            linkDirectionalArrowLength={(link: GLink) => (link.kind === "relation" ? 2.6 : 0)}
            linkDirectionalArrowRelPos={0.86}
            linkLabel={(link: GLink) =>
              link.kind === "relation" ? `${link.source} → ${link.target} · ${RELATION_LABELS[link.relationType ?? ""] ?? link.relationType}` : ""
            }
            nodeCanvasObject={(node: GNode, ctx: CanvasRenderingContext2D, scale: number) => {
              if (node.x == null || node.y == null) return;
              const matched = !queryMatches || queryMatches.has(node.id);
              const isSelected = selected?.id === node.id;
              const isHovered = hovered?.id === node.id;
              const radius = node.kind === "paper" ? 2.2 : node.val;
              ctx.save();
              ctx.globalAlpha = matched ? 1 : 0.16;

              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
              ctx.fillStyle = node.kind === "paper" ? "rgba(148,163,184,0.8)" : node.color;
              ctx.fill();
              if (isSelected || isHovered) {
                ctx.lineWidth = 2 / scale;
                ctx.strokeStyle = "rgba(15, 118, 110, 0.8)";
                ctx.stroke();
              }

              const shouldLabel =
                node.kind === "entity" &&
                (isSelected || isHovered || scale > 1.2 || (node.paperCount ?? 0) >= 3 || Boolean(queryMatches?.has(node.id)));

              if (shouldLabel) {
                const fontSize = Math.max(9, 10.5 / scale);
                ctx.font = `500 ${fontSize}px "Inter", "PingFang SC", "Microsoft YaHei", sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "top";
                const label = node.label.length > 30 ? `${node.label.slice(0, 29)}…` : node.label;
                const textWidth = ctx.measureText(label).width;
                ctx.globalAlpha = matched ? 0.92 : 0.12;
                ctx.fillStyle = "rgba(255,255,255,0.82)";
                const padX = 2 / scale;
                ctx.fillRect(node.x - textWidth / 2 - padX, node.y + radius + 3 / scale, textWidth + padX * 2, fontSize + 2 / scale);
                ctx.fillStyle = "#334a46";
                ctx.fillText(label, node.x, node.y + radius + 4 / scale);
              }
              ctx.restore();
            }}
            nodePointerAreaPaint={(node: GNode, color: string, ctx: CanvasRenderingContext2D) => {
              if (node.x == null || node.y == null) return;
              const radius = (node.kind === "paper" ? 2.2 : node.val) + 3;
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
              ctx.fill();
            }}
          />
        </div>

        <aside className="space-y-3">
          {selected ? (
            <div className="card p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[9.5px] font-semibold uppercase tracking-[0.14em] text-faint">
                    {selected.kind === "entity" ? ENTITY_TYPE_LABEL[selected.entityType ?? "concept"] : "论文节点"}
                  </div>
                  <h3 className="display mt-1 text-lg font-semibold leading-7 text-ink">{selected.label}</h3>
                  {selected.nameZh && selected.kind === "entity" ? (
                    <p className="text-[12px] text-muted">{selected.nameZh}</p>
                  ) : null}
                </div>
                <button type="button" onClick={() => setSelected(null)} className="text-[10px] text-faint hover:text-ink">
                  关闭
                </button>
              </div>

              {selected.kind === "paper" ? (
                <div className="mt-3 space-y-2 text-[11.5px] text-muted">
                  <p>发表年份：{selected.year ?? "未知"}</p>
                  {selected.qualityScore != null ? <p>综合评分：{Math.round(selected.qualityScore)}/100</p> : null}
                  <Link
                    href={`/papers/${selected.paperId}`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:text-accent-strong"
                  >
                    打开论文精讲 <ExternalLink size={11} />
                  </Link>
                </div>
              ) : (
                <>
                  {selected.description ? (
                    <p className="mt-2 text-[11.5px] leading-6 text-ink-2">{selected.description}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge variant="outline">关联 {selected.paperCount ?? 0} 篇论文</Badge>
                    {selected.firstYear ? <Badge variant="outline">起始 {selected.firstYear}</Badge> : null}
                  </div>

                  {selectedEntityRelations.length ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                        有证据支持的关系
                      </div>
                      <div className="space-y-1.5">
                        {selectedEntityRelations.slice(0, 6).map((relation) => (
                          <div key={relation.id} className="rounded-lg border border-line bg-bg-elevated px-2.5 py-2">
                            <div className="text-[10.5px] leading-5 text-ink-2">
                              {relation.sourceName}
                              <span className="mx-1 text-[9.5px] text-accent">
                                {RELATION_LABELS[relation.relationType] ?? relation.relationType}
                              </span>
                              {relation.targetName}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                              <EvidenceNatureBadge nature={relation.nature} />
                              {relation.evidenceLocation ? (
                                <span className="text-[9px] text-faint">{relation.evidenceLocation}</span>
                              ) : null}
                            </div>
                            <p className="mt-1 line-clamp-2 font-serif text-[10px] italic leading-4 text-muted">
                              “{relation.evidenceText}”
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedEntityPapers.length ? (
                    <div className="mt-3">
                      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
                        相关论文
                      </div>
                      <div className="space-y-1">
                        {selectedEntityPapers.map((link) => (
                          <Link
                            key={`${link.entityId}-${link.paperId}`}
                            href={`/papers/${link.paperId}`}
                            className="block text-[10.5px] leading-5 text-ink-2 hover:text-accent"
                          >
                            <span className="line-clamp-2">{link.titleZh || link.title}</span>
                            <span className="text-[9px] text-faint">{link.publicationDate ?? "日期未知"}</span>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div className="card p-4">
              <div className="flex items-center gap-2">
                <Network size={14} className="text-accent" />
                <h3 className="text-[13px] font-semibold text-ink">如何阅读这张图</h3>
              </div>
              <ul className="mt-2 space-y-2 text-[11px] leading-6 text-muted">
                <li>圆形节点是知识实体，颜色代表类型；灰色小点是已核验论文。</li>
                <li>实体之间的连线必须有原文证据，颜色表示证据性质。</li>
                <li>实体与论文之间的连线表示“论文提及该实体”，不等同于技术继承关系。</li>
                <li>点击任意节点查看说明、证据与相关论文。</li>
              </ul>
              <div className="mt-3 border-t border-line pt-3">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">证据颜色</div>
                <div className="space-y-1 text-[10.5px] text-muted">
                  {(
                    [
                      ["reported_fact", "论文事实"],
                      ["author_interpretation", "作者解释"],
                      ["ai_synthesis", "AI 综合"],
                      ["hypothesis", "推测"],
                    ] as [EvidenceNature, string][]
                  ).map(([nature, label]) => (
                    <div key={nature} className="flex items-center gap-2">
                      <span className="h-[2px] w-5" style={{ background: NATURE_COLORS[nature] }} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card p-4">
            <div className="kicker mb-2">图谱统计</div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-surface-2 px-3 py-2">
                <div className="num text-lg font-semibold text-ink">{entities.length}</div>
                <div className="text-[10px] text-faint">知识实体</div>
              </div>
              <div className="rounded-lg bg-surface-2 px-3 py-2">
                <div className="num text-lg font-semibold text-ink">{relations.length}</div>
                <div className="text-[10px] text-faint">有证据关系</div>
              </div>
              <div className="rounded-lg bg-surface-2 px-3 py-2">
                <div className="num text-lg font-semibold text-ink">{totalPapers}</div>
                <div className="text-[10px] text-faint">关联论文</div>
              </div>
              <div className="rounded-lg bg-surface-2 px-3 py-2">
                <div className="num text-lg font-semibold text-ink">{paperLinks.length}</div>
                <div className="text-[10px] text-faint">提及链接</div>
              </div>
            </div>
            <p className="mt-2 text-[10px] leading-5 text-faint">
              图谱只使用 accepted 论文；关系与实体都可以追溯到 paper_id。
            </p>
            <div className="mt-2">
              <TextLink href="/timeline">查看技术发展时间线</TextLink>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function GraphControl({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg border border-line bg-surface/90 text-muted shadow-sm backdrop-blur transition hover:text-ink"
    >
      {icon}
    </button>
  );
}
