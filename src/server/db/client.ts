import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { resolveDatabasePath } from "../env";
import { MIGRATIONS } from "./migrations";

export type Db = Database.Database;

declare global {
  // eslint-disable-next-line no-var
  var __baseedit_db__: Db | undefined;
}

function open(): Db {
  const file = resolveDatabasePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });

  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 8000");
  db.pragma("synchronous = NORMAL");
  migrate(db);
  return db;
}

function checksum(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 16);
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      checksum   TEXT NOT NULL
    );
  `);

  const applied = new Map<string, string>(
    db
      .prepare("SELECT version, checksum FROM schema_migrations")
      .all()
      .map((r) => {
        const row = r as { version: string; checksum: string };
        return [row.version, row.checksum] as [string, string];
      }),
  );

  for (const migration of MIGRATIONS) {
    const sum = checksum(migration.sql);
    const previous = applied.get(migration.id);
    if (previous) {
      if (previous !== sum) {
        throw new Error(
          `Migration ${migration.id} checksum changed after being applied. ` +
            `Create a new migration instead of editing an applied one.`,
        );
      }
      continue;
    }

    const run = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_migrations (version, applied_at, checksum) VALUES (?, ?, ?)",
      ).run(migration.id, new Date().toISOString(), sum);
    });
    run.immediate();
  }
}

export function getDb(): Db {
  if (!globalThis.__baseedit_db__) {
    globalThis.__baseedit_db__ = open();
  }
  return globalThis.__baseedit_db__;
}

export function withTransaction<T>(fn: (db: Db) => T): T {
  const db = getDb();
  return db.transaction(fn)(db);
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayInZone(timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}
