import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createJob, getJobStats, listJobs } from "@/server/db/repo/jobs";
import { getWorkerStatus } from "@/server/db/repo/dashboard";
import type { JobType } from "@/lib/types";

export const dynamic = "force-dynamic";

const JOB_TYPES: JobType[] = [
  "daily_pipeline",
  "weekly_report",
  "search_only",
  "manual_analysis",
  "reanalyze_paper",
  "knowledge_update",
  "reverify_paper",
  "journal_metrics_refresh",
  "status_watch",
];

const payloadSchema = z
  .object({
    date: z.string().optional(),
    paperId: z.string().optional(),
    paperIds: z.array(z.string()).optional(),
    query: z.string().max(500).optional(),
    weekStart: z.string().optional(),
    weekEnd: z.string().optional(),
    force: z.boolean().optional(),
    forceWeekly: z.boolean().optional(),
    figuresOnly: z.boolean().optional(),
    sinceDays: z.number().int().min(1).max(3650).optional(),
    limit: z.number().int().min(1).max(200).optional(),
    maxDeepReads: z.number().int().min(0).max(10).optional(),
    maxFigures: z.number().int().min(0).max(30).optional(),
  })
  .strict();

const createSchema = z.object({
  type: z.enum(JOB_TYPES as [JobType, ...JobType[]]),
  payload: payloadSchema.optional(),
});

const REQUIRES_PAPER: JobType[] = ["manual_analysis", "reanalyze_paper", "reverify_paper"];

export async function GET(request: NextRequest) {
  const limit = Math.min(100, Number(request.nextUrl.searchParams.get("limit") ?? 30) || 30);
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  return NextResponse.json({
    jobs: listJobs(limit),
    worker: getWorkerStatus(),
    stats: getJobStats(since),
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON 请求体" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "请求参数无效", issues: parsed.error.issues.map((issue) => issue.message) },
      { status: 400 },
    );
  }

  const { type, payload = {} } = parsed.data;
  if (REQUIRES_PAPER.includes(type) && !payload.paperId) {
    return NextResponse.json({ error: "该任务需要 paperId" }, { status: 400 });
  }

  const { job, created } = createJob(type, payload as Record<string, unknown>, {
    requestedBy: "user",
    maxAttempts: type === "daily_pipeline" ? 1 : 2,
  });

  return NextResponse.json(
    {
      job,
      created,
      worker: getWorkerStatus(),
      message: created
        ? "任务已排队，worker 将自动执行"
        : "相同任务已在队列中，未重复创建",
    },
    { status: created ? 201 : 200 },
  );
}
