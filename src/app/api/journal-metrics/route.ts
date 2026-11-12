import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getJournalMetricCoverage,
  importJournalMetricsCsv,
  listJournalMetrics,
} from "@/server/metrics/journals";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  csv: z.string().min(10).max(5_000_000),
  source: z.enum(["jcr", "custom", "snip", "sjr"]).optional(),
  year: z.number().int().min(1990).max(2100).optional(),
});

export async function GET() {
  return NextResponse.json({
    coverage: getJournalMetricCoverage(),
    metrics: listJournalMetrics(30),
  });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON 请求体" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "CSV 内容或参数无效" }, { status: 400 });
  }

  try {
    const result = importJournalMetricsCsv(parsed.data.csv, {
      source: parsed.data.source ?? "jcr",
      year: parsed.data.year,
    });
    return NextResponse.json({
      ok: true,
      ...result,
      coverage: getJournalMetricCoverage(),
      message: `已导入 ${result.imported} 条期刊指标，更新 ${result.updatedPapers} 篇论文`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
