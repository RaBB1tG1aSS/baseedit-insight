import type { AiAnalysis, DeepReadContent, Figure, Paper, SourceLink, VerificationRecord } from "@/lib/types";

function section(title: string, body: string | null | undefined): string {
  if (!body || !body.trim()) return "";
  return `## ${title}\n\n${body.trim()}\n`;
}

function bullets(items: string[] | undefined): string {
  if (!items?.length) return "";
  return items.map((item) => `- ${item}`).join("\n");
}

export function deepReadToMarkdown(params: {
  paper: Paper;
  analysis: AiAnalysis | null;
  figures: Figure[];
  sources: SourceLink[];
  verifications: VerificationRecord[];
}): string {
  const { paper, analysis, figures, sources, verifications } = params;
  const content = (analysis?.content ?? null) as DeepReadContent | null;
  const lines: string[] = [];

  lines.push(`# ${paper.title}`, "");
  if (paper.titleZh) lines.push(`**中文标题**：${paper.titleZh}`, "");
  lines.push(`> ${paper.journal ?? "期刊未知"} · ${paper.publicationDate ?? "日期未知"} · ${paper.articleType ?? "论文"}`);
  lines.push("");
  lines.push(
    [
      `- DOI: ${paper.doi ?? "无"}`,
      `- PMID: ${paper.pmid ?? "无"}`,
      `- PMCID: ${paper.pmcid ?? "无"}`,
      `- 作者: ${paper.authors.join(", ") || "未收录"}`,
      `- 综合评分: ${paper.qualityScore ?? "未评分"}/100`,
      `- 同行评审: ${paper.peerReviewStatus}`,
      `- 撤稿状态: ${paper.retractionStatus}`,
      `- 分析层级: ${analysis?.analysisLevel === "full_text" ? "全文" : "仅摘要"}`,
      `- 分析模型: ${analysis ? `${analysis.model} (${analysis.provider})` : "尚未生成"}`,
      `- 生成时间: ${analysis?.generatedAt ?? "—"}`,
    ].join("\n"),
    "",
  );
  lines.push(`原文献链接：${paper.officialUrl ?? "无"}`, "");

  if (!content) {
    lines.push("## 摘要\n", paper.abstract ?? "无摘要", "");
    lines.push("> 本文尚未生成 AI 精讲。以上仅为原始摘要，不含 AI 分析。");
    return lines.join("\n");
  }

  lines.push(section("一句话理解", content.one_liner));
  lines.push(section("研究背景", content.background.join("\n\n")));
  lines.push(section("核心科学问题", content.core_question));
  lines.push(section("研究假设", content.hypothesis));
  lines.push(section("研究目标", content.goal));

  lines.push(
    section(
      "研究思路与技术路线",
      content.approach.map((step, index) => `**${index + 1}. ${step.step}**\n\n- 科学问题：${step.question}\n- 设计理由：${step.rationale}`).join("\n\n"),
    ),
  );

  lines.push(
    section(
      "主要结果",
      content.results
        .map(
          (result) =>
            `**发现**：${result.finding}\n\n- 意义：${result.meaning}\n- 证据位置：${result.evidence_location}${result.caveat ? `\n- 其他解释/不足：${result.caveat}` : ""}`,
        )
        .join("\n\n"),
    ),
  );

  lines.push(section("创新点", content.innovations.map((item) => `- **${item.type}**：${item.description}`).join("\n")));
  lines.push(section("作者承认的局限性", bullets(content.author_limitations)));
  lines.push(section("独立分析的局限性", bullets(content.independent_limitations)));
  lines.push(section("对碱基编辑领域的意义", content.significance));
  lines.push(section("学习总结", bullets(content.takeaways)));
  lines.push(
    section(
      "关键术语",
      content.glossary.map((item) => `- **${item.term}**：${item.explanation}`).join("\n"),
    ),
  );
  lines.push(section("前置知识", bullets(content.prerequisites)));
  lines.push(
    section(
      "重点阅读章节",
      content.reading_guide.map((item) => `- ${item.section}：${item.reason}`).join("\n"),
    ),
  );

  if (content.figure_logic?.length) {
    lines.push(
      section(
        "图表论证逻辑",
        content.figure_logic.map((item) => `- **${item.figure}**：${item.role}`).join("\n"),
      ),
    );
  }

  if (figures.length) {
    lines.push("## Figure-by-Figure 逐图精讲", "");
    for (const figure of figures) {
      lines.push(`### ${figure.number}`, "");
      if (figure.legend) lines.push(`> ${figure.legend}`, "");
      if (figure.analysis) {
        const analysisContent = figure.analysis.content;
        lines.push(
          `- **研究目的**：${analysisContent.purpose}`,
          `- **科学问题**：${analysisContent.question}`,
          `- **研究设计**：${analysisContent.design}`,
          `- **数据理解**：${analysisContent.data_reading}`,
          `- **结果**：${analysisContent.result}`,
          `- **科学意义**：${analysisContent.significance}`,
          `- **批判性分析**：${analysisContent.critique}`,
          `- **逻辑联系**：${analysisContent.logic_link}`,
          "",
        );
        if (analysisContent.panels.length) {
          lines.push("**子图**", "", analysisContent.panels.map((panel) => `- (${panel.label}) ${panel.description}`).join("\n"), "");
        }
      } else {
        lines.push("_该图尚未生成逐图分析。_", "");
      }
      if (figure.sourceUrl) lines.push(`原图/来源：${figure.sourceUrl}`, "");
    }
  }

  if (content.evidence.length) {
    lines.push("## 证据引用", "");
    for (const evidence of content.evidence) {
      lines.push(`- [${evidence.nature}] ${evidence.location}：“${evidence.quote}”`);
    }
    lines.push("");
  }

  if (sources.length) {
    lines.push("## 数据来源", "");
    for (const source of sources) {
      lines.push(`- ${source.sourceName}: ${source.sourceUrl}（获取于 ${source.retrievalTime}）`);
    }
    lines.push("");
  }

  if (verifications.length) {
    lines.push("## 核验记录（最近 10 条）", "");
    for (const record of verifications.slice(0, 10)) {
      lines.push(`- ${record.checkItem} → ${record.result}：${record.notes ?? ""}`);
    }
    lines.push("");
  }

  lines.push("---", "由 BaseEdit Insight 基于中央文献数据库生成。AI 内容按事实/解释/综合/推测分层标注。");
  return lines.join("\n");
}

export function safeFilename(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}
