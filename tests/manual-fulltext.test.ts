import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const dbFile = path.join(os.tmpdir(), `baseedit-manual-fulltext-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_PATH = dbFile;

const papers = await import("@/server/db/repo/papers");
const analysis = await import("@/server/db/repo/analysis");
const manual = await import("@/server/fulltext/manual");
const { fetchAndStoreFullText } = await import("@/server/fulltext/europepmc");
const { extractPdfText, isPdfBytes } = await import("@/server/fulltext/pdf");
const { getDb } = await import("@/server/db/client");

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

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

const longText = (paragraph: string, times = 6) =>
  Array.from({ length: times }, (_, index) => `${paragraph} 这是第 ${index + 1} 段用于补足长度的正文内容。`).join("\n\n");

describe("manual full-text import", () => {
  it("splits markdown-style sections and drops the reference list", () => {
    const text = `# Abstract
Base editing converts one base pair into another without creating double-strand breaks. ${"This abstract describes the core finding in detail. ".repeat(12)}

# Introduction
Cytosine and adenine base editors have been widely used in cells and animals. ${"The introduction explains prior work and the gap. ".repeat(12)}

# Results
The authors tested the editor in multiple cell types and measured on-target editing. ${"Results include quantitative comparisons and controls. ".repeat(12)}

# References
[1] Gaudelli NM, et al. Programmable base editing. Nature. 2017.
[2] Komor AC, et al. Programmable editing. Nature. 2016. ${"Reference text that should be removed. ".repeat(20)}
`;

    const sections = manual.splitFullTextIntoSections(text);
    const headings = sections.map((section) => section.heading);

    expect(headings).toContain("Abstract");
    expect(headings).toContain("Introduction");
    expect(headings).toContain("Results");
    expect(headings).not.toContain("References");
    expect(sections.every((section) => !section.text.includes("[1] Gaudelli"))).toBe(true);
  });

  it("falls back to paragraph chunks when no headings are detected", () => {
    const text = longText("This paragraph contains experimental narrative without any section heading.", 80);
    const sections = manual.splitFullTextIntoSections(text);

    expect(sections.length).toBeGreaterThan(1);
    expect(sections.every((section) => section.heading.startsWith("全文 · 第 "))).toBe(true);
  });

  it("stores imported text, protects it from automatic fetching, and removes it", async () => {
    const paper = papers.insertPaper({
      title: "A base editing study without open access",
      doi: "10.1000/manual.1",
      journal: "Journal of Tests",
      abstract: "An abstract that is too short to analyse deeply.",
      status: "accepted",
      verifiedAt: new Date().toISOString(),
      publicationDate: "2025-06-01",
    });

    const text = `# Abstract
${longText("Base editing enables precise nucleotide conversion in human cells.", 4)}

# Results
${longText("The authors observed efficient editing with minimal indels across multiple loci.", 6)}`;

    const result = manual.importManualFullText(paper.id, text);
    expect(result.sections).toBeGreaterThanOrEqual(2);
    expect(result.chars).toBeGreaterThan(500);

    const stored = analysis.getFullText(paper.id)!;
    expect(stored.accessStatus).toBe("manual_fulltext");
    expect(stored.sourceName).toBe(manual.MANUAL_FULLTEXT_SOURCE);
    expect(stored.licenseAllowsStorage).toBe(true);
    expect(stored.sections.length).toBe(result.sections);

    const fullPaper = papers.getPaperById(paper.id)!;
    const fetched = await fetchAndStoreFullText(fullPaper);
    expect(fetched.accessStatus).toBe("manual_fulltext");

    const forced = await fetchAndStoreFullText(fullPaper, { force: true });
    expect(forced.accessStatus).toBe("manual_fulltext");
    expect(analysis.getFullText(paper.id)!.sections.length).toBe(result.sections);

    expect(manual.removeManualFullText(paper.id)).toBe(true);
    expect(analysis.getFullText(paper.id)).toBeNull();
    expect(manual.removeManualFullText(paper.id)).toBe(false);
  });

  it("extracts text from a PDF file", async () => {
    const data = new Uint8Array(fs.readFileSync(path.join(fixturesDir, "sample-paper.pdf")));
    expect(isPdfBytes(data)).toBe(true);
    expect(isPdfBytes(new Uint8Array([1, 2, 3, 4]))).toBe(false);

    const result = await extractPdfText(data);
    expect(result.pages).toBe(1);
    expect(result.text).toContain("Base Editing in Human Cells");
    expect(result.text).toContain("Results");
    expect(result.text.length).toBeGreaterThan(500);

    const pdfSections = manual.splitFullTextIntoSections(result.text);
    expect(pdfSections.some((section) => section.heading === "Abstract")).toBe(true);
    expect(pdfSections.some((section) => section.heading === "Results")).toBe(true);
  });

  it("rejects text that is too short", () => {
    expect(() => manual.importManualFullText("paper-1", "too short")).toThrow(/太短/);
  });
});
