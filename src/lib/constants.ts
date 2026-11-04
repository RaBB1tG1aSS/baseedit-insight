import type { FocusArea, EntityType } from "./types";

export const FOCUS_AREAS: { key: FocusArea; label: string; short: string; description: string }[] = [
  { key: "editors", label: "编辑器与基础技术", short: "编辑器", description: "CBE、ABE、编辑窗口、编辑效率与产物分布" },
  { key: "safety", label: "安全性与局限性", short: "安全性", description: "DNA/RNA 脱靶、非预期编辑、基因组稳定性" },
  { key: "delivery", label: "递送技术", short: "递送", description: "LNP、AAV、体内递送与组织特异性" },
  { key: "disease", label: "疾病治疗与应用", short: "疾病应用", description: "遗传病、罕见病、血液/神经/眼科疾病与临床进展" },
  { key: "field", label: "领域发展与综述", short: "领域", description: "技术迭代、团队、里程碑与比较研究" },
];

export const FOCUS_LABEL: Record<FocusArea, string> = {
  editors: "编辑器与基础技术",
  safety: "安全性与局限性",
  delivery: "递送技术",
  disease: "疾病治疗与应用",
  field: "领域发展与综述",
};

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  editor: "编辑器",
  editor_generation: "编辑器世代",
  editing_window: "编辑窗口",
  efficiency: "编辑效率",
  specificity: "编辑特异性",
  off_target: "脱靶效应",
  delivery: "递送技术",
  in_vivo: "体内编辑",
  disease: "疾病",
  application: "应用方向",
  research_team: "研究团队",
  researcher: "研究人员",
  technology: "技术",
  research_direction: "研究方向",
  concept: "科学概念",
};

export const RELATION_LABELS: Record<string, string> = {
  develops: "提出/开发",
  improves: "改善",
  reduces: "降低",
  increases: "提高",
  enables: "使能",
  uses: "使用",
  delivered_by: "通过…递送",
  applied_to: "应用于",
  targets: "靶向",
  causes: "导致",
  associated_with: "相关",
  compared_with: "对比",
  validates: "验证",
  mentions: "提及",
};

/**
 * Weighted lexicon used by the deterministic topic-relevance scorer.
 * A paper must accumulate real base-editing signal — a passing mention is not
 * enough to be recommended (prompt §2.5).
 */
export const BASE_EDITING_TERMS: { term: RegExp; weight: number; area: FocusArea }[] = [
  { term: /\bbase[-\s]?edit(ing|ors?)\b/i, weight: 5, area: "editors" },
  { term: /\bprogrammable editing of a target base\b/i, weight: 4, area: "editors" },
  { term: /\b(cytosine|cytidine|adenine) deaminase\b/i, weight: 3, area: "editors" },
  { term: /\bcytosine base editor|\bCBE\b|\bBE[3-4]\b|\bBE4max\b|\bAncBE4\b|\bevoCDA\b|\bCDA1?\b/i, weight: 4, area: "editors" },
  { term: /\badenine base editor|\bABE\b|\bABE[0-9.]+e?\b|\bTadA(-?[0-9])?\b|\bTadA-8e\b/i, weight: 4, area: "editors" },
  { term: /\b(base editing|editing) window\b|\bediting efficiency\b|\bediting purity\b|\bbystander\b/i, weight: 2, area: "editors" },
  { term: /\boff-?target\b/i, weight: 2, area: "safety" },
  { term: /\bRNA off-?target|\bDNA off-?target|\btranscriptome-wide|\bgenome-wide off-target/i, weight: 3, area: "safety" },
  { term: /\b(LNP|lipid nanoparticle|AAV|adeno-associated virus|mRNA delivery)\b/i, weight: 1.5, area: "delivery" },
  { term: /\bin vivo\b/i, weight: 1, area: "delivery" },
  { term: /\b(APOBEC|ADAR|deaminase)\b/i, weight: 2, area: "editors" },
  { term: /\b(prime editing|CRISPR|Cas9|Cas12)\b/i, weight: 0.5, area: "field" },
  { term: /\b(clinical trial|phase [I1-3]|patients?)\b/i, weight: 1, area: "disease" },
  { term: /\b(Leber|sickle cell|beta-thalassemia|thalassaemia|DMD|ALS|Alzheimer|hypercholesterolemia|tyrosinemia|phenylketonuria)\b/i, weight: 1.5, area: "disease" },
  { term: /\b(review|perspective|roadmap)\b/i, weight: 0.5, area: "field" },
];

