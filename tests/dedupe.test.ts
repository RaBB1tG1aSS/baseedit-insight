import { describe, expect, it } from "vitest";
import { mergeSourceRecords } from "@/server/pipeline/dedupe";
import type { SourceRecord } from "@/server/sources/types";

function record(partial: Partial<SourceRecord> & Pick<SourceRecord, "source" | "title">): SourceRecord {
  return {
    externalId: partial.externalId ?? partial.source,
    url: "https://example.org",
    doi: null,
    pmid: null,
    pmcid: null,
    openalexId: null,
    authors: [],
    journal: null,
    publicationDate: null,
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
    ...partial,
  };
}

describe("mergeSourceRecords", () => {
  it("merges the same paper from three databases into one candidate", () => {
    const title = "Adenine base editors enable efficient A-to-G editing in human cells";
    const merged = mergeSourceRecords([
      record({
        source: "pubmed",
        externalId: "111",
        title,
        doi: "10.1038/abc",
        pmid: "111",
        journal: "Nature",
        publicationDate: "2024-03-01",
        retractionStatus: "none",
        citationCount: 10,
      }),
      record({
        source: "europepmc",
        externalId: "MED:111",
        title: `${title}.`,
        doi: "10.1038/ABC",
        pmid: "111",
        pmcid: "PMC123",
        journal: "Nature",
        publicationDate: "2024-03-02",
        fullTextAccessStatus: "oa_fulltext",
        fullTextUrl: "https://europepmc.org/articles/PMC123",
        license: "CC BY 4.0",
        citationCount: 12,
      }),
      record({
        source: "openalex",
        externalId: "W123",
        title,
        doi: "10.1038/abc",
        openalexId: "W123",
        journal: "Nature",
        publicationDate: "2024-03-01",
        citationCount: 15,
        retractionStatus: "none",
      }),
    ]);

    expect(merged).toHaveLength(1);
    const candidate = merged[0];
    expect(candidate.doi).toBe("10.1038/abc");
    expect(candidate.pmid).toBe("111");
    expect(candidate.pmcid).toBe("PMC123");
    expect(candidate.openalexId).toBe("W123");
    expect(candidate.fullTextAccessStatus).toBe("oa_fulltext");
    expect(candidate.license).toBe("CC BY 4.0");
    expect(candidate.citationCount).toBe(15);
    expect(candidate.sources.sort()).toEqual(["europepmc", "openalex", "pubmed"]);
  });

  it("keeps different papers separate and records conflicts", () => {
    const merged = mergeSourceRecords([
      record({ source: "pubmed", title: "Base editor A treats disease X", doi: "10.1000/a", pmid: "1" }),
      record({ source: "crossref", title: "Base editor B treats disease Y", doi: "10.1000/b" }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("takes the most severe retraction signal", () => {
    const title = "Off-target analysis of cytosine base editors";
    const merged = mergeSourceRecords([
      record({ source: "pubmed", title, doi: "10.1000/c", retractionStatus: "none" }),
      record({ source: "openalex", title, doi: "10.1000/c", retractionStatus: "retracted", retractionNote: "OpenAlex" }),
    ]);
    expect(merged[0].retractionStatus).toBe("retracted");
    expect(merged[0].publicationStatus).toBe("retracted");
  });

  it("prefers the longer abstract and union of keywords", () => {
    const title = "Base editing in vivo";
    const merged = mergeSourceRecords([
      record({ source: "pubmed", title, doi: "10.1000/d", abstract: "Short abstract", keywords: ["ABE"] }),
      record({ source: "europepmc", title, doi: "10.1000/d", abstract: "A much longer abstract with results", keywords: ["CBE", "LNP"] }),
    ]);
    expect(merged[0].abstract).toContain("much longer");
    expect(merged[0].keywords.sort()).toEqual(["ABE", "CBE", "LNP"]);
  });
});
