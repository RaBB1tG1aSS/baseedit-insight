import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChevronRight,
  CircleDot,
  Download,
  ExternalLink as ExternalLinkIcon,
  FileText,
  FlaskConical,
  Layers,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { DeepReadContent, EvidenceNature } from "@/lib/types";
import { FOCUS_LABEL } from "@/lib/constants";
import { authorsLine, formatDate, formatDateTime, relativeTime } from "@/lib/format";
import { getAcceptedPaperById, getRelatedPapers } from "@/server/db/repo/papers";
import {
  getFigures,
  getFullText,
  getLatestAnalysis,
  getQualityAssessment,
  getSources,
  getVerificationRecords,
} from "@/server/db/repo/analysis";
import { getUserRecord } from "@/server/db/repo/user";
import { TableOfContents } from "@/components/toc";
import type { TocItem } from "@/components/toc";
import { FigureBlock } from "@/components/figure-viewer";
import { PaperSidebar } from "@/components/paper-sidebar";
import { FavoriteButton, NoteEditor, ReadStatusControl, ReadingTracker } from "@/components/library-controls";
import { CompareToggle } from "@/components/compare-controls";
import { ActionButton } from "@/components/action-button";
import { PrintButton } from "@/components/print-button";
import {
  Badge,
  EvidenceNatureBadge,
  ExternalLink,
  FocusBadge,
  InlineNotice,
  PeerReviewBadge,
  ProgressBar,
  RetractionBadge,
  ScoreRing,
  cx,
} from "@/components/ui";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const paper = getAcceptedPaperById(id);
  return { title: paper ? paper.titleZh ?? paper.title : "论文精讲" };
}

