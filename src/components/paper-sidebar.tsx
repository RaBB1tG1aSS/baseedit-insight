import {
  Download,
  ExternalLink as ExternalLinkIcon,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type {
  FullTextMaterialStatus,
  Paper,
  QualityAssessment,
  SourceLink,
  UserRecord,
  VerificationRecord,
} from "@/lib/types";
import { formatDate } from "@/lib/format";
import { metricPrefix, metricTitle } from "@/lib/journal-metric";
import { ActionButton } from "./action-button";
import { NoteEditor } from "./library-controls";
import { Badge, ExternalLink, ProgressBar, ScoreRing, cx } from "./ui";

export function PaperSidebar({
  paper,
  quality,
  userRecord,
  verifications,
  sources,
  hasAnalysis,
  effectiveAccess,
  fullTextCharCount,
}: {
  paper: Paper;
  quality: QualityAssessment | null;
  userRecord: UserRecord | null;
  verifications: VerificationRecord[];
  sources: SourceLink[];
  hasAnalysis: boolean;
  effectiveAccess: FullTextMaterialStatus;
  fullTextCharCount: number;
}) {
  const passCount = verifications.filter((record) => record.result === "pass").length;
  const warnCount = verifications.filter((record) => record.result === "warning").length;
  const conflictCount = verifications.filter((record) => record.result === "conflict").length;
  const failCount = verifications.filter((record) => record.result === "fail").length;

  return (
    <aside className="no-print space-y-4 lg:sticky lg:top-24 lg:self-start">
      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div className="kicker">质量评价</div>
          <ScoreRing score={paper.qualityScore} size={54} stroke={5} label="" />
        </div>
        {quality ? (
          <div className="mt-2 space-y-2.5">
            {quality.dimensions.map((dimension) => (
              <div key={dimension.key}>
                <div className="mb-1 flex items-center justify-between text-[10.5px]">
                  <span className="text-muted">{dimension.label}</span>
                  <span className="num text-ink-2">
                    {dimension.score}/{dimension.max}
                  </span>
                </div>
                <ProgressBar value={dimension.score} max={dimension.max} />
                <p className="mt-1 line-clamp-2 text-[9.5px] leading-4 text-faint" title={dimension.rationale}>
                  {dimension.rationale}
                </p>
              </div>
            ))}
            <p className="border-t border-line pt-2 text-[10.5px] leading-5 text-muted">{paper.qualitySummary}</p>
          </div>
        ) : (
          <p className="mt-2 text-[11px] text-faint">暂无维度评分明细。</p>
        )}
      </div>

      <div className="card p-4">
        <div className="kicker mb-2.5">论文信息</div>
        <dl className="space-y-2 text-[11px]">
          <Meta label="期刊" value={paper.journal ?? "—"} />
          <Meta label="发表" value={formatDate(paper.publicationDate)} />
          <Meta label="类型" value={paper.articleType ?? "—"} />
          <Meta
            label="评审"
            value={
              paper.peerReviewStatus === "peer_reviewed"
                ? "同行评审"
                : paper.peerReviewStatus === "preprint"
                  ? "预印本"
                  : "未知"
            }
          />
          <Meta label="引用" value={String(paper.citationCount)} />
          <Meta
            label="期刊指标"
            value={
              paper.journalMetric == null
                ? "—"
                : `${metricPrefix(paper.journalMetricSource)} ${paper.journalMetric.toFixed(1)}`
            }
            title={metricTitle(paper.journalMetric, paper.journalMetricSource, paper.journalMetricYear)}
          />
          <Meta
            label="全文"
            value={
              effectiveAccess === "oa_fulltext"
                ? "开放获取"
                : effectiveAccess === "manual_fulltext"
                  ? "用户导入"
                  : "仅摘要"
            }
          />
          <Meta label="许可" value={paper.fullTextLicense ?? "—"} />
          {fullTextCharCount ? <Meta label="全文规模" value={`${Math.round(fullTextCharCount / 1000)}k 字符`} /> : null}
          {paper.pmid ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-faint">PMID</dt>
              <dd>
                <ExternalLink href={`https://pubmed.ncbi.nlm.nih.gov/${paper.pmid}/`} className="font-mono text-[10px]">
                  {paper.pmid}
                </ExternalLink>
              </dd>
            </div>
          ) : null}
          {paper.pmcid ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-faint">PMCID</dt>
              <dd>
                <ExternalLink
                  href={`https://www.ncbi.nlm.nih.gov/pmc/articles/${paper.pmcid}/`}
                  className="font-mono text-[10px]"
                >
                  {paper.pmcid}
                </ExternalLink>
              </dd>
            </div>
          ) : null}
        </dl>
        <div className="mt-3 flex flex-wrap gap-1">
          {paper.keywords.slice(0, 6).map((keyword) => (
            <Badge key={keyword} variant="outline">
              {keyword}
            </Badge>
          ))}
        </div>
      </div>

      <div className="card p-4">
        <div className="kicker mb-2 flex items-center gap-1.5">
          <ShieldCheck size={12} /> 核验记录
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <Badge variant="success">通过 {passCount}</Badge>
          <Badge variant="warn">警示 {warnCount}</Badge>
          {conflictCount ? <Badge variant="danger">冲突 {conflictCount}</Badge> : null}
          {failCount ? <Badge variant="danger">失败 {failCount}</Badge> : null}
        </div>
        <details className="mt-2.5">
          <summary className="cursor-pointer text-[10.5px] text-muted">查看核验明细</summary>
          <ul className="mt-2 space-y-1.5">
            {verifications.slice(0, 12).map((record) => (
              <li key={record.id} className="text-[10px] leading-5 text-muted">
                <span
                  className={cx(
                    "mr-1 font-medium",
                    record.result === "pass"
                      ? "text-success"
                      : record.result === "conflict" || record.result === "fail"
                        ? "text-danger"
                        : "text-warn",
                  )}
                >
                  {record.checkItem}
                </span>
                {record.notes}
              </li>
            ))}
          </ul>
        </details>
        {sources.length ? (
          <div className="mt-3 border-t border-line pt-2">
            <div className="mb-1 text-[10px] font-medium text-muted">数据来源</div>
            <div className="space-y-0.5">
              {sources.map((source) => (
                <a
                  key={source.sourceId}
                  href={source.sourceUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center justify-between text-[10px] text-faint hover:text-accent"
                >
                  <span className="uppercase tracking-wide">{source.sourceName}</span>
                  <ExternalLinkIcon size={9} />
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="card p-4">
        <div className="kicker mb-2">我的笔记</div>
        <NoteEditor paperId={paper.id} initial={userRecord?.note ?? ""} />
      </div>

      <div className="card p-4">
        <div className="kicker mb-2.5">维护操作</div>
        <div className="flex flex-col gap-2">
          <ActionButton
            endpoint={`/api/papers/${paper.id}/analysis`}
            body={{ force: true }}
            label={hasAnalysis ? "重新生成精讲" : "生成精讲"}
            pendingLabel="排队中…"
            variant="secondary"
            size="sm"
            icon={<RefreshCw size={12} />}
            redirectTo="/agent?job={jobId}"
          />
          <ActionButton
            endpoint={`/api/papers/${paper.id}/reverify`}
            label="重新核验论文"
            pendingLabel="排队中…"
            variant="secondary"
            size="sm"
            icon={<ShieldCheck size={12} />}
            redirectTo="/agent?job={jobId}"
          />
          <a
            href={`/api/export/papers/${paper.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <Download size={12} /> 导出 Markdown
          </a>
          <a
            href={`/api/export/bibtex?ids=${paper.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] text-ink-2 hover:border-line-strong"
          >
            <Download size={12} /> 导出 BibTeX
          </a>
        </div>
        <p className="mt-3 text-[9.5px] leading-4 text-faint">
          分析任务由后台 worker 执行；运行状态可在 Agent 页面查看真实日志。
        </p>
      </div>

      <div className="rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-[10px] leading-5 text-faint">
        <div className="mb-1 flex items-center gap-1 font-medium text-muted">
          <FlaskConical size={11} /> 科研使用提示
        </div>
        本平台只提供文献理解与研究证据分析，不提供可照搬的实验操作参数、序列设计或 protocol。涉及实验设计请回到原始论文并遵循所在机构规范。
      </div>
    </aside>
  );
}

function Meta({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-faint">{label}</dt>
      <dd className="truncate text-right text-ink-2" title={title ?? value}>
        {value}
      </dd>
    </div>
  );
}
