import { NextResponse } from "next/server";
import { getWeeklyReport } from "@/server/db/repo/knowledge";
import { safeFilename } from "@/server/exports/paper";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const report = getWeeklyReport(id);
  if (!report) return NextResponse.json({ error: "周报不存在" }, { status: 404 });

  let markdown = report.contentMd;
  if (!markdown && report.content) {
    markdown = [`# ${report.content.title}`, "", `> ${report.content.period_label}`, ""].join("\n");
    for (const section of report.content.sections) {
      markdown += `## ${section.heading}\n\n${section.body_md}\n\n`;
    }
  }

  return new NextResponse(markdown ?? `# ${report.title}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFilename(report.title)}.md"`,
    },
  });
}
