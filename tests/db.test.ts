import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dbFile = path.join(os.tmpdir(), `baseedit-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = dbFile;
process.env.APP_TIMEZONE = "Asia/Singapore";
process.env.SCHEDULER_ENABLED = "false";

const papers = await import("@/server/db/repo/papers");
const user = await import("@/server/db/repo/user");
const jobs = await import("@/server/db/repo/jobs");
const knowledge = await import("@/server/db/repo/knowledge");
const settingsRepo = await import("@/server/db/repo/settings");
const { getDb } = await import("@/server/db/client");

afterAll(() => {
  try {
    getDb().close();
  } catch {
    // already closed
  }
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.rmSync(`${dbFile}${suffix}`, { force: true });
    } catch {
      // ignore
    }
  }
});

describe("central literature database", () => {
  it("isolates candidates from verified reads until accepted", () => {
    const candidate = papers.insertPaper({
      title: "Candidate-only base editing manuscript",
      doi: "10.1000/candidate.1",
      journal: "Test Journal",
      status: "candidate",
      peerReviewStatus: "peer_reviewed",
      publicationStatus: "published",
    });

    expect(papers.getAcceptedPaperById(candidate.id)).toBeNull();
    expect(papers.searchAcceptedPapers({ q: "Candidate-only" }).total).toBe(0);

    papers.updatePaper(
      candidate.id,
      { status: "accepted", verified_at: new Date().toISOString() },
      "test acceptance",
    );

    const accepted = papers.getAcceptedPaperById(candidate.id);
    expect(accepted?.status).toBe("accepted");
    expect(papers.searchAcceptedPapers({ q: "Candidate-only" }).total).toBe(1);
  });

  it("matches existing papers through normalised DOI", () => {
    const found = papers.findPaperByExternalIds({ doi: "https://doi.org/10.1000/CANDIDATE.1" });
    expect(found).not.toBeNull();
    expect(found?.doi).toBe("10.1000/candidate.1");
  });

  it("persists personal reading state and reading history", () => {
    const paper = papers.findPaperByExternalIds({ doi: "10.1000/candidate.1" })!;
    user.setFavorite(paper.id, true);
    user.setReadStatus(paper.id, "reading");
    user.setReadingProgress(paper.id, 0.42);
    user.setNote(paper.id, "我的笔记");
    user.recordOpen(paper.id);

    const record = user.getUserRecord(paper.id);
    expect(record?.favorite).toBe(true);
    expect(record?.readStatus).toBe("reading");
    expect(record?.readingProgress).toBeCloseTo(0.42);
    expect(record?.note).toBe("我的笔记");
    expect(user.getReadingHistory(5)[0]?.paper.id).toBe(paper.id);
  });

  it("keeps one main recommendation per date", () => {
    const first = papers.insertPaper({
      title: "First base editing paper",
      doi: "10.1000/rec.1",
      status: "accepted",
      verifiedAt: new Date().toISOString(),
      qualityScore: 80,
    });
    const second = papers.insertPaper({
      title: "Second base editing paper",
      doi: "10.1000/rec.2",
      status: "accepted",
      verifiedAt: new Date().toISOString(),
      qualityScore: 85,
    });

    knowledge.insertRecommendation({
      date: "2026-11-04",
      paperId: first.id,
      recType: "latest",
      reason: "first",
      innovation: "innovation",
      value: "value",
      score: 80,
    });
    knowledge.insertRecommendation({
      date: "2026-11-04",
      paperId: second.id,
      recType: "latest",
      reason: "second",
      innovation: "innovation",
      value: "value",
      score: 85,
    });

    const recommendation = knowledge.getRecommendationForDate("2026-11-04");
    expect(recommendation?.paperId).toBe(second.id);
    expect(knowledge.getRecentRecommendations(30).filter((item) => item.date === "2026-11-04")).toHaveLength(1);
  });

  it("deduplicates knowledge entities by alias and relation by evidence", () => {
    const paper = papers.findPaperByExternalIds({ doi: "10.1000/rec.1" })!;
    const abe = knowledge.upsertEntity({
      name: "Adenine base editor (ABE)",
      type: "editor",
      aliases: ["ABE", "ABE8e"],
      description: "A-to-G editor",
    });
    const same = knowledge.upsertEntity({ name: "ABE8e", type: "editor" });
    expect(same).toBe(abe);

    const target = knowledge.upsertEntity({ name: "Editing efficiency", type: "efficiency" });
    knowledge.insertRelation({
      sourceEntityId: abe,
      targetEntityId: target,
      relationType: "improves",
      paperId: paper.id,
      evidenceText: "ABE8e improves editing efficiency",
      evidenceLocation: "Abstract",
      nature: "reported_fact",
      confidence: 0.9,
    });
    knowledge.insertRelation({
      sourceEntityId: abe,
      targetEntityId: target,
      relationType: "improves",
      paperId: paper.id,
      evidenceText: "ABE8e improves editing efficiency",
      evidenceLocation: "Abstract",
      nature: "reported_fact",
      confidence: 0.9,
    });

    const graph = knowledge.getGraph(50);
    expect(graph.relations.filter((relation) => relation.relationType === "improves")).toHaveLength(1);
    expect(graph.entities.some((entity) => entity.name.includes("Adenine"))).toBe(true);
    expect(knowledge.getGraph(50).relations[0].paperId).toBe(paper.id);
  });

  it("claims jobs atomically and deduplicates queued work", () => {
    const first = jobs.createJob("search_only", { query: "base editing" }, { dedupe: true });
    const duplicate = jobs.createJob("search_only", { query: "base editing" }, { dedupe: true });
    expect(first.created).toBe(true);
    expect(duplicate.created).toBe(false);
    expect(duplicate.job.id).toBe(first.job.id);

    const claimed = jobs.claimNextJob("test-worker");
    expect(claimed?.id).toBe(first.job.id);
    expect(claimed?.status).toBe("running");

    const secondClaim = jobs.claimNextJob("test-worker");
    expect(secondClaim).toBeNull();

    jobs.finishJob(first.job.id, "succeeded");
    expect(jobs.getJob(first.job.id)?.status).toBe("succeeded");

    const after = jobs.createJob("search_only", { query: "base editing" }, { dedupe: true });
    expect(after.created).toBe(true);
  });

  it("stores settings with typed values", () => {
    settingsRepo.saveSettings({ minAcceptScore: 77, schedulerEnabled: false });
    const settings = settingsRepo.getSettings();
    expect(settings.minAcceptScore).toBe(77);
    expect(settings.schedulerEnabled).toBe(false);
    expect(settings.timezone).toBe("Asia/Singapore");
  });
});