/** Canonical entities used by the rule-based fallback extractor. */
export const CANONICAL_ENTITIES: {
  name: string;
  nameZh: string;
  type: EntityType;
  aliases: string[];
  description: string;
  pattern: RegExp;
}[] = [
  { name: "Cytosine base editor (CBE)", nameZh: "胞嘧啶碱基编辑器", type: "editor", aliases: ["CBE", "cytosine base editor", "BE4", "BE3"], description: "将 C•G 转换为 T•A 的碱基编辑器，基于胞嘧啶脱氨酶。", pattern: /\b(cytosine base editor|CBE|BE4|BE3)\b/i },
  { name: "Adenine base editor (ABE)", nameZh: "腺嘌呤碱基编辑器", type: "editor", aliases: ["ABE", "adenine base editor", "ABE8e", "ABE7.10"], description: "将 A•T 转换为 G•C 的碱基编辑器，基于工程化 TadA 脱氨酶。", pattern: /\b(adenine base editor|ABE|ABE8e|ABE7\.10)\b/i },
  { name: "TadA", nameZh: "TadA 脱氨酶", type: "technology", aliases: ["TadA", "TadA-8e", "TadA8e"], description: "用于 ABE 的 tRNA 腺苷脱氨酶，经定向进化获得 DNA 编辑活性。", pattern: /\bTadA(-?8e)?\b/i },
  { name: "APOBEC", nameZh: "APOBEC 胞苷脱氨酶", type: "technology", aliases: ["APOBEC", "APOBEC1", "rAPOBEC1"], description: "CBE 中常用的胞嘧啶脱氨酶结构域。", pattern: /\bAPOBEC1?\b/i },
  { name: "Editing window", nameZh: "编辑窗口", type: "editing_window", aliases: ["editing window", "protospacer positions 4-8"], description: "碱基编辑器在 protospacer 中高效编辑的碱基位置范围。", pattern: /\bediting window\b/i },
  { name: "DNA off-target editing", nameZh: "DNA 脱靶编辑", type: "off_target", aliases: ["DNA off-target", "off-target DNA editing"], description: "与目标位点序列相似的其他基因组位点发生的非预期编辑。", pattern: /\bDNA off-?target/i },
  { name: "RNA off-target editing", nameZh: "RNA 脱靶编辑", type: "off_target", aliases: ["RNA off-target", "transcriptome-wide RNA editing"], description: "碱基编辑器脱氨酶对转录组 RNA 造成的非预期编辑。", pattern: /\bRNA off-?target|transcriptome-wide/i },
  { name: "Lipid nanoparticle (LNP)", nameZh: "脂质纳米颗粒递送", type: "delivery", aliases: ["LNP", "lipid nanoparticle"], description: "以脂质纳米颗粒递送碱基编辑器 mRNA/sgRNA 的体内递送平台。", pattern: /\b(LNP|lipid nanoparticle)\b/i },
  { name: "AAV delivery", nameZh: "AAV 递送", type: "delivery", aliases: ["AAV", "adeno-associated virus"], description: "以腺相关病毒为载体递送碱基编辑器的策略。", pattern: /\b(AAV|adeno-associated virus)\b/i },
  { name: "In vivo base editing", nameZh: "体内碱基编辑", type: "in_vivo", aliases: ["in vivo base editing", "in vivo editing"], description: "在活体动物或患者体内直接进行碱基编辑。", pattern: /\bin vivo\b/i },
  { name: "Prime editing", nameZh: "先导编辑", type: "technology", aliases: ["prime editing", "PE2", "PE3"], description: "基于逆转录酶的精准编辑技术，常作为碱基编辑的对照。", pattern: /\bprime editing\b/i },
  { name: "Sickle cell disease", nameZh: "镰状细胞病", type: "disease", aliases: ["sickle cell disease", "SCD"], description: "由 HBB 突变引起的血红蛋白病，是碱基编辑治疗的重点方向。", pattern: /\bsickle cell\b/i },
  { name: "Leber congenital amaurosis", nameZh: "Leber 先天性黑蒙", type: "disease", aliases: ["Leber congenital amaurosis", "LCA"], description: "导致儿童失明的遗传性视网膜疾病。", pattern: /\bLeber congenital amaurosis|\bLCA\b/i },
  { name: "Duchenne muscular dystrophy", nameZh: "杜氏肌营养不良", type: "disease", aliases: ["Duchenne muscular dystrophy", "DMD"], description: "X 连锁的进行性肌肉萎缩症。", pattern: /\bDuchenne muscular dystrophy|\bDMD\b/i },
  { name: "Clinical translation", nameZh: "临床转化", type: "research_direction", aliases: ["clinical translation", "clinical trial"], description: "碱基编辑从动物模型向患者治疗的转化研究。", pattern: /\bclinical (translation|trial)\b/i },
];

export const NAV_ITEMS = [
  { href: "/", label: "首页", en: "Today" },
  { href: "/papers", label: "文献库", en: "Library" },
  { href: "/graph", label: "知识图谱", en: "Graph" },
  { href: "/timeline", label: "技术时间线", en: "Timeline" },
  { href: "/weekly", label: "每周进展", en: "Weekly" },
  { href: "/agent", label: "Agent", en: "Runs" },
];

export const PRIMARY_SEARCH_QUERY = [
  '("base editing" OR "base editor" OR "cytosine base editor" OR "adenine base editor"',
  'OR "ABE8e" OR "BE4max" OR "TadA" OR "CBE" OR "ABE")',
  "AND (CRISPR OR Cas9 OR deaminase OR genome)",
].join(" ");

export const TIMELINE_CATEGORY_LABEL: Record<string, string> = {
  editors: "编辑器技术",
  safety: "安全性",
  delivery: "递送技术",
  disease: "疾病治疗",
  field: "领域发展",
  milestone: "里程碑",
};
