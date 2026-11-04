import { NextResponse } from "next/server";
import { z } from "zod";
import { createJob } from "@/server/db/repo/jobs";
import { getSettings } from "@/server/db/repo/settings";
import { todayInZone } from "@/server/db/client";
import { weekOf } from "@/server/utils/time";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    weekEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    force: z.boolean().optional(),
  })
  .strict();

export async function POST(request: Request) {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  const settings = getSettings();
  const week = weekOf(todayInZone(settings.timezone));
  const weekStart = parsed.data.weekStart ?? week.start;
  const weekEnd = parsed.data.weekEnd ?? week.end;

  const { job, created } = createJob(
    "weekly_report",
    { weekStart, weekEnd, force: parsed.data.force === true },
    { requestedBy: "user", maxAttempts: 1 },
  );

  return NextResponse.json(
    { job, created, message: created ? "周报生成任务已排队" : "已有相同的周报任务在队列中" },
    { status: created ? 201 : 200 },
  );
}
