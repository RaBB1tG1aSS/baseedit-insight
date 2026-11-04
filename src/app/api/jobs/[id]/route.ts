import { NextResponse } from "next/server";
import { cancelJob, getJob, getJobLogs } from "@/server/db/repo/jobs";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  return NextResponse.json({ job, logs: getJobLogs(id) });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = getJob(id);
  if (!job) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
  if (job.status !== "queued" && job.status !== "running") {
    return NextResponse.json({ error: "只能取消排队中或运行中的任务" }, { status: 409 });
  }
  cancelJob(id);
  return NextResponse.json({ ok: true });
}
