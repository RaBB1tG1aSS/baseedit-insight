import type { QualityDimensionKey } from "@/lib/types";
import { QUALITY_DIMENSIONS } from "@/lib/types";
import type { MergedCandidate } from "./dedupe";
import type { RelevanceAssessment } from "./relevance";
import { yearOf } from "../utils/normalize";
import { licenseAllowsStorage } from "../utils/license";

export interface QualityDimension {
  key: QualityDimensionKey;
  score: number;
  max: number;
  rationale: string;
  method: "rule" | "llm" | "hybrid";
}

export interface QualityResult {
  dimensions: QualityDimension[];
  total: number;
  summary: string;
}

export interface QualityInput {
  candidate: MergedCandidate;
  relevance: RelevanceAssessment;
  identityVerified: boolean;
}

function clamp(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value * 10) / 10));
}

function ageYears(date: string | null): number {
  const year = yearOf(date);
  if (!year) return 3;
  const now = new Date();
  return Math.max(0.5, now.getFullYear() + now.getMonth() / 12 - (year + 0.5));
}

const TOP_JOURNALS = /(nature|science|cell|new england journal|lancet|jama|nature biotechnology|nature medicine|nature genetics|cell stem cell|molecular therapy)/i;

export function scoreQuality(input: QualityInput): QualityResult {
  const { candidate, relevance, identityVerified } = input;
  const haystack = `${candidate.title}\n${candidate.abstract ?? ""}\n${candidate.keywords.join(" ")}`;
  const age = ageYears(candidate.publicationDate);
  const velocity = candidate.citationCount / age;
  // "OA at the source" is not the same as "we may store and analyse the full text".
  const storableFullText =
    candidate.fullTextAccessStatus === "oa_fulltext" && licenseAllowsStorage(candidate.license);

  /* ── 学术可靠性 (20) ── */
  let reliability = 0;
  const reliabilityNotes: string[] = [];
  if (candidate.peerReviewStatus === "peer_reviewed") {
    reliability += 10;
    reliabilityNotes.push("同行评审论文");
  } else if (candidate.peerReviewStatus === "preprint") {
    reliability += 2;
    reliabilityNotes.push("预印本，未经同行评审");
  } else {
    reliability += 4;
    reliabilityNotes.push("同行评审状态未知");
  }
  if (candidate.journal) {
    reliability += 3;
    reliabilityNotes.push(`期刊信息：${candidate.journal}`);
  }
  if (identityVerified) {
    reliability += 4;
    reliabilityNotes.push("DOI/PMID 身份已核验");
  } else {
    reliabilityNotes.push("身份未完成核验");
  }
  if (candidate.retractionStatus === "none") {
    reliability += 3;
    reliabilityNotes.push("未发现撤稿或勘误警示");
  } else if (candidate.retractionStatus === "correction") {
    reliability += 1;
    reliabilityNotes.push("存在勘误记录");
  } else if (candidate.retractionStatus === "unknown") {
    reliabilityNotes.push("撤稿状态未确认");
  }
  if (candidate.publicationStatus === "retracted" || candidate.retractionStatus === "retracted") {
    reliability = 0;
    reliabilityNotes.push("已撤稿：不进入正式推荐");
  } else if (candidate.publicationStatus === "published") {
    reliability += 2;
    reliabilityNotes.push("发表状态正常");
  }
  if (candidate.peerReviewStatus === "preprint") reliability = Math.min(reliability, 8);

  /* ── 创新性 (15) ── */
  let innovation = 7;
  const innovationNotes: string[] = [];
  if (/\b(first|novel|new|next-generation|engineered|de novo|high-fidelity|evolved|improved)\b/i.test(haystack)) {
    innovation += 2.5;
    innovationNotes.push("标题/摘要包含新颖性表述");
  }
  if (/\b(ABE8e|TadA-?8e|BE4max|evoCDA|AncBE4|ABE7\.10|eA3A|SECURE|DeepBE|BE-Hive)\b/i.test(haystack)) {
    innovation += 2;
    innovationNotes.push("涉及具体工程化编辑器/设计方法");
  }
  if (/\b(clinical|patient|phase\s?[I1-3])\b/i.test(haystack)) {
    innovation += 1.5;
    innovationNotes.push("涉及临床转化");
  }
  if (/\b(review|perspective|roadmap|commentary)\b/i.test(candidate.title)) {
    innovation -= 3;
    innovationNotes.push("综述/观点类文章，创新性证据有限");
  }
  if (/\b(protocol|step-by-step)\b/i.test(candidate.title)) {
    innovation -= 1.5;
    innovationNotes.push("方法/协议类文章");
  }

  /* ── 研究严谨性 (15) ── */
  let rigor = candidate.peerReviewStatus === "peer_reviewed" ? 7 : candidate.peerReviewStatus === "preprint" ? 4 : 5;
  const rigorNotes: string[] = [];
  if (storableFullText) {
    rigor += 2.5;
    rigorNotes.push("开放获取全文可用于证据核查");
  } else {
    rigorNotes.push(
      candidate.fullTextAccessStatus === "oa_fulltext"
        ? "来源标注开放获取，但许可不允许本地保存全文，实际按摘要级评估"
        : "仅摘要可访问，证据核查受限",
    );
  }
  if ((candidate.abstract?.length ?? 0) > 800) {
    rigor += 1.5;
    rigorNotes.push("摘要信息较完整");
  }
  if (/\b(randomi[sz]ed|blinded|controlled trial|in vivo|knock-?in mice|patient-derived)\b/i.test(haystack)) {
    rigor += 2;
    rigorNotes.push("摘要显示对照/动物或患者样本设计");
  }
  if (/\b(review|perspective)\b/i.test(candidate.title)) rigor -= 1.5;
  if (candidate.retractionStatus === "expression_of_concern") rigor -= 4;

  /* ── 领域影响 (15) ── */
  let impact = 4;
  if (velocity >= 50) impact = 14;
  else if (velocity >= 20) impact = 12;
  else if (velocity >= 8) impact = 10;
  else if (velocity >= 3) impact = 8;
  else if (velocity >= 1) impact = 6;
  if (candidate.journal && TOP_JOURNALS.test(candidate.journal)) impact += 2;
  if (candidate.citationCount >= 200) impact += 1;
  const impactNotes = [
    `引用 ${candidate.citationCount} 次，发表约 ${age.toFixed(1)} 年，引用速度 ${velocity.toFixed(1)}/年（仅作辅助信号）`,
  ];

  /* ── 科学价值 (15) ── */
  let scientificValue = 7;
  const valueNotes: string[] = [];
  if (/\b(therapeutic|treatment|disease|patient|clinical)\b/i.test(haystack)) {
    scientificValue += 2;
    valueNotes.push("面向疾病治疗问题");
  }
  if (/\b(in vivo|mouse|mice|macaque|nonhuman primate)\b/i.test(haystack)) {
    scientificValue += 1.5;
    valueNotes.push("包含体内/动物模型证据");
  }
  if (/\b(off-?target|specificity|safety|genotoxicity)\b/i.test(haystack)) {
    scientificValue += 2;
    valueNotes.push("直接评估安全性/特异性");
  }
  if (/\b(mechanism|structural|structure|evolv|engineer)\b/i.test(haystack)) {
    scientificValue += 1.5;
    valueNotes.push("提供机制或工程化认识");
  }
  if (/\b(review|perspective)\b/i.test(candidate.title)) scientificValue -= 1.5;

  /* ── 信息完整性 (5) ── */
  const completeness = storableFullText
    ? 5
    : (candidate.abstract?.length ?? 0) > 500
      ? 3
      : candidate.abstract
        ? 2
        : 0;

  const dimensionMap: Record<QualityDimensionKey, { score: number; rationale: string }> = {
    reliability: { score: clamp(reliability, 20), rationale: reliabilityNotes.join("；") },
    innovation: { score: clamp(innovation, 15), rationale: innovationNotes.join("；") || "未检测到显著创新信号" },
    rigor: { score: clamp(rigor, 15), rationale: rigorNotes.join("；") },
    impact: { score: clamp(impact, 15), rationale: impactNotes.join("；") },
    scientificValue: { score: clamp(scientificValue, 15), rationale: valueNotes.join("；") || "科学价值需结合全文判断" },
    relevance: { score: clamp(relevance.score, 15), rationale: relevance.summary },
    completeness: { score: clamp(completeness, 5), rationale: storableFullText ? "可获取并保存开放获取全文" : "仅可获取摘要级材料" },
  };

  const dimensions: QualityDimension[] = QUALITY_DIMENSIONS.map((meta) => ({
    key: meta.key,
    score: dimensionMap[meta.key].score,
    max: meta.max,
    rationale: dimensionMap[meta.key].rationale,
    method: "rule" as const,
  }));

  const total = Math.round(dimensions.reduce((sum, dimension) => sum + dimension.score, 0) * 10) / 10;
  const sorted = [...dimensions].sort((a, b) => b.score / b.max - a.score / a.max);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  const summary = `综合 ${total}/100。相对优势：${dimensionLabel(strongest.key)}（${strongest.score}/${strongest.max}）；相对短板：${dimensionLabel(weakest.key)}（${weakest.score}/${weakest.max}）。`;

  return { dimensions, total, summary };
}

const LABELS: Record<QualityDimensionKey, string> = {
  reliability: "学术可靠性",
  innovation: "创新性",
  rigor: "研究严谨性",
  impact: "领域影响",
  scientificValue: "科学价值",
  relevance: "领域相关性",
  completeness: "信息完整性",
};

function dimensionLabel(key: QualityDimensionKey): string {
  return LABELS[key] ?? key;
}
