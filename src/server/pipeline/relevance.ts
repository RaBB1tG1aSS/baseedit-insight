import type { FocusArea } from "@/lib/types";
import { BASE_EDITING_TERMS } from "@/lib/constants";

export interface RelevanceAssessment {
  score: number; // 0–15, used directly as the relevance quality dimension
  focusAreas: FocusArea[];
  matchedTerms: string[];
  isCore: boolean;
  summary: string;
}

const STRONG_PATTERNS = [
  /\bbase[-\s]?edit(ing|ors?)\b/i,
  /\bcytosine base editor\b/i,
  /\badenine base editor\b/i,
  /\bprogrammable editing of a target base\b/i,
  /\bCBE\b/,
  /\bABE\b/,
  /\bABE[0-9.]*e?\b/,
  /\bBE[3-4](max)?\b/,
  /\bTadA(-?[0-9.]+e?)?\b/i,
  /\brAPOBEC1\b/i,
];

export function assessRelevance(input: {
  title: string;
  abstract?: string | null;
  keywords?: string[];
}): RelevanceAssessment {
  const title = input.title ?? "";
  const abstract = input.abstract ?? "";
  const keywords = (input.keywords ?? []).join(" ");
  const titleAndAbstract = `${title}\n${abstract}`;

  const strongInTitle = STRONG_PATTERNS.some((pattern) => pattern.test(title));
  const strongHits = new Set<string>();
  for (const pattern of STRONG_PATTERNS) {
    const match = titleAndAbstract.match(pattern);
    if (match) strongHits.add(match[0].toLowerCase());
  }
  const isCore = strongInTitle || strongHits.size >= 2;

  let total = 0;
  const areaWeights = new Map<FocusArea, number>();
  const matched: string[] = [];

  for (const entry of BASE_EDITING_TERMS) {
    const inTitle = entry.term.test(title);
    const inBody = entry.term.test(`${abstract}\n${keywords}`);
    if (!inTitle && !inBody) continue;

    const weight = entry.weight * (inTitle ? 1 : 0.6);
    total += weight;
    matched.push(entry.term.source);
    areaWeights.set(entry.area, (areaWeights.get(entry.area) ?? 0) + weight);
  }

  // Reviews and perspectives are relevant to the field but are not primary evidence.
  if (/\b(review|perspective|roadmap|commentary)\b/i.test(title)) {
    areaWeights.set("field", (areaWeights.get("field") ?? 0) + 1.5);
  }

  const focusAreas = [...areaWeights.entries()]
    .filter(([, weight]) => weight >= 1.5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([area]) => area);

  const rawScore = isCore ? Math.min(15, Math.round(total * 10) / 10) : 0;
  // A core term in the title is decisive: a review titled "Base editing: …"
  // must not fall below the topic gate because of sparse abstract wording.
  const score = !isCore
    ? 0
    : strongInTitle
      ? Math.max(rawScore, 10)
      : Math.max(rawScore, 8.5);

  return {
    score,
    focusAreas: focusAreas.length ? focusAreas : ["field"],
    matchedTerms: [...new Set(matched)].slice(0, 12),
    isCore,
    summary: isCore
      ? `命中 ${strongHits.size} 个碱基编辑核心术语，加权相关性 ${score}/15`
      : "未检测到碱基编辑核心术语（仅有 CRISPR/基因编辑泛化提及）",
  };
}
