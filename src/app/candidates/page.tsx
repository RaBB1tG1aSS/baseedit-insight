import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeftRight, ClipboardCheck, ExternalLink as ExternalLinkIcon, ShieldAlert } from "lucide-react";
import { listCandidates } from "@/server/db/repo/papers";
import { countByStatus } from "@/server/db/repo/papers";
import { getQualityAssessment, getSources, getVerificationRecords } from "@/server/db/repo/analysis";
import { formatDate, relativeTime } from "@/lib/format";
import { ActionButton } from "@/components/action-button";
import { CandidateActions } from "@/components/candidate-actions";
import { Badge, EmptyState, Kicker, StatusBadge, cx } from "@/components/ui";
import type { PaperStatus, VerificationRecord } from "@/lib/types";

export const metadata: Metadata = { title: "候选文献审核" };
export const dynamic = "force-dynamic";

type Params = Promise<{ status?: string }>;

const FILTERS = [
  { key: "review", label: "待复核", statuses: ["needs_review", "quality_assessed", "metadata_verified"] as PaperStatus[] },
  { key: "candidate", label: "候选", statuses: ["candidate", "discovered"] as PaperStatus[] },
  { key: "rejected", label: "未通过", statuses: ["rejected"] as PaperStatus[] },
  { key: "all", label: "全部（含已入库前状态）", statuses: ["needs_review", "quality_assessed", "metadata_verified", "candidate", "discovered", "rejected"] as PaperStatus[] },
];

function checkTone(result: VerificationRecord["result"]): "success" | "warn" | "danger" | "outline" {
  if (result === "pass") return "success";
  if (result === "conflict" || result === "fail") return "danger";
  return "warn";
}

