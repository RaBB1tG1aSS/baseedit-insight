import { describe, expect, it } from "vitest";
import {
  isSameWork,
  normalizeDoi,
  normalizePmid,
  stripMarkup,
  titleKey,
  titleSimilarity,
  toIsoDate,
} from "@/server/utils/normalize";

describe("normalizeDoi", () => {
  it("canonicalises DOI prefixes and case", () => {
    expect(normalizeDoi("https://doi.org/10.1038/S41586-019-1161-Z")).toBe("10.1038/s41586-019-1161-z");
    expect(normalizeDoi("doi:10.1016/J.OMTN.2026.103121")).toBe("10.1016/j.omtn.2026.103121");
    expect(normalizeDoi("10.1101/2024.01.01.123456.")).toBe("10.1101/2024.01.01.123456");
  });

  it("rejects malformed identifiers", () => {
    expect(normalizeDoi("not-a-doi")).toBeNull();
    expect(normalizeDoi(null)).toBeNull();
    expect(normalizePmid("PMID: 12345678")).toBe("12345678");
    expect(normalizePmid("abc")).toBeNull();
  });
});

describe("title normalisation", () => {
  it("strips HTML and punctuation", () => {
    expect(stripMarkup("<i>ABE8e</i> improves <b>base editing</b>")).toBe("ABE8e improves base editing");
    expect(titleKey("Base Editing: A New Era!")).toBe(titleKey("base editing a new era"));
  });

  it("matches near-identical titles", () => {
    const a = "Transcriptome-wide off-target RNA editing induced by CRISPR-guided DNA base editors";
    const b = "Transcriptome-wide off-target RNA editing induced by CRISPR-guided DNA base editors.";
    expect(titleSimilarity(a, b)).toBe(1);
    expect(isSameWork({ title: a, year: 2019 }, { title: b, year: 2019 })).toBe(true);
  });

  it("does not merge unrelated titles", () => {
    expect(
      isSameWork(
        { title: "Adenine base editing of the PCSK9 locus", year: 2023 },
        { title: "Prime editing for sickle cell disease", year: 2023 },
      ),
    ).toBe(false);
  });
});

describe("dates", () => {
  it("parses common date forms", () => {
    expect(toIsoDate("2026 Sep 29")).toBe("2026-09-29");
    expect(toIsoDate("2026/9/29")).toBe("2026-09-29");
    expect(toIsoDate("2026")).toBe("2026-01-01");
  });
});
