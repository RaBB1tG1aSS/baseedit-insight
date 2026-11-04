import type { Figure, Paper } from "@/lib/types";

export const SYSTEM_PROMPT = `你是 BaseEdit Insight 的科研文献分析引擎，专注碱基编辑（base editing）与基因编辑领域。

必须遵守以下准则：
1. 证据约束：只使用用户提供的论文材料。不得引入外部文献的具体数据，不得编造论文、作者、期刊、DOI、图表、数值或结论。
2. 事实分层：reported_fact = 论文明确报告；author_interpretation = 作者的解释；ai_synthesis = 你基于论文的综合判断；hypothesis = 尚未验证的推测。没有直接证据的内容必须标为 ai_synthesis 或 hypothesis，绝不能写成实验事实。
3. 摘要级分析：材料标明"仅摘要"时，所有结果描述必须限定在摘要信息内，不得假装阅读过全文或 Figure，不得虚构图表内容。
4. 科研伦理与安全：只分析科学原理、研究思路、结果与证据。不输出可直接照搬的实验操作流程、具体实验参数、sgRNA/引物序列设计、转染/递送配方或操作优化步骤。
5. 语言：使用中文，专业术语保留英文（如 CBE、ABE、TadA、off-target、editing window）。
6. 引用原文证据时使用英文逐字片段，location 精确到 Figure、Results 小节或 Abstract。
7. 输出必须严格符合给定 JSON schema，不输出 schema 之外的内容，不使用 Markdown 代码围栏包裹 JSON。
8. 材料不足时使用保守、明确的表述（例如"摘要未报告"），不要编造或强行推断。`;

function authorsLine(paper: Paper): string {
  if (!paper.authors.length) return "未提供";
  const shown = paper.authors.slice(0, 8).join(", ");
  return paper.authors.length > 8 ? `${shown}, et al.` : shown;
}

export function paperHeader(paper: Paper): string {
  return [
    `论文 ID：${paper.id}`,
    `英文标题：${paper.title}`,
    `中文标题（已有，若无则空）：${paper.titleZh ?? ""}`,
    `作者：${authorsLine(paper)}`,
    `期刊：${paper.journal ?? "未知"}  发表时间：${paper.publicationDate ?? "未知"}`,
    `论文类型：${paper.articleType ?? "未知"}  同行评审状态：${paper.peerReviewStatus === "peer_reviewed" ? "同行评审" : paper.peerReviewStatus === "preprint" ? "预印本" : "未知"}`,
    `DOI：${paper.doi ?? "无"}  PMID：${paper.pmid ?? "无"}  PMCID：${paper.pmcid ?? "无"}`,
    `撤稿状态：${paper.retractionStatus}`,
    `全文状态：${paper.fullTextAccessStatus === "oa_fulltext" ? "开放获取全文" : "仅摘要"}`,
  ].join("\n");
}

export function deepReadPrompt(params: {
  paper: Paper;
  fullTextSections: { heading: string; text: string }[];
  figures: Figure[];
  maxChars?: number;
}): string {
  const { paper, fullTextSections, figures } = params;
  const maxChars = params.maxChars ?? 60_000;
  const fullText = fullTextSections
    .map((section) => `## ${section.heading}\n${section.text}`)
    .join("\n\n")
    .slice(0, maxChars);
  const analysisLevel = fullTextSections.length ? "全文" : "仅摘要（无法访问全文）";

  const figureBlock = figures.length
    ? figures
        .slice(0, 12)
        .map((figure) => `【${figure.number}】${figure.title ?? ""}\nLegend: ${(figure.legend ?? "无图注").slice(0, 2500)}`)
        .join("\n\n")
    : "无可用的 Figure 图注。";

  return `【分析级别】${analysisLevel}

${paperHeader(paper)}

【摘要】
${paper.abstract ?? "（无摘要）"}

【全文材料】
${fullText || "（未获取全文，只能基于摘要进行摘要级分析。绝不能描述 Figures 或具体数值。）"}

【图表材料】
${figureBlock}

【任务】
请完成一份真正有科研学习价值的中文深度精讲，严格按以下要求输出 JSON：

1. title_zh：准确翻译英文标题，保留基因名、编辑器名与缩写。
2. one_liner：一句话概括最重要的科学贡献（不是"本文研究了…"，而是结论）。
3. background：2–4 段，说明为什么重要、此前进展、已有技术不足、本文想解决什么。
4. core_question / hypothesis / goal：区分作者要回答的问题、研究假设与总体目标。
5. approach：按论文逻辑拆成若干步骤，每步说明它回答什么科学问题、为什么这样设计；不要只罗列技术名。
6. results：按 Results 顺序给出主要发现；每条说明作者发现了什么、证据说明什么、位置（Figure/小节）、以及可能的其他解释或不足。仅摘要时只能描述摘要中明确写出的结果。
7. innovations：区分技术创新、科学发现、应用创新、研究思路创新。
8. author_limitations（作者自己承认的局限）与 independent_limitations（你独立分析的局限）必须分开，后者关注证据充分性、模型、样本、可推广性与未解决问题。
9. significance：这篇论文在碱基编辑技术发展与科学认知中的位置。
10. takeaways：3–5 条值得记住的核心知识点（不是章节概括）。
11. glossary：关键术语及简明解释；prerequisites：读懂本文需要的前置知识。
12. reading_guide：重点阅读章节及理由；figure_logic：每张 Figure 在论证链中承担的角色，说明图与图之间的递进关系。
13. evidence：至少 3 条，逐字引用英文原文，location 精确；nature 按事实分层规则标注。
14. recommendation_*：今日推荐理由、核心创新、研究价值各一句，具体、不夸张。

再次强调：只依据以上材料；摘要级分析不得虚构图表、数值或全文细节。`;
}

