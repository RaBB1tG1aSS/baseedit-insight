/** Time-zone helpers shared by the scheduler, pipeline and dashboard. */

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sunday
  date: string; // YYYY-MM-DD
}

export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const map: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    map[part.type] = part.value;
  }
  const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const weekday = Math.max(0, weekdayNames.indexOf(map.weekday ?? "Sun"));
  const year = Number(map.year);
  const month = Number(map.month);
  const day = Number(map.day);
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return {
    year,
    month,
    day,
    hour,
    minute: Number(map.minute),
    weekday,
    date: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
  };
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
  return (asUtc - instant.getTime()) / 60000;
}

/** Converts a wall-clock time in `timeZone` to the corresponding UTC instant. */
export function zonedToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  let guess = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i += 1) {
    const offset = offsetMinutes(new Date(guess), timeZone);
    guess = Date.UTC(year, month - 1, day, hour, minute) - Math.round(offset) * 60000;
  }
  return new Date(guess);
}

export function localDateStartIso(date: string, timeZone: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return zonedToUtc(year, month, day, 0, 0, timeZone).toISOString();
}

export function localDateEndIso(date: string, timeZone: string): string {
  const next = addDays(date, 1);
  return localDateStartIso(next, timeZone);
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

export function diffDays(a: string, b: string): number {
  const left = Date.parse(`${a}T00:00:00Z`);
  const right = Date.parse(`${b}T00:00:00Z`);
  return Math.round((left - right) / 86400000);
}

/** Monday-based week containing `date` (prompt uses Sun-generated weeklies). */
export function weekOf(date: string): { start: string; end: string } {
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
  const offsetToMonday = weekday === 0 ? 6 : weekday - 1;
  const start = addDays(date, -offsetToMonday);
  return { start, end: addDays(start, 6) };
}

export function lastSevenDays(today: string): { start: string; end: string } {
  return { start: addDays(today, -6), end: today };
}

export function parseTime(hhmm: string): { hour: number; minute: number } {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return { hour: 8, minute: 0 };
  return {
    hour: Math.min(23, Math.max(0, Number(match[1]))),
    minute: Math.min(59, Math.max(0, Number(match[2]))),
  };
}

function nextWeekdayDate(from: string, weekday: number, includeToday: boolean): string {
  const [year, month, day] = from.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  let delta = (weekday - current + 7) % 7;
  if (delta === 0 && !includeToday) delta = 7;
  return addDays(from, delta);
}

export interface NextRun {
  date: string;
  iso: string;
}

export function nextRun(
  timeZone: string,
  hhmm: string,
  options: { weekday?: number } = {},
): NextRun {
  const { hour, minute } = parseTime(hhmm);
  const now = new Date();
  const today = zonedParts(now, timeZone);

  let targetDate = options.weekday != null
    ? nextWeekdayDate(today.date, options.weekday, true)
    : today.date;

  let target = zonedToUtc(
    Number(targetDate.slice(0, 4)),
    Number(targetDate.slice(5, 7)),
    Number(targetDate.slice(8, 10)),
    hour,
    minute,
    timeZone,
  );

  let guard = 0;
  while (target.getTime() <= now.getTime() && guard < 10) {
    targetDate = addDays(targetDate, options.weekday != null ? 7 : 1);
    target = zonedToUtc(
      Number(targetDate.slice(0, 4)),
      Number(targetDate.slice(5, 7)),
      Number(targetDate.slice(8, 10)),
      hour,
      minute,
      timeZone,
    );
    guard += 1;
  }

  return { date: targetDate, iso: target.toISOString() };
}

export function formatDateLabel(date: string | null | undefined, locale = "zh-CN"): string {
  if (!date) return "日期未知";
  const value = date.length === 10 ? `${date}T00:00:00Z` : date;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return date;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}
