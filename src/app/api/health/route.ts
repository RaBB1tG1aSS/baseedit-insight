import { NextResponse } from "next/server";
import { countByStatus } from "@/server/db/repo/papers";
import { getWorkerStatus } from "@/server/db/repo/dashboard";
import { aiStatus } from "@/server/ai/client";
import { resolveDatabasePath } from "@/server/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const worker = getWorkerStatus();
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    database: resolveDatabasePath(),
    counts: countByStatus(),
    worker,
    ai: aiStatus(),
  });
}