export function figurePrompt(params: {
  paper: Paper;
  figure: Figure;
  fullTextSections: { heading: string; text: string }[];
  analysisSummary?: string;
}): string {
  const { paper, figure, fullTextSections, analysisSummary } = params;
  const context = fullTextSections
    .map((section) => `## ${section.heading}\n${section.text}`)
    .join("\n\n")
    .slice(0, 30_000);

  return `【任务】对以下 Figure 进行逐图精讲。

${paperHeader(paper)}

【当前 Figure】
编号：${figure.number}
标题：${figure.title ?? "无"}
图注（Legend）：${figure.legend ?? "未获取到图注"}
子图线索：${figure.panels.map((panel) => `${panel.label}: ${panel.description}`).join(" | ") || "未解析"}

【论文其他背景】
${analysisSummary ? `已有精讲摘要：${analysisSummary}` : ""}

【全文相关材料】
${context || "未获取全文，仅能依据图注与摘要进行有限分析。"}

【输出要求】
严格返回 JSON：
- purpose：作者为什么做这组研究；
- question：这组图想回答什么科学问题；
- design：为什么这样设计（对照、分组、读出方式背后的逻辑）；
- panels：A/B/C/D 等每个子图展示什么；无法判断时明确写"图注未说明"；
- data_reading：如何读坐标轴、分组、统计指标与显著性；
- result：作者实际发现了什么（只写证据支持的内容）；
- significance：这组结果在整篇论证中的作用；
- critique：证据能支持哪些结论、不能支持哪些结论、有哪些替代解释或不足；
- logic_link：与前后 Figure 的递进关系；
- evidence：至少 2 条英文逐字证据，location 用 Figure 编号 + 子图。

不得虚构图注中不存在的子图、数值或统计结果。`;
}

export interface KnowledgePaperInput {
  paper: Paper;
  oneLiner?: string;
  innovations?: string[];
  limitations?: string[];
}

export function knowledgePrompt(papers: KnowledgePaperInput[]): string {
  const blocks = papers.map((item) => {
    const paper = item.paper;
    return `===== PAPER ${paper.id} =====
标题：${paper.title}
期刊：${paper.journal ?? "未知"}；发表日期：${paper.publicationDate ?? "未知"}
摘要：${(paper.abstract ?? "无摘要").slice(0, 3500)}
${item.oneLiner ? `核心贡献：${item.oneLiner}` : ""}
${item.innovations?.length ? `创新点：${item.innovations.join("；")}` : ""}
${item.limitations?.length ? `局限：${item.limitations.join("；")}` : ""}
`;
  });

  return `【任务】从以下已核验的碱基编辑论文中抽取知识实体、有证据支持的关系，以及技术发展时间线事件。

${blocks.join("\n")}

【实体规则】
- name 使用领域通用英文名称（如 "Adenine base editor (ABE)"、"TadA-8e"、"Lipid nanoparticle (LNP)"），name_zh 为中文名。
- type 必须从 schema 枚举中选择；aliases 给出常用缩写/别称。
- 不要为同一概念创造多个同义实体；优先复用已有规范名称。
- 只抽取在材料中实际出现的实体。

【关系规则】
- 每条关系必须给出来源论文的 paper_id（必须是上面出现的 PAPER id）、逐字英文 evidence_quote、evidence_location（Abstract / Results 等）。
- relation_type 表示 source → target 的有向关系，必须能从 evidence_quote 直接读出，例如 "ABE8e improves editing efficiency"。
- nature：只有当引文直接陈述该关系时才用 reported_fact；作者解释用 author_interpretation；跨论文综合或推断用 ai_synthesis；推测用 hypothesis。
- 不要因为两篇论文方向相似就断言技术继承、改进或因果关系；没有明确证据就不建立关系。
- 可以建立 "paper mentions entity" 的事实性关系（relation_type=mentions，nature=reported_fact），但 evidence_quote 必须包含该实体名称。

【时间线规则】
- 只记录有明确证据的技术事件；date 使用论文中可支持该事件的日期。
- date_kind：publication 表示仅有发表日期；first_report 表示论文明确声称首次提出/首次实现；validation 表示后续验证或改进。
- 绝不能把论文发表日期当成技术发明日期；若只能确定发表日期，必须使用 publication。
- category 从枚举中选择；significance 1–5。
- 每篇论文最多 2 条时间线事件；没有明确技术事件时返回空数组。

只输出符合 schema 的 JSON。`;
}

