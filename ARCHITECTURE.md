# BaseEdit Insight — 架构说明

## 1. 核心不变量（代码必须遵守）

1. **中央文献数据库是唯一可信数据源。** 页面、推荐、精讲、图表、图谱、时间线、周报全部读取 `src/server/db/repo/*`。
2. **一篇论文只有一个 `papers.id`。** 外部标识符（DOI/PMID/PMCID/OpenAlex）只是匹配键，可空、可多源关联。
3. **`accepted` 是唯一可对外的状态。** 候选、拒绝、待复核数据不会进入推荐、图谱、时间线或周报结论。
4. **AI 内容必须绑定论文与证据。** 每条 `ai_analyses` 记录包含 `paper_id`、模板版本、模型、provider、生成时间；关系/事件必须附带可匹配的原文片段。
5. **事实分层。** `reported_fact / author_interpretation / ai_synthesis / hypothesis` 四类证据性质贯穿数据库与 UI。
6. **元数据变更可失效 AI 内容。** 标题、期刊、日期、发表状态、撤稿状态变化时 `data_version+1` 并标记 `needs_analysis_refresh`。
7. **质量门槛不可静默降低。** 每日没有合格论文时允许没有推荐，不允许把低质量论文包装成推荐。
8. **后台任务与 Web 解耦。** 定时任务由独立 worker 进程执行，不依赖浏览器。

---

## 2. 数据模型

迁移位于 `src/server/db/migrations/0001_init.ts`，由 `schema_migrations` 跟踪，checksum 防止已应用迁移被篡改。

### 2.1 核心表

| 表 | 作用 |
| --- | --- |
| `papers` | 论文主表；`id` 为永久内部主键；`status` 七态；`title_key` 用于去重 |
| `sources` | 每个数据库来源的原始记录与链接；`(source_name, external_id)` 唯一 |
| `verification_records` | 每次核验的检查项、结果、证据、时间 |
| `quality_assessments` | 7 个维度逐项分数 + 理由 + 方法（rule/llm） |
| `full_texts` | 全文访问状态、许可、可存储性、解析后的章节 JSON |
| `figures` | 图号、图注、子图、原始图片 URL、属性标注 |
| `ai_analyses` | 精讲/逐图/知识/周报生成物；`(paper_id, kind, figure_id)` 历史保留 |
| `daily_recommendations` | 每日唯一主推荐；`rec_date` 唯一 |
| `knowledge_entities` | 规范实体 + 别名 + 类型；`(type, normalized_name)` 唯一 |
| `knowledge_relations` | 有向关系 + 论文 + 逐字证据 + 证据性质 + 置信度 |
| `entity_paper_links` | 论文—实体提及/关系链接 |
| `timeline_events` | 事件日期 + 日期类型（发表/首次报告/验证）+ 证据 |
| `weekly_reports` | 周报 JSON + Markdown + 引用论文；`week_start` 唯一 |
| `user_records` / `reading_events` | 收藏、阅读状态、进度、笔记、打开历史 |
| `jobs` / `job_logs` | 任务队列、真实进度、执行日志 |
| `settings` / `worker_heartbeats` | 可编辑配置、worker 在线状态 |
| `search_runs` | 每次检索的查询、来源、结果数、耗时、错误 |
| `paper_change_log` | 字段级变更留痕 |

### 2.2 状态机

```
discovered → candidate → metadata_verified → quality_assessed → accepted
                                   ↘ needs_review
                                   ↘ rejected
accepted --(撤稿发现)--> rejected（AI 内容标记 stale）
```

- 身份未核验 → `needs_review`
- 撤稿 / 类型为撤稿声明 / 相关性不足 / 低于质量门槛 → `rejected`
- 仅当 `identityVerified && retraction != retracted && relevance >= min && total >= min && 无冲突` → `accepted`

---

## 3. 处理流水线

入口：`src/server/pipeline/runDaily.ts`，由 worker 的 `daily_pipeline` 任务调用。

```
Europe PMC / PubMed 检索（最近 21 天；首次运行 180 天）
        ↓ 合并 + 跨源记录去重（DOI/PMID/PMCID/OpenAlex + 标题相似度 + 标识符冲突保护）
        ↓ 相关性预筛（必须命中碱基编辑核心术语，排除 incidental CRISPR）
        ↓ 逐篇核验（Crossref DOI、PubMed、Europe PMC、OpenAlex）
        ↓ 质量评分（7 维规则，100 分）
        ↓ 门槛判定（accepted / needs_review / rejected）
        ↓ 入库（papers + sources + verification_records + quality_assessments）
        ↓ OA 全文 + 图注 + PMC 图片
        ↓ 中文标题翻译（批量）
        ↓ 深度精讲（最多 2 篇/轮，优先新入库与高分）
        ↓ 每日推荐（质量优先；无合格候选则留空）
        ↓ 逐图分析（默认最多 4 张/轮）
        ↓ 知识图谱与时间线（批量 6 篇，证据逐字校验）
        ↓ 周报（配置日且到点）
        ↓ 撤稿状态复查（最多 2 篇/轮）
```

关键文件：

| 阶段 | 文件 |
| --- | --- |
| 检索 | `src/server/sources/{europepmc,pubmed,crossref,openalex,semantic}.ts` |
| 去重 | `pipeline/dedupe.ts` |
| 相关性 | `pipeline/relevance.ts` |
| 核验 | `pipeline/verify.ts` |
| 质量 | `pipeline/quality.ts` |
| 门槛 | `pipeline/gate.ts` |
| 入库 | `pipeline/ingest.ts` |
| 推荐 | `pipeline/recommend.ts` |
| 全文/图表 | `fulltext/europepmc.ts` |
| 分析 | `ai/{deepRead,figureRead,knowledge,weekly,translate}.ts` |
| 状态复查 | `pipeline/statusWatch.ts` |

