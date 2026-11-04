import Link from "next/link";
import { ArrowUpRight, BookOpen, Circle, FileText, Quote, Star } from "lucide-react";
import type { PaperSummary, UserRecord } from "@/lib/types";
import { FOCUS_LABEL } from "@/lib/constants";
import { authorsLine, formatDate } from "@/lib/format";
import { Badge, PeerReviewBadge, RetractionBadge, cx } from "./ui";
import { FavoriteButton } from "./library-controls";

export type PaperCardData = PaperSummary & { userRecord?: UserRecord | null };

export function PaperCard({
  paper,
  showFavorite = true,
  className,
}: {
  paper: PaperCardData;
  showFavorite?: boolean;
  className?: string;
}) {
  const recLabel =
    paper.recommendationCategory === "latest"
      ? "前沿精选"
      : paper.recommendationCategory === "landmark"
        ? "经典奠基"
        : null;

  return (
    <article
      className={cx(
        "card group relative flex flex-col gap-3 p-5 transition duration-300 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {recLabel ? <Badge variant={paper.recommendationCategory === "landmark" ? "gold" : "accent"}>{recLabel}</Badge> : null}
          <PeerReviewBadge status={paper.peerReviewStatus} />
          <RetractionBadge status={paper.retractionStatus} />
          {paper.fullTextAccessStatus === "oa_fulltext" ? (
            <Badge variant="outline">
              <BookOpen size={10} /> 全文
            </Badge>
          ) : (
            <Badge variant="outline">
              <FileText size={10} /> 摘要
            </Badge>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div
            className="flex h-9 w-11 flex-col items-center justify-center rounded-lg border border-line bg-bg-elevated"
            title="综合质量评分"
          >
            <span className="num text-[13px] font-semibold leading-none text-ink">
              {paper.qualityScore == null ? "—" : Math.round(paper.qualityScore)}
            </span>
            <span className="mt-0.5 text-[8px] text-faint">/100</span>
          </div>
          {showFavorite ? <FavoriteButton paperId={paper.id} initial={Boolean(paper.userRecord?.favorite)} compact /> : null}
        </div>
      </div>

      <div>
        <Link href={`/papers/${paper.id}`} className="block">
          <h3 className="display text-[17px] font-semibold leading-[1.45] text-ink transition group-hover:text-accent-strong md:text-[18px]">
            {paper.title}
          </h3>
          {paper.titleZh ? (
            <p className="mt-1.5 text-[12.5px] leading-6 text-muted">{paper.titleZh}</p>
          ) : null}
        </Link>
      </div>

      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 border-t border-line/70 pt-3">
        <div className="min-w-0">
          <div className="truncate text-[11.5px] text-muted">{authorsLine(paper.authors, 3)}</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10.5px] text-faint">
            <span className="font-medium text-ink-2">{paper.journal ?? "期刊未知"}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(paper.publicationDate)}</span>
            {paper.citationCount > 0 ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-0.5">
                  <Quote size={9} /> {paper.citationCount}
                </span>
              </>
            ) : null}
            {paper.userRecord?.readStatus === "reading" ? (
              <>
                <span aria-hidden>·</span>
                <span className="inline-flex items-center gap-1 text-accent">
                  <Circle size={5} className="fill-current" /> 在读
                </span>
              </>
            ) : null}
            {paper.userRecord?.readStatus === "read" ? (
              <>
                <span aria-hidden>·</span>
                <span className="text-success">已读</span>
              </>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {paper.focusAreas.slice(0, 2).map((area) => (
            <Badge key={area} variant="outline">
              {FOCUS_LABEL[area]}
            </Badge>
          ))}
          <Link
            href={`/papers/${paper.id}`}
            aria-label="阅读论文"
            className="ml-1 hidden h-7 w-7 items-center justify-center rounded-full text-faint transition group-hover:flex group-hover:text-accent"
          >
            <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function PaperCompactRow({ paper, meta }: { paper: PaperSummary; meta?: string }) {
  return (
    <Link
      href={`/papers/${paper.id}`}
      className="group flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition hover:bg-surface-2"
    >
      <div className="mt-1 flex h-7 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-bg-elevated">
        <span className="num text-[11px] font-semibold text-ink-2">
          {paper.qualityScore == null ? "—" : Math.round(paper.qualityScore)}
        </span>
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 text-[12.5px] font-medium leading-5 text-ink group-hover:text-accent-strong">
          {paper.titleZh || paper.title}
        </div>
        <div className="mt-0.5 truncate text-[10.5px] text-faint">
          {meta ?? `${paper.journal ?? "未知期刊"} · ${formatDate(paper.publicationDate)}`}
        </div>
      </div>
    </Link>
  );
}

export function PaperMiniItem({
  title,
  meta,
  href,
  icon,
}: {
  title: string;
  meta: string;
  href: string;
  icon?: React.ReactNode;
}) {
  return (
    <Link href={href} className="group flex items-start gap-2.5 rounded-lg p-1.5 transition hover:bg-surface-2">
      <span className="mt-0.5 text-faint">{icon ?? <Star size={12} />}</span>
      <span className="min-w-0">
        <span className="line-clamp-2 block text-[12px] leading-5 text-ink-2 group-hover:text-ink">{title}</span>
        <span className="mt-0.5 block text-[10px] text-faint">{meta}</span>
      </span>
    </Link>
  );
}
