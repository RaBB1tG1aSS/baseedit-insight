import { NextResponse } from "next/server";
import { z } from "zod";
import { getAcceptedPaperById } from "@/server/db/repo/papers";
import { createJob } from "@/server/db/repo/jobs";
import { importManualFullText, removeManualFullText } from "@/server/fulltext/manual";
import { extractPdfText, isPdfBytes } from "@/server/fulltext/pdf";

export const dynamic = "force-dynamic";

const MAX_PDF_BYTES = 25 * 1024 * 1024;

const bodySchema = z.object({
  text: z.string().min(500).max(500_000),
  generate: z.boolean().optional(),
});

interface SubmitInput {
  text: string;
  generate: boolean;
  source: "text" | "pdf";
  pages?: number;
}

async function readPdfForm(form: FormData): Promise<SubmitInput | NextResponse> {
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少 PDF 文件" }, { status: 400 });
  }
  if (file.size > MAX_PDF_BYTES) {
    return NextResponse.json({ error: "PDF 不能超过 25 MB" }, { status: 413 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isPdfBytes(bytes)) {
    return NextResponse.json({ error: "文件不是有效的 PDF" }, { status: 400 });
  }

  let extracted: { text: string; pages: number };
  try {
    extracted = await extractPdfText(bytes);
  } catch (error) {
    return NextResponse.json(
      { error: `PDF 解析失败：${error instanceof Error ? error.message : String(error)}` },
      { status: 400 },
    );
  }

  if (extracted.text.replace(/\s/g, "").length < 500) {
    return NextResponse.json(
      {
        error:
          "未能从 PDF 中提取到足够的正文文本。该文件可能是扫描版/图片版 PDF，请先做 OCR，或直接复制文本后粘贴导入。",
      },
      { status: 400 },
    );
  }

  return {
    text: extracted.text,
    pages: extracted.pages,
    source: "pdf",
    generate: String(form.get("generate") ?? "") === "true",
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = getAcceptedPaperById(id);
  if (!paper) return NextResponse.json({ error: "论文不存在或未正式入库" }, { status: 404 });

  const contentType = request.headers.get("content-type") ?? "";
  let input: SubmitInput;

  if (contentType.includes("multipart/form-data")) {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "无法读取上传的 PDF" }, { status: 400 });
    }
    const parsedForm = await readPdfForm(form);
    if (parsedForm instanceof NextResponse) return parsedForm;
    input = parsedForm;
  } else {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "请求体必须是 JSON 或 multipart/form-data" }, { status: 400 });
    }
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "原文长度需在 500–500,000 字符之间，并确保粘贴的是论文正文" },
        { status: 400 },
      );
    }
    input = { text: parsed.data.text, generate: parsed.data.generate === true, source: "text" };
  }

  let result: ReturnType<typeof importManualFullText>;
  try {
    result = importManualFullText(id, input.text);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }

  let job: { id: string } | null = null;
  let created = false;
  if (input.generate) {
    const jobResult = createJob(
      "manual_analysis",
      { paperId: id, figuresOnly: false, force: true },
      { requestedBy: "user", maxAttempts: 1 },
    );
    job = jobResult.job;
    created = jobResult.created;
  }

  const origin =
    input.source === "pdf" ? `PDF（${input.pages ?? "?"} 页）` : "文本";
  const truncatedNote = result.truncated ? "（超出上限的部分已截断）" : "";
  return NextResponse.json(
    {
      sections: result.sections,
      chars: result.chars,
      truncated: result.truncated,
      source: input.source,
      pages: input.pages ?? null,
      job,
      message: job
        ? `已从${origin}导入 ${result.sections} 个章节${truncatedNote}，全文级精讲任务已排队`
        : `已从${origin}导入 ${result.sections} 个章节，共 ${result.chars.toLocaleString()} 字符${truncatedNote}`,
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
