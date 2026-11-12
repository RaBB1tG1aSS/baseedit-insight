import { NextResponse } from "next/server";
import { z } from "zod";
import { getAcceptedPaperById } from "@/server/db/repo/papers";
import { createJob } from "@/server/db/repo/jobs";
import { importManualFullText, removeManualFullText } from "@/server/fulltext/manual";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  text: z.string().min(500).max(500_000),
  generate: z.boolean().optional(),
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = getAcceptedPaperById(id);
  if (!paper) return NextResponse.json({ error: "论文不存在或未正式入库" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "原文长度需在 500–500,000 字符之间，并确保粘贴的是论文正文" },
      { status: 400 },
    );
  }

  let result: ReturnType<typeof importManualFullText>;
  try {
    result = importManualFullText(id, parsed.data.text);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  let job: { id: string } | null = null;
  let created = false;
  if (parsed.data.generate === true) {
    const jobResult = createJob(
      "manual_analysis",
      { paperId: id, figuresOnly: false, force: true },
      { requestedBy: "user", maxAttempts: 1 },
    );
    job = jobResult.job;
    created = jobResult.created;
  }

  const truncatedNote = result.truncated ? "（超出上限的部分已截断）" : "";
  return NextResponse.json(
    {
      sections: result.sections,
      chars: result.chars,
      truncated: result.truncated,
      job,
      message: job
        ? `已导入 ${result.sections} 个章节${truncatedNote}，全文级精讲任务已排队`
        : `已导入 ${result.sections} 个章节，共 ${result.chars.toLocaleString()} 字符${truncatedNote}`,
      created,
    },
    { status: job ? 201 : 200 },
  );
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = getAcceptedPaperById(id);
  if (!paper) return NextResponse.json({ error: "论文不存在或未正式入库" }, { status: 404 });

  const removed = removeManualFullText(id);
  return NextResponse.json({
    removed,
    message: removed ? "已移除手动导入的原文" : "该论文没有手动导入的原文",
  });
}
