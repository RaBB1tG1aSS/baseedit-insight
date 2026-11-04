import type { PaperSummary, UserRecord } from "@/lib/types";
import { getDb, nowIso } from "../client";
import { PAPER_COLUMNS, mapPaperSummary, mapUserRecord, type PaperRow } from "../mappers";

function ensure(paperId: string): void {
  getDb()
    .prepare(
      `INSERT INTO user_records (paper_id, favorite, read_status, reading_progress, note, last_opened_at, updated_at)
       VALUES (?, 0, 'unread', 0, '', NULL, ?)
       ON CONFLICT(paper_id) DO NOTHING`,
    )
    .run(paperId, nowIso());
}

export function getUserRecord(paperId: string): UserRecord | null {
  const row = getDb().prepare("SELECT * FROM user_records WHERE paper_id = ?").get(paperId) as
    | Record<string, unknown>
    | undefined;
  return row ? mapUserRecord(row) : null;
}

export function setFavorite(paperId: string, favorite: boolean): UserRecord {
  ensure(paperId);
  getDb()
    .prepare("UPDATE user_records SET favorite = ?, updated_at = ? WHERE paper_id = ?")
    .run(favorite ? 1 : 0, nowIso(), paperId);
  return getUserRecord(paperId)!;
}

export function setReadStatus(paperId: string, status: "unread" | "reading" | "read"): UserRecord {
  ensure(paperId);
  getDb()
    .prepare(
      `UPDATE user_records SET read_status = ?, reading_progress = CASE WHEN ? = 'read' THEN 1 ELSE reading_progress END, updated_at = ? WHERE paper_id = ?`,
    )
    .run(status, status, nowIso(), paperId);
  return getUserRecord(paperId)!;
}

export function setReadingProgress(paperId: string, progress: number): UserRecord {
  ensure(paperId);
  const clamped = Math.max(0, Math.min(1, progress));
  const status = clamped >= 0.95 ? "read" : clamped > 0 ? "reading" : "unread";
  getDb()
    .prepare(
      `UPDATE user_records SET reading_progress = ?, read_status = ?, updated_at = ? WHERE paper_id = ?`,
    )
    .run(clamped, status, nowIso(), paperId);
  return getUserRecord(paperId)!;
}

export function setNote(paperId: string, note: string): UserRecord {
  ensure(paperId);
  getDb()
    .prepare("UPDATE user_records SET note = ?, updated_at = ? WHERE paper_id = ?")
    .run(note, nowIso(), paperId);
  return getUserRecord(paperId)!;
}

export function recordOpen(paperId: string): void {
  const db = getDb();
  const ts = nowIso();
  ensure(paperId);
  db.prepare("INSERT INTO reading_events (paper_id, opened_at) VALUES (?, ?)").run(paperId, ts);
  db.prepare(
    `UPDATE user_records SET last_opened_at = ?, read_status = CASE WHEN read_status='unread' THEN 'reading' ELSE read_status END, updated_at = ? WHERE paper_id = ?`,
  ).run(ts, ts, paperId);
}

export function getReadingHistory(limit = 6): { paper: PaperSummary; openedAt: string; progress: number }[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS}, MAX(e.opened_at) AS opened_at, COALESCE(u.reading_progress,0) AS progress
       FROM reading_events e
       JOIN papers p ON p.id = e.paper_id
       LEFT JOIN user_records u ON u.paper_id = p.id
       WHERE p.status = 'accepted'
       GROUP BY e.paper_id
       ORDER BY opened_at DESC LIMIT ?`,
    )
    .all(limit) as (PaperRow & { opened_at: string; progress: number })[];
  return rows.map((row) => ({
    paper: mapPaperSummary(row),
    openedAt: row.opened_at,
    progress: Number(row.progress ?? 0),
  }));
}

export function countReadingThisWeek(sinceIso: string): number {
  const row = getDb()
    .prepare("SELECT COUNT(DISTINCT paper_id) AS n FROM reading_events WHERE opened_at >= ?")
    .get(sinceIso) as { n: number };
  return row.n;
}

export function getFavoriteSummaries(limit = 20): PaperSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT ${PAPER_COLUMNS} FROM papers p
       JOIN user_records u ON u.paper_id = p.id
       WHERE p.status='accepted' AND u.favorite = 1
       ORDER BY u.updated_at DESC LIMIT ?`,
    )
    .all(limit) as PaperRow[];
  return rows.map(mapPaperSummary);
}