export default async function PaperPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const paper = getAcceptedPaperById(id);
  if (!paper) notFound();

  const figures = getFigures(id);
  const analysis = getLatestAnalysis(id, "deep_read");
  const content = (analysis?.content ?? null) as DeepReadContent | null;
  const quality = getQualityAssessment(id);
  const sources = getSources(id);
  const verifications = getVerificationRecords(id, 40);
  const userRecord = getUserRecord(id);
  const related = getRelatedPapers(id, 5);
  const fullText = getFullText(id);

  const abstractOnly = analysis?.analysisLevel === "abstract_only";
  const stale = paper.needsAnalysisRefresh;
  const effectiveAccess = fullText?.accessStatus ?? paper.fullTextAccessStatus;

  const toc: TocItem[] = content
    ? [
        { id: "one-liner", label: "一句话理解" },
        { id: "background", label: "研究背景" },
        { id: "question", label: "科学问题与假设" },
        { id: "approach", label: "研究思路" },
        { id: "results", label: "主要结果" },
        { id: "innovations", label: "创新点" },
        { id: "limitations", label: "局限性" },
        { id: "significance", label: "领域意义" },
        { id: "learning", label: "学习总结" },
        ...(content.figure_logic?.length ? [{ id: "figure-logic", label: "图表逻辑" }] : []),
        ...(figures.length ? [{ id: "figures", label: "逐图精讲" }] : []),
        { id: "evidence", label: "证据引用" },
      ]
    : figures.length
      ? [{ id: "figures", label: "图表与图注" }]
      : [];

  const passCount = verifications.filter((record) => record.result === "pass").length;
  const warnCount = verifications.filter((record) => record.result === "warning").length;
  const conflictCount = verifications.filter((record) => record.result === "conflict").length;
  const failCount = verifications.filter((record) => record.result === "fail").length;

  return (
    <div className="container-page pb-20 pt-7">
      <ReadingTracker paperId={paper.id} targetId="article-body" />

      <div className="no-print mb-5 flex items-center gap-1.5 text-[11px] text-faint">
        <Link href="/papers" className="inline-flex items-center gap-1 hover:text-ink">
          <ArrowLeft size={12} /> 文献库
        </Link>
        <ChevronRight size={11} />
        <span className="truncate">{paper.journal ?? "论文"}</span>
      </div>

      <header className="animate-rise">
        <div className="flex flex-wrap items-center gap-1.5">
          <PeerReviewBadge status={paper.peerReviewStatus} />
          <RetractionBadge status={paper.retractionStatus} />
          <Badge variant="outline">
            {effectiveAccess === "oa_fulltext" ? <BookOpen size={10} /> : <FileText size={10} />}
            {effectiveAccess === "oa_fulltext" ? "开放获取全文" : "摘要级材料"}
          </Badge>
          {paper.focusAreas.map((area) => (
            <FocusBadge key={area} area={area} />
          ))}
          {paper.recommendationCategory ? (
            <Badge variant={paper.recommendationCategory === "landmark" ? "gold" : "accent"}>
              {paper.recommendationCategory === "landmark" ? "经典研究" : "前沿研究"}
            </Badge>
          ) : null}
        </div>

        <div className="mt-4 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <div className="min-w-0">
            <h1 className="display max-w-5xl text-[1.7rem] font-semibold leading-[1.35] text-ink md:text-[2.25rem]">
              {paper.title}
            </h1>
            {paper.titleZh ? (
              <p className="mt-2.5 max-w-4xl text-[14px] leading-7 text-muted md:text-[15px]">{paper.titleZh}</p>
            ) : null}
            <p className="mt-4 text-[12.5px] text-muted">{authorsLine(paper.authors, 8)}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-faint">
              <span className="font-medium text-ink-2">{paper.journal ?? "期刊未知"}</span>
              <span className="text-line-strong">·</span>
              <span className="inline-flex items-center gap-1">
                <CalendarDays size={11} /> {formatDate(paper.publicationDate)}
              </span>
              <span className="text-line-strong">·</span>
              <span>{paper.articleType ?? "研究论文"}</span>
              {paper.doi ? (
                <>
                  <span className="text-line-strong">·</span>
                  <ExternalLink href={`https://doi.org/${paper.doi}`} className="font-mono text-[10.5px]">
                    DOI {paper.doi}
                  </ExternalLink>
                </>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-5 lg:flex-col lg:items-end lg:gap-3">
            <ScoreRing score={paper.qualityScore} size={84} stroke={6} />
            <div className="no-print flex flex-wrap items-center justify-end gap-2">
              <FavoriteButton paperId={paper.id} initial={Boolean(userRecord?.favorite)} compact />
              <CompareToggle paperId={paper.id} />
              <ReadStatusControl paperId={paper.id} initial={userRecord?.readStatus ?? "unread"} />
            </div>
          </div>
        </div>

        <div className="no-print mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {analysis ? (
            <a
              href="#one-liner"
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-accent px-4 text-[12.5px] font-medium text-white hover:bg-accent-strong"
            >
              开始阅读精讲
            </a>
          ) : (
            <ActionButton
              endpoint={`/api/papers/${paper.id}/analysis`}
              body={{ force: true }}
              label="生成 AI 中文精讲"
              pendingLabel="提交中…"
              variant="primary"
              icon={<Lightbulb size={13} />}
              redirectTo="/agent?job={jobId}"
            />
          )}
          <ExternalLink href={paper.officialUrl} className="inline-flex h-9 items-center gap-1 rounded-full border border-line bg-surface px-3.5 text-[12px]">
            官方原文
          </ExternalLink>
          <a
            href={`/api/export/papers/${paper.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <Download size={12} /> Markdown
          </a>
          <a
            href={`/api/export/bibtex?ids=${paper.id}`}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <Download size={12} /> BibTeX
          </a>
          <PrintButton />
          <span className="ml-auto text-[10.5px] text-faint">
            {paper.pmid ? `PMID ${paper.pmid}` : paper.pmcid ? paper.pmcid : ""}
            {paper.citationCount ? ` · 被引 ${paper.citationCount}` : ""}
          </span>
        </div>
      </header>

      {stale || abstractOnly ? (
        <div className="mt-5 space-y-2">
          {stale ? (
            <InlineNotice tone="warn" title="论文元数据已更新，现有 AI 内容可能过期">
              系统检测到标题、发表状态、撤稿状态等关键信息发生变化。下方精讲已标记为 stale，建议重新生成并核对原文。
            </InlineNotice>
          ) : null}
          {abstractOnly ? (
            <InlineNotice tone="muted" title="摘要级分析">
              当前只能访问摘要（未获取到可用的开放获取全文），因此精讲不包含对 Figures、具体数值或 Results 细节的描述。图表部分仅展示可公开获取的图注或官方链接。
            </InlineNotice>
          ) : null}
        </div>
      ) : null}

      <div id="article-body">
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[185px_minmax(0,1fr)_300px] xl:gap-10">
        <aside className="no-print hidden self-start xl:sticky xl:top-24 xl:block">
          <TableOfContents items={toc} />
          <div className="mt-6 border-t border-line pt-4 text-[10.5px] leading-6 text-faint">
            <div className="mb-1.5 font-medium text-muted">阅读提示</div>
            <p>证据分层：论文事实 / 作者解释 / AI 综合 / 推测。请以原文为准。</p>
          </div>
        </aside>

        <article className="min-w-0">
          {content ? (
            <>
              <ArticleSection id="one-liner" index={1} title="一句话理解" className="!pt-0">
                <div className="relative overflow-hidden rounded-xl border border-accent/20 bg-accent-soft/60 px-5 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">One-line takeaway</div>
                  <p className="display mt-2 text-[17px] font-medium leading-8 text-ink md:text-[19px]">{content.one_liner}</p>
                </div>
              </ArticleSection>

              <ArticleSection id="background" index={2} title="研究背景">
                <div className="prose-cn">
                  {content.background.map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              </ArticleSection>

              <ArticleSection id="question" index={3} title="核心科学问题与研究假设">
                <div className="grid gap-3 md:grid-cols-3">
                  <DefinitionCard label="核心问题" text={content.core_question} tone="accent" />
                  <DefinitionCard label="研究假设" text={content.hypothesis} tone="gold" />
                  <DefinitionCard label="研究目标" text={content.goal} tone="muted" />
                </div>
              </ArticleSection>

              <ArticleSection id="approach" index={4} title="研究思路与技术路线">
                <ol className="relative space-y-5 border-l border-line pl-6">
                  {content.approach.map((step, index) => (
                    <li key={index} className="relative">
                      <span className="absolute -left-[31px] flex h-5 w-5 items-center justify-center rounded-full border border-accent/30 bg-surface text-[10px] font-semibold text-accent">
                        {index + 1}
                      </span>
                      <div className="text-[14px] font-medium leading-7 text-ink">{step.step}</div>
                      <div className="mt-1.5 text-[12.5px] leading-6 text-muted">
                        <span className="text-faint">科学问题：</span>
                        {step.question}
                      </div>
                      <div className="mt-1 text-[12.5px] leading-6 text-muted">
                        <span className="text-faint">设计逻辑：</span>
                        {step.rationale}
                      </div>
                    </li>
                  ))}
                </ol>
              </ArticleSection>

              <ArticleSection id="results" index={5} title="主要结果">
                <div className="space-y-3">
                  {content.results.map((result, index) => (
                    <div key={index} className="card-flat p-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent">
                          {index + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="text-[13.5px] font-medium leading-7 text-ink">{result.finding}</p>
                          <p className="mt-1.5 text-[12.5px] leading-6 text-ink-2">{result.meaning}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-[10.5px] text-faint">
                            <span className="inline-flex items-center gap-1 rounded bg-surface-2 px-1.5 py-0.5">
                              <CircleDot size={9} /> {result.evidence_location}
                            </span>
                            {result.caveat ? <span className="text-warn">其他解释 / 不足：{result.caveat}</span> : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ArticleSection>

              <ArticleSection id="innovations" index={6} title="创新点">
                <div className="space-y-2.5">
                  {content.innovations.map((item, index) => (
                    <div key={index} className="flex gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                      <Badge variant="accent" className="mt-0.5 shrink-0">
                        {item.type}
                      </Badge>
                      <p className="text-[13px] leading-7 text-ink-2">{item.description}</p>
                    </div>
                  ))}
                </div>
              </ArticleSection>

              <ArticleSection id="limitations" index={7} title="局限性">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-xl border border-line bg-surface-2/50 p-4">
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                      作者承认的局限
                    </div>
                    {content.author_limitations.length ? (
                      <ul className="space-y-1.5 text-[12.5px] leading-6 text-ink-2">
                        {content.author_limitations.map((item, index) => (
                          <li key={index} className="flex gap-2">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-faint" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] text-faint">材料中未明确列出作者承认的局限。</p>
                    )}
                  </div>
                  <div className="rounded-xl border border-gold/25 bg-gold-soft/50 p-4">
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold">
                      AI 独立分析的局限
                    </div>
                    {content.independent_limitations.length ? (
                      <ul className="space-y-1.5 text-[12.5px] leading-6 text-ink-2">
                        {content.independent_limitations.map((item, index) => (
                          <li key={index} className="flex gap-2">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[12px] text-faint">未生成独立局限分析。</p>
                    )}
                  </div>
                </div>
              </ArticleSection>

              <ArticleSection id="significance" index={8} title="对碱基编辑领域的意义">
                <div className="prose-cn">
                  <p>{content.significance}</p>
                </div>
              </ArticleSection>

              <ArticleSection id="learning" index={9} title="学习总结">
                <div className="space-y-6">
                  <div>
                    <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">核心知识点</div>
                    <ol className="space-y-2">
                      {content.takeaways.map((item, index) => (
                        <li key={index} className="flex gap-2.5 text-[13px] leading-7 text-ink-2">
                          <span className="num mt-0.5 shrink-0 text-[11px] font-semibold text-accent">{String(index + 1).padStart(2, "0")}</span>
                          {item}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {content.glossary.length ? (
                    <div>
                      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">关键术语</div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {content.glossary.map((item, index) => (
                          <div key={index} className="rounded-lg border border-line bg-surface px-3 py-2">
                            <div className="text-[12px] font-medium text-ink">{item.term}</div>
                            <div className="mt-0.5 text-[11.5px] leading-6 text-muted">{item.explanation}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">前置知识</div>
                      <div className="flex flex-wrap gap-1.5">
                        {content.prerequisites.length ? (
                          content.prerequisites.map((item, index) => (
                            <Badge key={index} variant="outline">
                              {item}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-[12px] text-faint">无需特别前置知识。</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <div className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">重点阅读章节</div>
                      <ul className="space-y-1">
                        {content.reading_guide.map((item, index) => (
                          <li key={index} className="text-[12px] leading-6 text-ink-2">
                            <span className="font-medium">{item.section}</span>
                            <span className="text-muted"> — {item.reason}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              </ArticleSection>

              {content.figure_logic?.length ? (
                <ArticleSection id="figure-logic" index={10} title="图表之间的论证逻辑">
                  <div className="space-y-2">
                    {content.figure_logic.map((item, index) => (
                      <div key={index} className="flex gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                        <span className="mt-0.5 shrink-0 text-[11px] font-semibold text-accent">{item.figure}</span>
                        <p className="text-[12.5px] leading-6 text-ink-2">{item.role}</p>
                      </div>
                    ))}
                  </div>
                </ArticleSection>
              ) : null}
            </>
          ) : (
            <section className="rounded-xl border border-line bg-surface p-6">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                  <FileText size={16} />
                </span>
                <div>
                  <h2 className="display text-lg font-semibold text-ink">这篇论文还没有中文精讲</h2>
                  <p className="mt-1.5 text-[12.5px] leading-6 text-muted">
                    下方为论文摘要与已获取的图表图注。生成精讲后，系统会按背景、问题、技术路线、结果、创新点、局限性与学习总结逐节讲解，并保持摘要级/全文级的明确标记。
                  </p>
                </div>
              </div>
              <div className="mt-4 rounded-lg border border-line bg-bg-elevated p-4">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">摘要</div>
                <p className="text-[13px] leading-7 text-ink-2">{paper.abstract ?? "未获取到摘要。"}</p>
              </div>
            </section>
          )}

        </article>

        <PaperSidebar
          paper={paper}
          quality={quality}
          userRecord={userRecord}
          verifications={verifications}
          sources={sources}
          hasAnalysis={Boolean(analysis)}
          effectiveAccess={effectiveAccess}
          fullTextCharCount={fullText?.charCount ?? 0}
        />
      </div>

          {figures.length ? (
            <section id="figures" className="mt-12 scroll-mt-28 border-t border-line pt-8">
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <div className="kicker mb-1.5">Figure by Figure</div>
                  <h2 className="display text-[1.35rem] font-semibold text-ink">逐图精讲</h2>
                </div>
                <span className="text-[10.5px] text-faint">
                  共 {figures.length} 张图 · 原始图表受许可约束，均标注来源
                </span>
              </div>
              <div className="mt-6 space-y-8">
                {figures.map((figure) => (
                  <FigureBlock key={figure.id} figure={figure} paperId={paper.id} />
                ))}
              </div>
            </section>
          ) : null}

      <div className="mx-auto mt-8 grid max-w-[1280px] gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[185px_minmax(0,1fr)_300px] xl:gap-10">
        <div className="hidden xl:block" />
        <article className="min-w-0">
          {content?.evidence.length ? (
            <section id="evidence" className="mt-10 scroll-mt-28 border-t border-line pt-8">
              <div className="kicker mb-1.5">Evidence ledger</div>
              <h2 className="display mb-4 text-[1.35rem] font-semibold text-ink">证据引用</h2>
              <div className="space-y-2.5">
                {content.evidence.map((evidence, index) => (
                  <div key={index} className="rounded-lg border border-line bg-surface px-4 py-3">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <EvidenceNatureBadge nature={evidence.nature as EvidenceNature} />
                      <span className="text-[10.5px] text-faint">{evidence.location}</span>
                    </div>
                    <p className="font-serif text-[12.5px] italic leading-7 text-ink-2">“{evidence.quote}”</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10.5px] leading-5 text-faint">
                证据分层说明：论文事实 = 原文直接陈述；作者解释 = 作者自己的推论；AI 综合分析 = 基于论文的综合判断；推测 = 尚未验证的假设。
              </p>
            </section>
          ) : null}

          {related.length ? (
            <section className="mt-10 border-t border-line pt-8">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="display text-[1.35rem] font-semibold text-ink">相关论文</h2>
                <span className="text-[10.5px] text-faint">
                  {related[0].basis === "shared_entities" ? "基于知识图谱共享实体" : "同研究方向（非直接关联）"}
                </span>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {related.map((item) => (
                  <Link
                    key={item.paper.id}
                    href={`/papers/${item.paper.id}`}
                    className="group rounded-xl border border-line bg-surface px-4 py-3 transition hover:border-line-strong"
                  >
                    <div className="line-clamp-2 text-[12.5px] font-medium leading-6 text-ink group-hover:text-accent-strong">
                      {item.paper.titleZh || item.paper.title}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-faint">
                      <span>{item.paper.journal ?? "未知期刊"}</span>
                      <span>·</span>
                      <span>{formatDate(item.paper.publicationDate)}</span>
                      {item.shared.length ? (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-ink-2">
                          共享：{item.shared.slice(0, 3).join("、")}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-10 border-t border-line pt-5 text-[10.5px] leading-6 text-faint">
            {analysis ? (
              <p>
                本页 AI 分析由 <span className="text-ink-2">{analysis.model}</span>（{analysis.provider}）生成于{" "}
                {formatDateTime(analysis.generatedAt)}，模板 {analysis.templateVersion}，分析层级：
                {analysis.analysisLevel === "full_text" ? "全文" : "仅摘要"}。
                AI 内容可能与原文存在偏差，请结合原始论文与上方证据引用核验。
              </p>
            ) : (
              <p>本页尚未生成 AI 分析。摘要与元数据来自已核验的中央文献数据库。</p>
            )}
            <p className="mt-1">Paper ID：<span className="font-mono">{paper.id}</span> · 数据版本 v{paper.dataVersion}</p>
          </div>
        </article>
        <div className="hidden xl:block" />
      </div>
    </div>
    </div>
  );
}

function ArticleSection({
  id,
  index,
  title,
  children,
  className,
}: {
  id: string;
  index: number;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cx("scroll-mt-28 border-b border-line pb-8 pt-8 last:border-0", className)}>
      <div className="mb-4 flex items-baseline gap-2.5">
        <span className="num text-[10.5px] font-semibold text-accent">{String(index).padStart(2, "0")}</span>
        <h2 className="display text-[1.3rem] font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function DefinitionCard({
  label,
  text,
  tone,
}: {
  label: string;
  text: string;
  tone: "accent" | "gold" | "muted";
}) {
  const styles = {
    accent: "border-accent/20 bg-accent-soft/50",
    gold: "border-gold/20 bg-gold-soft/50",
    muted: "border-line bg-surface",
  }[tone];
  return (
    <div className={cx("rounded-xl border px-4 py-3.5", styles)}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</div>
      <p className="text-[12.5px] leading-7 text-ink-2">{text}</p>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-faint">{label}</dt>
      <dd className="truncate text-right text-ink-2" title={value}>
        {value}
      </dd>
    </div>
  );
}
