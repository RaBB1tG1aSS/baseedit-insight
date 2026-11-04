import { NextResponse } from "next/server";
import { getPaperById } from "@/server/db/repo/papers";
import { createJob } from "@/server/db/repo/jobs";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = getPaperById(id);
  if (!paper) return NextResponse.json({ error: "论文不存在" }, { status: 404 });

  const { job, created } = createJob(
    "reverify_paper",
    { paperId: id },
    { requestedBy: "user", maxAttempts: 1 },
  );
  return NextResponse.json(
    { job, created, message: created ? "重新核验任务已排队" : "已有相同的核验任务在队列中" },
    { status: created ? 201 : 200 },
  );
}
