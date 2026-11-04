import { describe, expect, it } from "vitest";
import { mergeSourceRecords } from "@/server/pipeline/dedupe";
import { scoreQuality } from "@/server/pipeline/quality";
import { assessRelevance } from "@/server/pipeline/relevance";
import type { SourceRecord } from "@/server/sources/types";

function source(overrides: Partial<SourceRecord>): SourceRecord {
  return {
    source: "pubmed",
    externalId: "1",
    url: "https://example.org",
    doi: "10.1016/j.example.2024.01.001",
    pmid: "123",
    pmcid: null,
    openalexId: null,
    title: "Base editing",
    authors: [],
    journal: "Nature Biotechnology",
    publicationDate: "2024-01-01",
    onlinePublicationDate: null,
    articleType: "Journal Article",
    abstract: null,
    keywords: [],
    peerReviewStatus: "peer_reviewed",
    publicationStatus: "published",
    retractionStatus: "none",
    retractionNote: null,
    fullTextAccessStatus: "abstract_only",
    fullTextUrl: null,
    license: null,
    citationCount: 0,
    retrievedAt: new Date().toISOString(),
    raw: null,
    ...overrides,
  };
}

describe("scoreQuality", () => {
  it("produces bounded, explainable scores", () => {
    const candidate = mergeSourceRecords([
      source({
        title: "Engineered ABE8e adenine base editor improves editing efficiency in vivo",
        abstract:
          "We engineered a next-generation adenine base editor, ABE8e, and evaluated it in mice. " +
          "The editor improved A-to-G editing efficiency while reducing DNA off-target editing. " +
          "Lipid nanoparticle delivery enabled therapeutic correction in a disease model.",
        keywords: ["ABE8e", "base editing", "LNP"],
        citationCount: 40,
        fullTextAccessStatus: "oa_fulltext",
        license: "CC BY 4.0",
      }),
    ])[0];
    const relevance = assessRelevance(candidate);
    const quality = scoreQuality({ candidate, relevance, identityVerified: true });

    expect(quality.dimensions).toHaveLength(7);
    expect(quality.total).toBeGreaterThanOrEqual(60);
    expect(quality.total).toBeLessThanOrEqual(100);
    expect(quality.dimensions.find((dimension) => dimension.key === "relevance")?.score).toBe(relevance.score);
    for (const dimension of quality.dimensions) {
      expect(dimension.score).toBeGreaterThanOrEqual(0);
      expect(dimension.score).toBeLessThanOrEqual(dimension.max);
      expect(dimension.rationale.length).toBeGreaterThan(0);
    }
  });

  it("gives zero reliability to retracted papers", () => {
    const candidate = mergeSourceRecords([
      source({
        title: "A base editing study that was retracted",
        retractionStatus: "retracted",
        retractionNote: "Retracted by journal",
        publicationStatus: "retracted",
        peerReviewStatus: "peer_reviewed",
      }),
    ])[0];
    const relevance = assessRelevance(candidate);
    const quality = scoreQuality({ candidate, relevance, identityVerified: true });
    expect(quality.dimensions.find((dimension) => dimension.key === "reliability")?.score).toBe(0);
  });

  it("penalises preprints on reliability", () => {
    const candidate = mergeSourceRecords([
      source({
        title: "Base editing of hematopoietic stem cells",
        peerReviewStatus: "preprint",
        publicationStatus: "preprint",
        journal: "bioRxiv",
      }),
    ])[0];
    const quality = scoreQuality({ candidate, relevance: assessRelevance(candidate), identityVerified: true });
    expect(quality.dimensions.find((dimension) => dimension.key === "reliability")!.score).toBeLessThanOrEqual(8);
  });
});
