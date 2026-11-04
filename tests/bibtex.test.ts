import { describe, expect, it } from "vitest";
import type { Paper } from "@/lib/types";
import { paperToBibtex, papersToBibtex } from "@/server/exports/bibtex";

function paper(overrides: Partial<Paper> = {}): Paper {
  return {
    id: "pap_12345678-1234-1234-1234-123456789abc",
    doi: "10.1038/s41586-019-1161-z",
    pmid: "30936548",
    pmcid: "PMC6657343",
    openalexId: "W2939749480",
    semanticScholarId: null,
    title: "Transcriptome-wide off-target RNA editing induced by CRISPR-guided DNA base editors",
    titleZh: "CRISPR 引导的 DNA 碱基编辑器诱导转录组范围的 RNA 脱靶编辑",
    authors: ["Julian Grünewald", "Ronghao Zhou", "Cecilia A. Garcia"],
    journal: "Nature",
    publicationDate: "2019-04-17",
    onlinePublicationDate: "2019-04-17",
    articleType: "Journal Article",
    abstract: "Abstract",
    keywords: ["base editing"],
    officialUrl: "https://doi.org/10.1038/s41586-019-1161-z",
    peerReviewStatus: "peer_reviewed",
    publicationStatus: "published",
    retractionStatus: "none",
    retractionNote: null,
    fullTextAccessStatus: "abstract_only",
    fullTextLicense: null,
    qualityScore: 88,
    qualitySummary: null,
    recommendationCategory: null,
    focusAreas: ["safety"],
    citationCount: 600,
    status: "accepted",
    verifiedAt: "2026-11-04T00:00:00.000Z",
    needsAnalysisRefresh: false,
    dataVersion: 1,
    createdAt: "2026-11-04T00:00:00.000Z",
    updatedAt: "2026-11-04T00:00:00.000Z",
    ...overrides,
  };
}

describe("BibTeX export", () => {
  it("exports a valid article entry with identifiers", () => {
    const bib = paperToBibtex(paper());
    expect(bib).toContain("@article{");
    expect(bib).toContain("author = {Julian Grünewald and Ronghao Zhou and Cecilia A. Garcia}");
    expect(bib).toContain("journal = {Nature}");
    expect(bib).toContain("year = {2019}");
    expect(bib).toContain("doi = {10.1038/s41586-019-1161-z}");
    expect(bib).toContain("PMID: 30936548");
    expect(bib).toContain("PMCID: PMC6657343");
    expect(bib).toContain("title = {Transcriptome-wide");
  });

  it("falls back to @misc without a journal and produces unique-ish keys", () => {
    const bib = paperToBibtex(paper({ journal: null, doi: null, officialUrl: null }));
    expect(bib.startsWith("@misc{")).toBe(true);
    expect(bib).not.toContain("journal =");
  });

  it("exports multiple entries separated by blank lines", () => {
    const bib = papersToBibtex([paper(), paper({ title: "A second base editing paper" })]);
    expect(bib.match(/@article\{/g)?.length).toBe(2);
    expect(bib).toContain("\n\n");
  });
});