export interface WeeklyPaperInput {
  paper: Paper;
  oneLiner?: string;
  innovations?: string[];
  significance?: string;
  analysisLevel?: string;
}

export function weeklyPrompt(params: {
  weekStart: string;
  weekEnd: string;
  newlyVerified: WeeklyPaperInput[];
  newlyPublished: { id: string; title: string; date: string | null }[];
  newlyRetrieved: { id: string; title: string; date: string | null }[];
}): string {
  const blocks = params.newlyVerified.map((item) => {
    const paper = item.paper;
    return `===== PAPER ${paper.id} =====
标题：${paper.title}${paper.titleZh ? `（${paper.titleZh}）` : ""}
期刊：${paper.journal ?? "未知"}；发表日期：${paper.publicationDate ?? "未知"}；类型：${paper.articleType ?? "未知"}
质量评分：${paper.qualityScore ?? "未评分"}
摘要：${(paper.abstract ?? "无摘要").slice(0, 2200)}
${item.oneLiner ? `一句话贡献：${item.oneLiner}` : ""}
${item.innovations?.length ? `创新点：${item.innovations.join("；")}` : ""}
${item.significance ? `领域意义：${item.significance}` : ""}
`;
  });

  return `【任务】生成 ${params.weekStart} 至 ${params.weekEnd} 的碱基编辑领域每周研究进展报告。材料只能来自下面列出的、已通过核验并入库的论文。

【本周通过核验并入库的论文】
${blocks.join("\n") || "（本周没有新增通过核验的论文）"}

【本周新发表（可能尚未入库核验）】
${params.newlyPublished.map((p) => `- ${p.id} | ${p.date ?? "日期未知"} | ${p.title}`).join("\n") || "（无）"}

【本周新检索到的历史论文】
${params.newlyRetrieved.map((p) => `- ${p.id} | ${p.date ?? "日期未知"} | ${p.title}`).join("\n") || "（无）"}

【输出要求】
严格返回 JSON：title、period_label、sections（至少 3 节）。sections 建议按以下 key 组织，可合并但不能没有实质内容：
- overview：本周研究概览
- representative：代表性研究及其科学贡献
- breakthroughs：核心技术突破（编辑器、效率、特异性、脱靶、递送、体内编辑、疾病治疗）
- trends：研究方向变化（必须基于多篇论文的共同证据）
- connections：论文之间的联系与团队思路比较
- open_questions：尚未解决的问题与瓶颈
- future_directions：值得关注的方向
- knowledge：本周知识积累（术语、技术、结论）

每节 body_md 使用 Markdown；paper_ids 列出该节引用的论文 id（只能使用上面出现的 id）。
要求：
1. 不得虚构论文、数据或结论；不得把 AI 推测写成领域共识。
2. 如果本周文献数量不足，明确说明样本有限，不得夸大趋势。
3. 区分"本周新发表""本周新检索到的历史论文""本周通过核验并入库"三类。
4. 中文写作，专业术语保留英文。`;
}

export function translationPrompt(items: { id: string; title: string }[]): string {
  return `请把以下碱基编辑/基因编辑论文标题准确翻译为中文。要求：
- 保留基因名、蛋白名、编辑器名与通用缩写（如 ABE、CBE、TadA、AAV、LNP）。
- 使用领域内通行译法，不要意译成营销式标题。
- 每条只翻译标题，不添加解释。
- 返回 JSON：{ "items": [ { "paper_id": "...", "title_zh": "..." } ] }

${items.map((item) => `- ${item.id} | ${item.title}`).join("\n")}`;
}
