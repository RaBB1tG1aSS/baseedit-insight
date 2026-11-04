import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { getDb } from "@/server/db/client";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const db = getDb();
    const dir = path.join(process.cwd(), "data", "backups");
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = path.join(dir, `baseedit-${stamp}.db`);
    await db.backup(file);
    const size = fs.statSync(file).size;
    return NextResponse.json({
      ok: true,
      path: file,
      size,
      message: `备份已写入 data/backups/${path.basename(file)}（${(size / 1024).toFixed(1)} KB）`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: `备份失败：${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    );
  }
}
