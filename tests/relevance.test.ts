import { describe, expect, it } from "vitest";
import { assessRelevance } from "@/server/pipeline/relevance";

describe("assessRelevance", () => {
  it("recognises core base-editing research", () => {
    const result = assessRelevance({
      title: "Adenine base editing corrects a pathogenic mutation in mice",
      abstract: "We used an ABE8e adenine base editor delivered by LNP to correct the mutation in vivo.",
      keywords: ["base editing", "ABE8e", "LNP"],
    });
    expect(result.isCore).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(8);
    expect(result.focusAreas).toContain("editors");
  });

  it("rejects incidental CRISPR mentions without base editing", () => {
    const result = assessRelevance({
      title: "CRISPR-Cas9 screening identifies host factors for viral entry",
      abstract: "A genome-wide Cas9 knockout screen was performed in human cells.",
      keywords: ["CRISPR", "Cas9"],
    });
    expect(result.isCore).toBe(false);
    expect(result.score).toBe(0);
  });

  it("assigns safety and delivery focus areas", () => {
    const result = assessRelevance({
      title: "RNA off-target editing limits the safety of cytosine base editors",
      abstract: "Cytosine base editors cause transcriptome-wide RNA off-target editing; AAV delivery was evaluated in vivo.",
      keywords: ["CBE", "off-target", "AAV"],
    });
    expect(result.isCore).toBe(true);
    expect(result.focusAreas).toEqual(expect.arrayContaining(["safety"]));
  });

  it("recognises hyphenated and plural forms in titles", () => {
    const hyphenated = assessRelevance({
      title: "A base-editing and auxotrophic selection platform for silent gene clusters",
    });
    expect(hyphenated.isCore).toBe(true);
    expect(hyphenated.score).toBeGreaterThanOrEqual(10);

    const plural = assessRelevance({
      title: "Genome editing with CRISPR-Cas nucleases, base editors and prime editors",
    });
    expect(plural.isCore).toBe(true);
    expect(plural.score).toBeGreaterThanOrEqual(10);
  });

  it("keeps a strong title above the topic gate even with sparse abstracts", () => {
    const result = assessRelevance({
      title: "Base editing: precision chemistry on the genome and transcriptome of living cells",
      abstract: "RNA-guided programmable nucleases generate precise breaks in DNA or RNA.",
    });
    expect(result.score).toBeGreaterThanOrEqual(10);
  });
});
