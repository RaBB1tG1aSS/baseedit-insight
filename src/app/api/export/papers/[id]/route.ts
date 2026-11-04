import { NextResponse } from "next/server";
import { getAcceptedPaperById } from "@/server/db/repo/papers";
import { getFigures, getLatestAnalysis, getSources, getVerificationRecords } from "@/server/db/repo/analysis";
import { deepReadToMarkdown, safeFilename } from "@/server/exports/paper";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = getAcceptedPaperById(id);
  if (!paper) return NextResponse.json({ error: "论文不存在或未正式入库" }, { status: 404 });

  const markdown = deepReadToMarkdown({
    paper,
    analysis: getLatestAnalysis(paper.id, "deep_read"),
    figures: getFigures(paper.id),
    sources: getSources(paper.id),
    verifications: getVerificationRecords(paper.id, 40),
  });

  return new NextResponse(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(paper.titleZh || paper.title)}.md"`,
    },
  });
}
