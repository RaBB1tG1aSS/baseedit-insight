import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const dbFile = path.join(os.tmpdir(), `baseedit-metrics-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = dbFile;

const papers = await import("@/server/db/repo/papers");
const settingsRepo = await import("@/server/db/repo/settings");
const metrics = await import("@/server/metrics/journals");
const dedupe = await import("@/server/pipeline/dedupe");
const relevanceMod = await import("@/server/pipeline/relevance");
const qualityMod = await import("@/server/pipeline/quality");
const gateMod = await import("@/server/pipeline/gate");
const { nowStamp } = await import("@/server/sources/types");
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

describe("journal metric normalisation", () => {
  it("normalises journal names and ISSNs", () => {
    expect(metrics.normalizeJournalName("The Journal of Clinical Investigation.")).toBe(
      "journal of clinical investigation",
    );
    expect(metrics.normalizeJournalName("Molecular Therapy — Nucleic Acids")).toBe(
      "molecular therapy nucleic acids",
    );
    expect(metrics.normalizeIssn("0028-0836")).toBe("00280836");
    expect(metrics.normalizeIssn("1234-567X")).toBe("1234567X");
    expect(metrics.normalizeIssn("bad")).toBeNull();
  });
});

describe("JCR CSV import and gating", () => {
  it("imports a licensed CSV locally and writes the metric onto papers", () => {
    const paper = papers.insertPaper({
      title: "A base editing study published in Nature",
      doi: "10.1000/metrics.1",
      journal: "Nature",
      status: "accepted",
      verifiedAt: new Date().toISOString(),
      publicationDate: "2025-01-01",
    });

    const csv = `Journal Citation Reports export
Journal,ISSN,Impact Factor,Year
Nature,0028-0836,50.5,2025
"Journal of Tests, Series B",1234-5678,<0.1,2025
`;

    const result = metrics.importJournalMetricsCsv(csv, { source: "jcr" });
    expect(result.imported).toBe(2);
    expect(result.updatedPapers).toBe(1);

    const updated = papers.getPaperById(paper.id)!;
    expect(updated.journalMetric).toBe(50.5);
    expect(updated.journalMetricSource).toBe("jcr");
    expect(updated.journalMetricYear).toBe(2025);
    expect(updated.journalIssn).toBe("00280836");

    const resolved = metrics.findJournalMetric({ journal: "Nature" }, "jcr");
    expect(resolved?.value).toBe(50.5);
    expect(resolved?.source).toBe("jcr");

    const coverage = metrics.getJournalMetricCoverage();
    expect(coverage.totalJournals).toBe(1);
    expect(coverage.matchedJournals).toBe(1);
    expect(coverage.jcrCount).toBe(2);
  });

  it("applies the configured metric threshold to paper recommendations", () => {
    const paper = papers.findPaperByExternalIds({ doi: "10.1000/metrics.1" })!;
    const base = settingsRepo.defaultSettings();

    expect(
      metrics.paperPassesJournalMetric(paper, {
        ...base,
        journalMetricMode: "jcr",
        minJournalMetric: 40,
        journalMetricUnknown: "reject",
      }),
    ).toBe(true);

    expect(
      metrics.paperPassesJournalMetric(paper, {
        ...base,
        journalMetricMode: "jcr",
        minJournalMetric: 60,
        journalMetricUnknown: "reject",
      }),
    ).toBe(false);
  });

  it("rejects a paper when its journal metric is below the configured gate", () => {
    const candidate = dedupe.mergeSourceRecords([
      {
        source: "pubmed",
        externalId: "metrics-gate-1",
        url: "https://pubmed.ncbi.nlm.nih.gov/1/",
        doi: "10.1000/metrics.gate",
        pmid: "99999999",
        pmcid: null,
        openalexId: null,
        title: "Adenine base editing corrects a pathogenic mutation in mice",
        authors: ["Test Author"],
        journal: "Nature",
        issn: "0028-0836",
        publicationDate: "2025-06-01",
        onlinePublicationDate: "2025-06-01",
        articleType: "Journal Article",
        abstract:
          "We used an engineered adenine base editor delivered by LNP to correct the mutation in vivo. " +
          "Editing efficiency was high and DNA off-target editing was evaluated genome-wide.",
        keywords: ["base editing", "ABE", "off-target"],
        peerReviewStatus: "peer_reviewed",
        publicationStatus: "published",
        retractionStatus: "none",
        retractionNote: null,
        fullTextAccessStatus: "oa_fulltext",
        fullTextUrl: null,
        license: "CC BY 4.0",
        citationCount: 100,
        retrievedAt: nowStamp(),
        raw: null,
      },
    ])[0];
    const relevance = relevanceMod.assessRelevance(candidate);
    const quality = qualityMod.scoreQuality({ candidate, relevance, identityVerified: true });
    const settings = {
      ...settingsRepo.defaultSettings(),
      journalMetricMode: "jcr" as const,
      minJournalMetric: 60,
      journalMetricUnknown: "reject" as const,
    };
    const verification = {
      candidate,
      identityVerified: true,
      retraction: { status: "none" as const, note: null },
      checks: [],
      conflicts: [],
      fatal: [],
      warnings: [],
      fetched: [],
    };

    const low = gateMod.gateDecision({
      verification,
      quality,
      relevance,
      settings,
      articleType: candidate.articleType,
      title: candidate.title,
      journalMetric: {
        value: 50.5,
        source: "jcr",
        year: 2025,
        journalName: "Nature",
        issn: "00280836",
      },
    });
    expect(low.status).toBe("rejected");
    expect(low.reasons.join(" ")).toContain("低于门槛");

    const high = gateMod.gateDecision({
      verification,
      quality,
      relevance,
      settings,
      articleType: candidate.articleType,
      title: candidate.title,
      journalMetric: {
        value: 70,
        source: "jcr",
        year: 2025,
        journalName: "Nature",
        issn: "00280836",
      },
    });
    expect(high.status).toBe("accepted");
  });

  it("handles unknown journals according to policy", () => {
    const unknown = papers.insertPaper({
      title: "A base editing study in an unknown journal",
      doi: "10.1000/metrics.2",
      journal: "Journal Without A Metric",
      status: "accepted",
      verifiedAt: new Date().toISOString(),
    });
    const base = settingsRepo.defaultSettings();
    expect(
      metrics.paperPassesJournalMetric(unknown, {
        ...base,
        journalMetricMode: "jcr",
        minJournalMetric: 5,
        journalMetricUnknown: "allow",
      }),
    ).toBe(true);
    expect(
      metrics.paperPassesJournalMetric(unknown, {
        ...base,
        journalMetricMode: "jcr",
        minJournalMetric: 5,
        journalMetricUnknown: "reject",
      }),
    ).toBe(false);
  });
});
