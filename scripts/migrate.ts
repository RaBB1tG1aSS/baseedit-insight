import { getDb } from "../src/server/db/client";
import { resolveDatabasePath } from "../src/server/env";

const db = getDb();
const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
  .all() as { name: string }[];

console.log("Database:", resolveDatabasePath());
console.log("Tables:", tables.map((table) => table.name).join(", "));
console.log(
  "Migrations:",
  (db.prepare("SELECT version, applied_at FROM schema_migrations ORDER BY version").all() as {
    version: string;
    applied_at: string;
  }[])
    .map((row) => `${row.version} @ ${row.applied_at}`)
    .join(", "),
);
