import { NextResponse } from "next/server";
import { z } from "zod";
import { getSettings, saveSettings } from "@/server/db/repo/settings";
import { getWorkerStatus } from "@/server/db/repo/dashboard";
import { aiStatus } from "@/server/ai/client";
import { resolveDatabasePath } from "@/server/env";

export const dynamic = "force-dynamic";

const settingsSchema = z
  .object({
    timezone: z.string().min(1).max(80).optional(),
    dailyRunTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    weeklyRunDay: z.string().regex(/^[0-6]$/).optional(),
    weeklyRunTime: z.string().regex(/^\d{1,2}:\d{2}$/).optional(),
    schedulerEnabled: z.boolean().optional(),
    aiProvider: z.enum(["claude-cli", "anthropic"]).optional(),
    aiModel: z.string().max(120).optional(),
    minAcceptScore: z.number().min(0).max(100).optional(),
    minTopicRelevance: z.number().min(0).max(15).optional(),
    maxCandidatesPerRun: z.number().int().min(1).max(200).optional(),
    focusQuery: z.string().min(10).max(2000).optional(),
    ncbiEmail: z.string().max(200).optional(),
    openalexMailto: z.string().max(200).optional(),
    enableSemanticScholar: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  return NextResponse.json({
    settings: getSettings(),
    worker: getWorkerStatus(),
    ai: aiStatus(),
    databasePath: resolveDatabasePath(),
    env: {
      anthropicKeyConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
      ncbiKeyConfigured: Boolean(process.env.NCBI_API_KEY),
      semanticScholarKeyConfigured: Boolean(process.env.SEMANTIC_SCHOLAR_API_KEY),
    },
  });
}

export async function PUT(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON 请求体" }, { status: 400 });
  }

  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "设置参数无效", issues: parsed.error.issues }, { status: 400 });
  }

  if (parsed.data.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone }).format(new Date());
    } catch {
      return NextResponse.json({ error: "无效的时区名称" }, { status: 400 });
    }
  }

  const settings = saveSettings(parsed.data);
  return NextResponse.json({ settings, message: "设置已保存；worker 会在 30 秒内应用新的调度时间" });
}
