import type { Paper } from "@/lib/types";

function clean(value: string | null | undefined): string {
  return (value ?? "").replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
}

function citationKey(paper: Paper): string {
  const first = paper.authors[0] ?? "";
  const surname = first.split(/\s+/).filter(Boolean).pop() ?? "";
  const year = paper.publicationDate?.slice(0, 4) ?? "n.d.";
  const stop = new Set(["the", "a", "an", "of", "for", "and", "to", "in", "with", "on"]);
  const word =
    paper.title
      .split(/\s+/)
      .map((token) => token.replace(/[^A-Za-z0-9]/g, ""))
      .find((token) => token.length > 2 && !stop.has(token.toLowerCase())) ?? "";
  const base = `${surname}${year}${word}`.replace(/[^A-Za-z0-9]/g, "");
  return base || `baseedit_${paper.id.slice(4, 12)}`;
}

export function paperToBibtex(paper: Paper): string {
  const fields: [string, string | null][] = [
    ["author", paper.authors.length ? paper.authors.map(clean).join(" and ") : null],
    ["title", clean(paper.title)],
    ["journal", clean(paper.journal)],
    ["year", paper.publicationDate?.slice(0, 4) ?? null],
    ["doi", paper.doi],
    ["url", paper.officialUrl ?? (paper.doi ? `https://doi.org/${paper.doi}` : null)],
    [
      "note",
      [
        paper.pmid ? `PMID: ${paper.pmid}` : null,
        paper.pmcid ? `PMCID: ${paper.pmcid}` : null,
        paper.articleType ? `Type: ${clean(paper.articleType)}` : null,
      ]
        .filter(Boolean)
        .join("; "),
    ],
  ];

  const body = fields
    .filter(([, value]) => value)
    .map(([key, value]) => `  ${key} = {${value}}`)
    .join(",\n");

  const type = paper.journal ? "article" : "misc";
  return `@${type}{${citationKey(paper)},\n${body}\n}`;
}

export function papersToBibtex(papers: Paper[]): string {
  return `${papers.map(paperToBibtex).join("\n\n")}\n`;
}

export function bibtexFilename(count: number): string {
  return count === 1 ? "baseedit-insight.bib" : `baseedit-insight-${count}-papers.bib`;
}
