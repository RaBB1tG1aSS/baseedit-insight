import { NextResponse } from "next/server";
import { getAcceptedPaperById } from "@/server/db/repo/papers";
import { recordOpen } from "@/server/db/repo/user";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await context.params;
  if (!getAcceptedPaperById(paperId)) {
    return NextResponse.json({ error: "论文不存在或未正式入库" }, { status: 404 });
  }
  recordOpen(paperId);
  return NextResponse.json({ ok: true });
}
