import { NextResponse } from "next/server";
import { z } from "zod";
import { getAcceptedPaperById } from "@/server/db/repo/papers";
import {
  getUserRecord,
  setFavorite,
  setNote,
  setReadStatus,
  setReadingProgress,
} from "@/server/db/repo/user";

export const dynamic = "force-dynamic";

const patchSchema = z
  .object({
    favorite: z.boolean().optional(),
    readStatus: z.enum(["unread", "reading", "read"]).optional(),
    progress: z.number().min(0).max(1).optional(),
    note: z.string().max(20000).optional(),
  })
  .strict();

export async function GET(_request: Request, context: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await context.params;
  if (!getAcceptedPaperById(paperId)) {
    return NextResponse.json({ error: "论文不存在或未正式入库" }, { status: 404 });
  }
  return NextResponse.json({ record: getUserRecord(paperId) });
}

export async function PATCH(request: Request, context: { params: Promise<{ paperId: string }> }) {
  const { paperId } = await context.params;
  if (!getAcceptedPaperById(paperId)) {
    return NextResponse.json({ error: "论文不存在或未正式入库" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON 请求体" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "参数无效" }, { status: 400 });
  }

  let record = getUserRecord(paperId);
  if (parsed.data.favorite !== undefined) record = setFavorite(paperId, parsed.data.favorite);
  if (parsed.data.readStatus !== undefined) record = setReadStatus(paperId, parsed.data.readStatus);
  if (parsed.data.progress !== undefined) record = setReadingProgress(paperId, parsed.data.progress);
  if (parsed.data.note !== undefined) record = setNote(paperId, parsed.data.note);

  return NextResponse.json({ record });
}
