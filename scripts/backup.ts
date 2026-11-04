import fs from "node:fs";
import path from "node:path";
import { getDb } from "../src/server/db/client";

async function main(): Promise<void> {
  const db = getDb();
  const dir = path.join(process.cwd(), "data", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const file = path.join(dir, `baseedit-${stamp}.db`);
  await db.backup(file);
  const size = fs.statSync(file).size;
  console.log(`Backup written: ${file} (${(size / 1024).toFixed(1)} KB)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
