export function formatDate(date: string | null | undefined, locale = "zh-CN"): string {
  if (!date) return "日期未知";
  const value = date.length === 10 ? `${date}T00:00:00Z` : date;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

export function formatDateLong(date: string | null | undefined, locale = "zh-CN"): string {
  if (!date) return "日期未知";
  const value = date.length === 10 ? `${date}T00:00:00Z` : date;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(parsed);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}

export function formatDateTimeZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(parsed);
  } catch {
    return formatDateTime(iso);
  }
}

export function formatTimeZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "—";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(parsed);
  } catch {
    return iso.slice(11, 19);
  }
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  const diff = Date.now() - time;
  const minutes = Math.round(diff / 60000);
  if (Math.abs(minutes) < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatDate(iso.slice(0, 10));
}

export function authorsLine(authors: string[] | undefined, max = 4): string {
  if (!authors?.length) return "作者信息未收录";
  const shown = authors.slice(0, max).join(" · ");
  return authors.length > max ? `${shown} 等 ${authors.length} 位作者` : shown;
}

export function scoreTone(score: number | null | undefined): "good" | "mid" | "low" | "none" {
  if (score == null) return "none";
  if (score >= 80) return "good";
  if (score >= 65) return "mid";
  return "low";
}

export function clampText(value: string | null | undefined, max: number): string {
  if (!value) return "";
  return value.length <= max ? value : `${value.slice(0, max).trimEnd()}…`;
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/** Plain-text excerpt for cards; strips Markdown tables/links/emphasis. */
export function markdownExcerpt(markdown: string | null | undefined, max = 200): string {
  if (!markdown) return "";
  const meaningful = markdown
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("|") &&
        !/^#{1,6}\s/.test(line) &&
        !/^-{3,}$/.test(line) &&
        !/^```/.test(line),
    )
    .join(" ");

  const text = meaningful
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}
