import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft, Download, GitCompare, Trash2 } from "lucide-react";
import type { DeepReadContent, Paper } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { getAcceptedPaperById } from "@/server/db/repo/papers";
import { getFigures, getFullText, getLatestAnalysis, getQualityAssessment } from "@/server/db/repo/analysis";
import { PrintButton } from "@/components/print-button";
import { Badge, EmptyState, InlineNotice, Kicker, ScoreRing, TextLink, cx } from "@/components/ui";

export const metadata: Metadata = { title: "论文对比" };
export const dynamic = "force-dynamic";

type Params = Promise<{ ids?: string | string[] }>;

interface Column {
  paper: Paper;
  content: DeepReadContent | null;
  level: "full_text" | "abstract_only" | null;
  score: number | null;
  figures: number;
  fullTextChars: number;
}

export default async function ComparePage({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  const idsParam = Array.isArray(raw.ids) ? raw.ids[0] : raw.ids;
  const ids = (idsParam ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 3);

  const columns: Column[] = ids
    .map((id) => {
      const paper = getAcceptedPaperById(id);
      if (!paper) return null;
      const analysis = getLatestAnalysis(id, "deep_read");
      return {
        paper,
        content: (analysis?.content ?? null) as DeepReadContent | null,
        level: analysis?.analysisLevel ?? null,
        score: getQualityAssessment(id)?.total ?? paper.qualityScore,
        figures: getFigures(id).length,
        fullTextChars: getFullText(id)?.charCount ?? 0,
      };
    })
    .filter((value): value is Column => Boolean(value));

  if (columns.length < 2) {
    return (
      <div className="container-page pb-16 pt-10">
        <Kicker className="mb-2">Side-by-side</Kicker>
        <h1 className="display text-3xl font-semibold text-ink">论文对比</h1>
        <div className="mt-6">
          <EmptyState
            icon={<GitCompare size={20} />}
            title="请先选择 2–3 篇论文"
            description="在文献库的论文卡片上点击「对比」，选好后通过底部浮层进入对比。也可以直接访问 /compare?ids=论文ID1,论文ID2。"
            action={
              <Link
                href="/papers"
                className="inline-flex h-9 items-center rounded-full bg-accent px-4 text-[12.5px] font-medium text-white hover:bg-accent-strong"
              >
                去文献库选择
              </Link>
            }
          />
        </div>
        {columns.length === 1 ? (
          <p className="mt-3 text-center text-[11px] text-faint">
            当前只选择了 1 篇：{columns[0].paper.titleZh || columns[0].paper.title}
          </p>
        ) : null}
      </div>
    );
  }

  const missingAnalysis = columns.filter((column) => !column.content).length;

  return (
    <div className="container-page pb-20 pt-8">
      <div className="no-print mb-5 flex items-center gap-1.5 text-[11px] text-faint">
        <Link href="/papers" className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft size={12} /> 文献库
        </Link>
      </div>

      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
        <div>
          <Kicker className="mb-2">Side-by-side comparison</Kicker>
          <h1 className="display text-3xl font-semibold text-ink">论文对比</h1>
          <p className="mt-2 max-w-2xl text-[12.5px] leading-6 text-muted">
            基于中央数据库中同一套已核验信息与 AI 精讲，对照研究问题、结果、创新、局限与证据；不生成新的、无来源支撑的结论。
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link
            href={`/api/export/bibtex?ids=${columns.map((column) => column.paper.id).join(",")}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <Download size={12} /> 导出 BibTeX
          </Link>
          <PrintButton />
        </div>
      </header>

      {missingAnalysis ? (
        <div className="mt-4">
          <InlineNotice tone="muted" title={`${missingAnalysis} 篇论文尚未生成精讲`}>
            对比表会显示其元数据与质量评分；空白分析字段不会用推测填充。可在论文页手动生成精讲后再对比。
          </InlineNotice>
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-xl border border-line bg-line">
        <div
          className="grid min-w-[860px] gap-px"
          style={{ gridTemplateColumns: `150px repeat(${columns.length}, minmax(250px, 1fr))` }}
        >
          <div className="bg-surface-2 px-4 py-4 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">
            对比维度
          </div>
          {columns.map((column) => (
            <div key={column.paper.id} className="bg-surface px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/papers/${column.paper.id}`} className="line-clamp-3 text-[13px] font-semibold leading-6 text-ink hover:text-accent-strong">
                  {column.paper.titleZh || column.paper.title}
                </Link>
                <Link
                  href={`/compare?ids=${columns
                    .filter((item) => item.paper.id !== column.paper.id)
                    .map((item) => item.paper.id)
                    .join(",")}`}
                  aria-label="从对比中移除"
                  className="no-print mt-0.5 shrink-0 text-faint hover:text-danger"
                >
                  <Trash2 size={12} />
                </Link>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1">
                <Badge variant="outline">{column.paper.journal ?? "未知期刊"}</Badge>
                <Badge variant="outline">{formatDate(column.paper.publicationDate)}</Badge>
                {column.level ? (
                  <Badge variant={column.level === "full_text" ? "success" : "warn"}>
                    {column.level === "full_text" ? "全文级" : "摘要级"}
                  </Badge>
                ) : null}
              </div>
              <div className="mt-2 flex items-center gap-3">
                <ScoreRing score={column.score} size={52} stroke={5} label="" />
                <div className="text-[10px] leading-5 text-faint">
                  <div>被引 {column.paper.citationCount}</div>
                  <div>{column.figures} 张图</div>
                  <div>{column.fullTextChars ? `${Math.round(column.fullTextChars / 1000)}k 字符全文` : "摘要材料"}</div>
                </div>
              </div>
            </div>
          ))}

          <Row label="研究问题">
            {columns.map((column) => (
              <Cell key={column.paper.id}>{column.content?.core_question ?? "—"}</Cell>
            ))}
          </Row>
          <Row label="一句话结论">
            {columns.map((column) => (
              <Cell key={column.paper.id} className="font-medium text-ink">
                {column.content?.one_liner ?? "尚未生成精讲"}
              </Cell>
            ))}
          </Row>
          <Row label="研究思路">
            {columns.map((column) => (
              <Cell key={column.paper.id}>
                {column.content?.approach.length ? (
                  <ol className="list-decimal space-y-1 pl-4">
                    {column.content.approach.slice(0, 3).map((step, index) => (
                      <li key={index}>{step.step}</li>
                    ))}
                  </ol>
                ) : (
                  "—"
                )}
              </Cell>
            ))}
          </Row>
          <Row label="主要结果">
            {columns.map((column) => (
              <Cell key={column.paper.id}>
                {column.content?.results.length ? (
                  <ul className="space-y-1.5">
                    {column.content.results.slice(0, 3).map((result, index) => (
                      <li key={index} className="border-l-2 border-accent/30 pl-2">
                        {result.finding}
                        <span className="mt-0.5 block text-[9.5px] text-faint">{result.evidence_location}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </Cell>
            ))}
          </Row>
          <Row label="创新点">
            {columns.map((column) => (
              <Cell key={column.paper.id}>
                {column.content?.innovations.length ? (
                  <ul className="space-y-1">
                    {column.content.innovations.slice(0, 3).map((item, index) => (
                      <li key={index}>
                        <span className="text-accent">{item.type}：</span>
                        {item.description}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </Cell>
            ))}
          </Row>
          <Row label="独立分析局限">
            {columns.map((column) => (
              <Cell key={column.paper.id}>
                {column.content?.independent_limitations.length ? (
                  <ul className="space-y-1">
                    {column.content.independent_limitations.slice(0, 2).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </Cell>
            ))}
          </Row>
          <Row label="领域意义">
            {columns.map((column) => (
              <Cell key={column.paper.id}>{column.content?.significance ?? "—"}</Cell>
            ))}
          </Row>
          <Row label="学习要点">
            {columns.map((column) => (
              <Cell key={column.paper.id}>
                {column.content?.takeaways.length ? (
                  <ul className="space-y-1">
                    {column.content.takeaways.slice(0, 3).map((item, index) => (
                      <li key={index}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  "—"
                )}
              </Cell>
            ))}
          </Row>
          <Row label="数据与全文">
            {columns.map((column) => (
              <Cell key={column.paper.id}>
                <div className="space-y-1 text-[10.5px]">
                  <div>DOI：{column.paper.doi ?? "—"}</div>
                  <div>PMID：{column.paper.pmid ?? "—"}</div>
                  <div>PMCID：{column.paper.pmcid ?? "—"}</div>
                  <div>
                    全文：{column.paper.fullTextAccessStatus === "oa_fulltext" ? "开放获取" : "仅摘要"}
                    {column.paper.fullTextLicense ? ` · ${column.paper.fullTextLicense}` : ""}
                  </div>
                </div>
              </Cell>
            ))}
          </Row>
        </div>
      </div>

      <div className="no-print mt-6 flex flex-wrap items-center justify-between gap-3 text-[10.5px] text-faint">
        <span>对比仅读取中央文献数据库；空白处表示材料不足，不以推测填充。</span>
        <TextLink href={`/api/export/bibtex?ids=${columns.map((column) => column.paper.id).join(",")}`}>
          下载所选文献的 BibTeX
        </TextLink>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <div className="bg-surface-2 px-4 py-3 text-[10.5px] font-medium text-muted">{label}</div>
      {children}
    </>
  );
}

function Cell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cx("bg-surface px-4 py-3 text-[11px] leading-6 text-ink-2", className)}>{children}</div>
  );
}
