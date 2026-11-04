import { NextResponse } from "next/server";
import { z } from "zod";
import { getAcceptedPaperById } from "@/server/db/repo/papers";
import { createJob } from "@/server/db/repo/jobs";

export const dynamic = "force-dynamic";

const schema = z.object({
  figuresOnly: z.boolean().optional(),
  force: z.boolean().optional(),
  maxFigures: z.number().int().min(1).max(20).optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = getAcceptedPaperById(id);
  if (!paper) return NextResponse.json({ error: "论文不存在或未正式入库" }, { status: 404 });

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  const figuresOnly = parsed.data.figuresOnly === true;
  const type = figuresOnly ? "reanalyze_paper" : "manual_analysis";
  const { job, created } = createJob(
    type,
    {
      paperId: id,
      figuresOnly,
      force: parsed.data.force === true,
      maxFigures: parsed.data.maxFigures,
    },
    { requestedBy: "user", maxAttempts: 1 },
  );

  return NextResponse.json(
    {
      job,
      created,
      message: created
        ? figuresOnly
          ? "图表分析任务已排队"
          : "精讲生成任务已排队"
        : "相同任务已在队列中",
    },
    { status: created ? 201 : 200 },
  );
}
