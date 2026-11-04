import { NextResponse } from "next/server";
import { getAcceptedPaperById } from "@/server/db/repo/papers";
import { bibtexFilename, papersToBibtex } from "@/server/exports/bibtex";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("ids") ?? url.searchParams.get("id") ?? "";
  const ids = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (!ids.length) {
    return NextResponse.json({ error: "缺少 ids 参数" }, { status: 400 });
  }

  const papers = ids
    .map((id) => getAcceptedPaperById(id))
    .filter((paper): paper is NonNullable<typeof paper> => Boolean(paper));

  if (!papers.length) {
    return NextResponse.json({ error: "没有可导出的已核验论文" }, { status: 404 });
  }

  return new NextResponse(papersToBibtex(papers), {
    headers: {
      "Content-Type": "application/x-bibtex; charset=utf-8",
      "Content-Disposition": `attachment; filename="${bibtexFilename(papers.length)}"`,
    },
  });
}
