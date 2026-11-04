import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getPaperById,
  markAnalysesNeedRefresh,
  setPaperStatus,
  updatePaper,
} from "@/server/db/repo/papers";
import { addVerificationRecords, getQualityAssessment, getVerificationRecords } from "@/server/db/repo/analysis";
import { getSettings } from "@/server/db/repo/settings";
import { createJob } from "@/server/db/repo/jobs";
import { nowIso } from "@/server/db/client";

export const dynamic = "force-dynamic";

const schema = z.object({ action: z.enum(["accept", "reject", "reverify"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const paper = getPaperById(id);
  if (!paper) return NextResponse.json({ error: "论文不存在" }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "无效的 JSON 请求体" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "参数无效" }, { status: 400 });

  const { action } = parsed.data;

  if (action === "reverify") {
    const { job } = createJob("reverify_paper", { paperId: id }, { requestedBy: "user", maxAttempts: 1 });
    return NextResponse.json({ job, message: "已排队重新核验" }, { status: 202 });
  }

  if (action === "reject") {
    setPaperStatus(id, "rejected");
    addVerificationRecords(id, [
      {
        checkItem: "人工审核",
        result: "fail",
        evidenceSource: "user",
        evidence: "人工排除",
        notes: "用户将候选论文标记为排除",
      },
    ]);
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // Manual acceptance is deliberately guarded: it cannot bypass identity
  // verification, retraction checks, topic relevance or the quality threshold.
  const settings = getSettings();
  const checks = getVerificationRecords(id, 100);
  const identityPass = checks.some(
    (check) =>
      (check.checkItem === "DOI 解析" || check.checkItem === "PubMed 记录" || check.checkItem === "题名匹配核验") &&
      (check.result === "pass" || check.result === "warning"),
  );
  const retracted = paper.retractionStatus === "retracted" || checks.some(
    (check) => check.checkItem === "撤稿状态" && check.result === "fail",
  );
  const quality = getQualityAssessment(id);
  const relevance = quality?.dimensions.find((dimension) => dimension.key === "relevance")?.score ?? 0;

  const blockers: string[] = [];
  if (!identityPass) blockers.push("尚无通过的身份核验记录");
  if (retracted) blockers.push("论文存在撤稿记录");
  if ((quality?.total ?? 0) < settings.minAcceptScore) {
    blockers.push(`综合评分 ${quality?.total ?? 0} 低于门槛 ${settings.minAcceptScore}`);
  }
  if (relevance < settings.minTopicRelevance) {
    blockers.push(`领域相关性 ${relevance} 低于门槛 ${settings.minTopicRelevance}`);
  }

  if (blockers.length) {
    return NextResponse.json({ error: "无法人工通过", blockers }, { status: 409 });
  }

  updatePaper(
    id,
    {
      status: "accepted",
      verified_at: paper.verifiedAt ?? nowIso(),
    },
    "manual acceptance",
  );
  addVerificationRecords(id, [
    {
      checkItem: "人工审核",
      result: "pass",
      evidenceSource: "user",
      evidence: `质量 ${quality?.total ?? 0}/100；相关性 ${relevance}/15`,
      notes: "用户审核通过：身份、撤稿状态与质量门槛均已满足",
    },
  ]);
  markAnalysesNeedRefresh(id);

  return NextResponse.json({ ok: true, status: "accepted" });
}