---

## 4. AI 层

### 4.1 Provider

`ai/provider.ts` 支持：

- `claude-cli`：`spawn(claude, ["-p","--output-format","json","--tools","","--system-prompt",...,"--json-schema",...])`，prompt 从 stdin 传入；
- `anthropic`：直接调用 Messages API。

`ai/client.ts` 负责：

- 从数据库读取 provider/model；
- 用 Zod 生成 JSON Schema；
- 校验 `structured_output` / `result`；
- 失败自动重试一次；
- 记录模型、provider、模板版本、单次成本。

### 4.2 模板版本

| 版本 | 用途 |
| --- | --- |
| `deep-read-v1` | 中文深度精讲 + 推荐语 |
| `figure-read-v1` | 单图逐图分析 |
| `knowledge-v1` | 实体、关系、时间线事件 |
| `weekly-v1` | 每周报告 |
| `translate-v1` | 标题翻译 |

### 4.3 证据校验

`ai/knowledge.ts` 中的 `quoteSupported()` 会把模型给出的 `evidence_quote` 与论文标题、摘要、已生成精讲做规范化匹配（支持省略号分段）。匹配失败的关系/事件直接丢弃并计入日志；这是防止「看起来合理但无原文支持」的关键闸门。

### 4.4 失败与降级

- 精讲失败：记录失败分析（`status=failed`），不覆盖旧的成功版本；页面显示「尚未生成」。
- 知识抽取失败：回退为规则抽取，只创建「论文提及实体」链接，不生成推测关系。
- 周报失败 / AI 不可用：生成数据模板报告，`model=deterministic`，UI 明确提示「无 AI 综合分析」。
- AI 不可用：整个流水线继续，只是跳过精讲/图表/AI 知识抽取。

---

## 5. 任务与调度

`jobs` 表即队列，状态：`queued → running → succeeded / failed / cancelled`。

- 手动触发：`POST /api/jobs` 写入队列，worker 轮询领取。
- 定时触发：worker 持有 `node-cron` 任务（时区来自设置），另有 5 分钟补偿检查。
- 原子领取：`claimNextJob()` 在事务中 `UPDATE ... WHERE status='queued'`，多 worker 安全。
- 去重：同类型 + 相同 payload 的 queued/running 任务不会重复创建。
- 超时恢复：运行中且 `locked_at` 超过 45 分钟的任务重新排队。
- 重试：`failJob()` 根据 `attempts < max_attempts` 决定重新排队或失败。
- 进度：每个阶段写入 `progress_json` 与 `job_logs`；UI 仅展示这些真实值。

任务类型：`daily_pipeline`、`weekly_report`、`search_only`、`manual_analysis`、`reanalyze_paper`、`knowledge_update`、`reverify_paper`、`status_watch`。

---

## 6. 统一数据访问层

`src/server/db/repository` 语义由以下 repo 文件实现：

| 文件 | 主要接口 |
| --- | --- |
| `repo/papers.ts` | `getAcceptedPaperById`、`searchAcceptedPapers`、`findPaperByExternalIds`、`getRelatedPapers`、`insertPaper`、`updatePaper` |
| `repo/analysis.ts` | `getFigures`、`getLatestAnalysis`、`getQualityAssessment`、`getSources`、`getVerificationRecords`、`getFullText` |
| `repo/knowledge.ts` | `getGraph`、`getRelationsForEntity`、`getTimelineEvents`、`insertRecommendation`、`getWeeklyReport` |
| `repo/user.ts` | 收藏、阅读状态、进度、笔记、历史 |
| `repo/jobs.ts` | 队列、日志、统计 |
| `repo/settings.ts` | 配置读写与默认值 |
| `repo/dashboard.ts` | 首页聚合、worker 心跳 |

约束：**页面/组件不得直接 import `better-sqlite3` 或手写 SQL**；新增功能必须扩展 repository。

---

## 7. 数据一致性细节

- 外部标识符冲突（两个不同 DOI/PMID）会阻止标题相似度合并——避免把两篇不同论文错误合并。
- DOI 唯一索引、PMID 唯一索引、PMCID 唯一索引；`title_key` 索引用于快速找回。
- `updatePaper()` 记录每一处字段变化到 `paper_change_log`；关键字段变化 bump `data_version`。
- 重核验发现撤稿：`retraction_status=retracted`、`publication_status=retracted`、`status=rejected`、AI 内容 `stale`。
- 论文元数据变化后，精讲页面显示「内容可能过期」并允许重新生成。
- 推荐表 `rec_date` 唯一；同一天重复执行推荐不会产生第二条记录。
- 周报 `week_start` 唯一；同周重复生成会更新同一条记录。

---

## 8. 前端结构

- App Router + Server Components 读取数据库；交互组件（收藏、笔记、进度、任务、图谱、筛选）为客户端组件。
- 设计系统在 `src/app/globals.css`：CSS 变量 + Tailwind v4 `@theme`，浅色/深色同一套 token。
- 论文阅读页为 3 栏：目录 / 正文 / 元信息与笔记；图卡在移动端堆叠。
- 知识图谱使用 `react-force-graph-2d`（仅客户端加载），节点/边数据全部来自服务端 Central DB。
- 所有任务按钮都显示真实排队/结果信息，不伪造进度。