export default async function CandidatesPage({ searchParams }: { searchParams: Params }) {
  const { status } = await searchParams;
  const active = FILTERS.find((filter) => filter.key === status) ?? FILTERS.find((filter) => filter.key === "all") ?? FILTERS[0];
  const counts = countByStatus();

  const rows = listCandidates({ statuses: active.statuses, limit: 80 }).map((row) => {
    const checks = getVerificationRecords(row.paper.id, 12);
    const quality = getQualityAssessment(row.paper.id);
    const sources = getSources(row.paper.id);
    const decision = checks.find((check) => check.checkItem === "入库判定");
    return { ...row, checks, quality, sources, decision };
  });

  const filterCount = (statuses: PaperStatus[]) =>
    statuses.reduce((sum, key) => sum + (counts[key] ?? 0), 0);

  return (
    <div className="container-page pb-16 pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Kicker className="mb-2">Candidate review queue</Kicker>
          <h1 className="display text-3xl font-semibold text-ink md:text-4xl">候选文献审核</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-muted">
            搜索引擎返回的论文不会直接成为可信文献。这里展示去重、身份核验、撤稿检查与质量评估的真实结果；
            未通过的记录不会进入每日推荐、知识图谱时间线或周报结论。
          </p>
        </div>
        <Link
          href="/papers"
          className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[12px] text-ink-2 hover:border-line-strong"
        >
          返回文献库
        </Link>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((filter) => (
          <Link
            key={filter.key}
            href={`/candidates?status=${filter.key}`}
            className={cx(
              "rounded-full border px-3 py-1.5 text-[11.5px] transition",
              active.key === filter.key
                ? "border-accent/25 bg-accent-soft text-accent-ink"
                : "border-line bg-surface text-muted hover:text-ink",
            )}
          >
            {filter.label} <span className="num ml-1 text-[10px] opacity-70">{filterCount(filter.statuses)}</span>
          </Link>
        ))}
        <span className="ml-auto text-[10.5px] text-faint">
          已核验入库 <span className="num text-ink-2">{counts.accepted ?? 0}</span> 篇
        </span>
      </div>

      {rows.length ? (
        <div className="space-y-3">
          {rows.map(({ paper, checks, quality, sources, decision }) => {
            const conflicts = checks.filter((check) => check.result === "conflict");
            const failures = checks.filter((check) => check.result === "fail");
            const passes = checks.filter((check) => check.result === "pass");
            return (
              <article key={paper.id} className="card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={paper.status} />
                      <Badge variant="outline">{paper.peerReviewStatus === "peer_reviewed" ? "同行评审" : paper.peerReviewStatus === "preprint" ? "预印本" : "评审未知"}</Badge>
                      {paper.retractionStatus === "retracted" ? <Badge variant="danger">已撤稿</Badge> : null}
                      {paper.retractionStatus === "expression_of_concern" ? <Badge variant="warn">关注声明</Badge> : null}
                      {sources.map((source) => (
                        <Badge key={source.sourceId} variant="outline">
                          {source.sourceName}
                        </Badge>
                      ))}
                      {paper.focusAreas.map((area) => (
                        <Badge key={area} variant="outline">
                          {area}
                        </Badge>
                      ))}
                    </div>

                    <h2 className="display mt-2.5 text-[16px] font-semibold leading-7 text-ink md:text-[17px]">
                      {paper.title}
                    </h2>
                    {paper.titleZh ? <p className="mt-1 text-[12px] leading-6 text-muted">{paper.titleZh}</p> : null}

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10.5px] text-faint">
                      <span className="text-ink-2">{paper.journal ?? "期刊未知"}</span>
                      <span>{formatDate(paper.publicationDate)}</span>
                      {paper.doi ? <span className="font-mono">DOI {paper.doi}</span> : null}
                      {paper.pmid ? <span className="font-mono">PMID {paper.pmid}</span> : null}
                      <span>更新 {relativeTime(paper.updatedAt)}</span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {checks.slice(0, 8).map((check) => (
                        <span
                          key={check.id}
                          title={`${check.notes ?? ""}\n${check.evidence ?? ""}`}
                          className={cx(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px]",
                            check.result === "pass"
                              ? "bg-success-soft text-success"
                              : check.result === "conflict" || check.result === "fail"
                                ? "bg-danger-soft text-danger"
                                : "bg-warn-soft text-warn",
                          )}
                        >
                          {check.checkItem}
                        </span>
                      ))}
                      <span className="text-[9.5px] text-faint">
                        通过 {passes.length} · 警示 {checks.filter((c) => c.result === "warning").length}
                        {conflicts.length ? ` · 冲突 ${conflicts.length}` : ""}
                        {failures.length ? ` · 失败 ${failures.length}` : ""}
                      </span>
                    </div>

                    {conflicts.length || failures.length ? (
                      <div className="mt-2.5 rounded-lg border border-danger/20 bg-danger-soft/50 px-3 py-2 text-[10.5px] leading-5 text-danger">
                        {[...conflicts, ...failures].slice(0, 3).map((check) => (
                          <div key={check.id}>
                            <span className="font-medium">{check.checkItem}：</span>
                            {check.notes ?? check.evidence ?? check.result}
                          </div>
                        ))}
                      </div>
                    ) : decision ? (
                      <p className="mt-2.5 text-[10.5px] leading-5 text-muted">
                        <span className="font-medium text-ink-2">入库判定：</span>
                        {decision.notes}
                      </p>
                    ) : null}

                    {quality ? (
                      <details className="mt-2.5">
                        <summary className="cursor-pointer text-[10.5px] text-muted">
                          质量评分明细（{quality.total}/100）
                        </summary>
                        <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                          {quality.dimensions.map((dimension) => (
                            <div key={dimension.key} className="flex items-center justify-between gap-2 text-[10px] text-muted">
                              <span>{dimension.label}</span>
                              <span className="num text-ink-2">
                                {dimension.score}/{dimension.max}
                              </span>
                            </div>
                          ))}
                        </div>
                        <p className="mt-1.5 text-[10px] leading-5 text-faint">{paper.qualitySummary}</p>
                      </details>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <div className="flex h-12 w-14 flex-col items-center justify-center rounded-lg border border-line bg-bg-elevated">
                      <span className="num text-base font-semibold text-ink">
                        {paper.qualityScore == null ? "—" : Math.round(paper.qualityScore)}
                      </span>
                      <span className="text-[8px] text-faint">/100</span>
                    </div>
                    <ActionButton
                      endpoint={`/api/papers/${paper.id}/reverify`}
                      label="重新核验"
                      pendingLabel="排队中…"
                      variant="secondary"
                      size="sm"
                      icon={<ArrowLeftRight size={11} />}
                      redirectTo="/agent?job={jobId}"
                    />
                    <CandidateActions paperId={paper.id} status={paper.status} />
                    {paper.officialUrl ? (
                      <a
                        href={paper.officialUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex items-center gap-1 text-[10px] text-accent hover:text-accent-strong"
                      >
                        官方来源 <ExternalLinkIcon size={9} />
                      </a>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={<ClipboardCheck size={20} />}
          title="当前筛选下没有候选论文"
          description="候选区展示未通过或等待核验的记录。未通过核验的文献不会作为科研事实进入推荐、图谱或周报。"
          action={
            <Link href="/agent" className="text-[12px] font-medium text-accent">
              查看 Agent 日志
            </Link>
          }
        />
      )}

      <div className="mt-6 flex items-start gap-2.5 rounded-xl border border-line bg-surface-2/60 px-4 py-3 text-[11px] leading-6 text-muted">
        <ShieldAlert size={14} className="mt-0.5 shrink-0 text-warn" />
        <div>
          <span className="font-medium text-ink-2">人工通过的限制：</span>
          人工审核不能绕过已撤稿检查、身份核验、领域相关性门槛与综合质量门槛。若任一条件不满足，系统会返回具体 blockers，
          而不会把候选论文“包装”成已核验文献。
        </div>
      </div>
    </div>
  );
}
