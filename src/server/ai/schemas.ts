import { z } from "zod";

export const evidenceNatureSchema = z.enum([
  "reported_fact",
  "author_interpretation",
  "ai_synthesis",
  "hypothesis",
]);

export const evidenceSchema = z.object({
  location: z.string().describe("Figure 2 / Results §3.1 / Abstract 等具体位置"),
  quote: z.string().describe("来自论文原文的逐字英文证据片段"),
  nature: evidenceNatureSchema,
});

export const deepReadSchema = z.object({
  title_zh: z.string().describe("论文标题的准确中文翻译"),
  one_liner: z.string().describe("一句话概括最重要的科学贡献"),
  background: z.array(z.string()).min(1).describe("研究背景，2-4 段"),
  core_question: z.string(),
  hypothesis: z.string(),
  goal: z.string(),
  approach: z
    .array(
      z.object({
        step: z.string(),
        question: z.string().describe("这一步回答什么科学问题"),
        rationale: z.string().describe("为什么这样设计"),
      }),
    )
    .min(1),
  results: z
    .array(
      z.object({
        finding: z.string(),
        meaning: z.string(),
        evidence_location: z.string(),
        caveat: z.string().optional().default(""),
      }),
    )
    .min(1),
  innovations: z
    .array(z.object({ type: z.string(), description: z.string() }))
    .min(1),
  author_limitations: z.array(z.string()),
  independent_limitations: z.array(z.string()),
  significance: z.string(),
  takeaways: z.array(z.string()).min(3).max(5),
  glossary: z.array(z.object({ term: z.string(), explanation: z.string() })),
  prerequisites: z.array(z.string()),
  reading_guide: z.array(z.object({ section: z.string(), reason: z.string() })),
  figure_logic: z.array(z.object({ figure: z.string(), role: z.string() })),
  evidence: z.array(evidenceSchema).min(1),
  recommendation_reason: z.string().describe("今天为什么值得读这篇论文"),
  recommendation_innovation: z.string().describe("一句话核心创新"),
  recommendation_value: z.string().describe("一句话研究价值"),
});

export const figureAnalysisSchema = z.object({
  purpose: z.string().describe("作者为什么做这组研究"),
  question: z.string(),
  design: z.string().describe("实验/分析设计及其科学逻辑"),
  panels: z.array(z.object({ label: z.string(), description: z.string() })),
  data_reading: z.string().describe("坐标、分组、统计指标如何读"),
  result: z.string(),
  significance: z.string(),
  critique: z.string().describe("这些证据能支持什么、不能支持什么"),
  logic_link: z.string().describe("这张图与前后图的论证关系"),
  evidence: z.array(evidenceSchema).min(1),
});

export const entityTypeSchema = z.enum([
  "editor",
  "editor_generation",
  "editing_window",
  "efficiency",
  "specificity",
  "off_target",
  "delivery",
  "in_vivo",
  "disease",
  "application",
  "research_team",
  "researcher",
  "technology",
  "research_direction",
  "concept",
]);

export const relationTypeSchema = z.enum([
  "develops",
  "improves",
  "reduces",
  "increases",
  "enables",
  "uses",
  "delivered_by",
  "applied_to",
  "targets",
  "causes",
  "associated_with",
  "compared_with",
  "validates",
  "mentions",
]);

export const knowledgeExtractionSchema = z.object({
  entities: z
    .array(
      z.object({
        name: z.string(),
        name_zh: z.string().optional().default(""),
        type: entityTypeSchema,
        description: z.string().default(""),
        aliases: z.array(z.string()).default([]),
      }),
    )
    .min(1),
  relations: z.array(
    z.object({
      source: z.string(),
      target: z.string(),
      relation_type: relationTypeSchema,
      paper_id: z.string(),
      evidence_quote: z.string(),
      evidence_location: z.string(),
      nature: evidenceNatureSchema,
      confidence: z.number().min(0).max(1),
    }),
  ),
  timeline: z.array(
    z.object({
      paper_id: z.string(),
      date: z.string().describe("YYYY-MM-DD"),
      date_kind: z.enum(["publication", "first_report", "validation"]),
      title: z.string(),
      title_zh: z.string().default(""),
      description: z.string(),
      category: z.enum(["editors", "safety", "delivery", "disease", "field", "milestone"]),
      evidence_quote: z.string(),
      significance: z.number().min(1).max(5),
    }),
  ),
});

export const weeklyReportSchema = z.object({
  title: z.string(),
  period_label: z.string(),
  sections: z
    .array(
      z.object({
        key: z.string(),
        heading: z.string(),
        body_md: z.string(),
        paper_ids: z.array(z.string()),
      }),
    )
    .min(3),
});

export const titleTranslationSchema = z.object({
  items: z.array(z.object({ paper_id: z.string(), title_zh: z.string() })).min(1),
});

export type DeepReadOutput = z.infer<typeof deepReadSchema>;
export type FigureAnalysisOutput = z.infer<typeof figureAnalysisSchema>;
export type KnowledgeExtractionOutput = z.infer<typeof knowledgeExtractionSchema>;
export type WeeklyReportOutput = z.infer<typeof weeklyReportSchema>;
