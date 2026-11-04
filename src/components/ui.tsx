import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, CircleAlert, FileText, Lock } from "lucide-react";
import type {
  EvidenceNature,
  FocusArea,
  PaperStatus,
  PeerReviewStatus,
  RetractionStatus,
} from "@/lib/types";
import { FOCUS_LABEL } from "@/lib/constants";
import { scoreTone } from "@/lib/format";

export function cx(...values: (string | false | null | undefined)[]): string {
  return values.filter(Boolean).join(" ");
}

type BadgeVariant = "default" | "accent" | "gold" | "danger" | "warn" | "success" | "outline";

const BADGE_STYLES: Record<BadgeVariant, string> = {
  default: "bg-surface-2 text-ink-2 border-transparent",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  gold: "bg-gold-soft text-gold border-transparent",
  danger: "bg-danger-soft text-danger border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  success: "bg-success-soft text-success border-transparent",
  outline: "bg-transparent text-muted border-line",
};

export function Badge({
  children,
  variant = "default",
  className,
  title,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-5 tracking-wide",
        BADGE_STYLES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Kicker({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("kicker", className)}>{children}</div>;
}

export function SectionHeading({
  kicker,
  title,
  description,
  action,
  className,
}: {
  kicker?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="max-w-2xl">
        {kicker ? <Kicker className="mb-2">{kicker}</Kicker> : null}
        <h2 className="display text-2xl font-semibold text-ink md:text-[1.7rem]">{title}</h2>
        {description ? <p className="mt-2 text-sm leading-6 text-muted">{description}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function ScoreRing({
  score,
  size = 88,
  label = "综合评分",
  stroke = 6,
}: {
  score: number | null;
  size?: number;
  label?: string;
  stroke?: number;
}) {
  const value = score ?? 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (Math.max(0, Math.min(100, value)) / 100) * circumference;
  const tone = scoreTone(score);
  const color =
    tone === "good" ? "var(--success)" : tone === "mid" ? "var(--accent)" : tone === "low" ? "var(--warn)" : "var(--faint)";

  return (
    <div className="flex flex-col items-center gap-1.5" title={label}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--line)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-xl font-semibold leading-none text-ink">
            {score == null ? "—" : Math.round(score)}
          </span>
          <span className="mt-0.5 text-[10px] text-faint">/ 100</span>
        </div>
      </div>
      <span className="text-[10px] tracking-wide text-faint">{label}</span>
    </div>
  );
}

export function ProgressBar({
  value,
  max = 100,
  className,
  tone = "accent",
}: {
  value: number;
  max?: number;
  className?: string;
  tone?: "accent" | "gold" | "success";
}) {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  const color = tone === "gold" ? "var(--gold)" : tone === "success" ? "var(--success)" : "var(--accent)";
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-surface-3", className)}>
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${percent}%`, background: color }} />
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="card-flat px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium tracking-wide text-muted">{label}</span>
        {icon ? <span className="text-faint">{icon}</span> : null}
      </div>
      <div className="mt-1.5 num text-2xl font-semibold tracking-tight text-ink">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-faint">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">
        {icon ?? <FileText size={20} />}
      </div>
      <div>
        <h3 className="display text-lg font-semibold text-ink">{title}</h3>
        <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-muted">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function FocusBadge({ area }: { area: FocusArea }) {
  return <Badge variant="outline">{FOCUS_LABEL[area]}</Badge>;
}

export function PeerReviewBadge({ status }: { status: PeerReviewStatus }) {
  if (status === "peer_reviewed") return <Badge variant="success">同行评审</Badge>;
  if (status === "preprint") return <Badge variant="warn">预印本</Badge>;
  return <Badge variant="outline">评审状态未知</Badge>;
}

export function RetractionBadge({ status }: { status: RetractionStatus }) {
  if (status === "retracted") return <Badge variant="danger">已撤稿</Badge>;
  if (status === "expression_of_concern") return <Badge variant="warn">关注声明</Badge>;
  if (status === "correction") return <Badge variant="warn">有勘误</Badge>;
  return null;
}

const STATUS_LABEL: Record<PaperStatus, string> = {
  discovered: "已发现",
  candidate: "候选",
  metadata_verified: "元数据已核验",
  quality_assessed: "已评估",
  accepted: "已入库",
  rejected: "未通过",
  needs_review: "待人工复核",
};

export function StatusBadge({ status }: { status: PaperStatus }) {
  const variant: BadgeVariant =
    status === "accepted"
      ? "success"
      : status === "rejected"
        ? "danger"
        : status === "needs_review"
          ? "warn"
          : "outline";
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

const NATURE_LABEL: Record<EvidenceNature, { label: string; variant: BadgeVariant }> = {
  reported_fact: { label: "论文事实", variant: "success" },
  author_interpretation: { label: "作者解释", variant: "accent" },
  ai_synthesis: { label: "AI 综合分析", variant: "gold" },
  hypothesis: { label: "推测", variant: "warn" },
};

export function EvidenceNatureBadge({ nature }: { nature: EvidenceNature }) {
  const meta = NATURE_LABEL[nature] ?? NATURE_LABEL.ai_synthesis;
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

export function ExternalLink({
  href,
  children,
  className,
}: {
  href: string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  if (!href) return <span className={cx("inline-flex items-center gap-1 text-faint", className)}>{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={cx("inline-flex items-center gap-1 text-accent hover:text-accent-strong", className)}
    >
      {children}
      <ArrowUpRight size={12} />
    </a>
  );
}

export function InlineNotice({
  tone = "warn",
  title,
  children,
  icon,
}: {
  tone?: "warn" | "danger" | "accent" | "muted";
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  const styles = {
    warn: "border-warn/30 bg-warn-soft text-warn",
    danger: "border-danger/30 bg-danger-soft text-danger",
    accent: "border-accent/25 bg-accent-soft text-accent-ink",
    muted: "border-line bg-surface-2 text-muted",
  }[tone];
  return (
    <div className={cx("flex gap-3 rounded-xl border px-4 py-3 text-sm", styles)}>
      <span className="mt-0.5 shrink-0 opacity-80">{icon ?? <CircleAlert size={16} />}</span>
      <div>
        <div className="font-medium">{title}</div>
        {children ? <div className="mt-1 text-[13px] leading-6 opacity-90">{children}</div> : null}
      </div>
    </div>
  );
}

export function LockedNote({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-faint">
      <Lock size={11} />
      {children}
    </div>
  );
}

export function TextLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-strong", className)}>
      {children}
    </Link>
  );
}
