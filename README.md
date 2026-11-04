# BaseEdit Insight

**AI 碱基编辑文献研究与知识管理平台**

BaseEdit Insight 面向碱基编辑（base editing）研究，把「真实文献检索 → 去重 → 身份核验 → 质量评估 → 中央数据库 → AI 中文精讲 → 逐图分析 → 知识图谱 → 技术时间线 → 每周报告」做成一条可追溯、可长期积累的闭环。

它不是论文搜索页面的拼装，也不是一个把摘要丢给大模型的工具。系统只信任一个经过核验的中央文献数据库（SQLite），所有功能共享同一个 `paper_id` 与同一套证据记录。

---

## 1. 当前交付状态

### P0（已实现并真实运行）

- 中央文献数据库：22 张表，覆盖论文、来源、核验、质量、全文、图表、AI 分析、推荐、知识实体/关系、时间线、周报、个人记录、任务与日志。
- 候选文献与正式文献隔离：`papers.status` 七种状态，库/推荐/图谱/时间线/周报只读取 `accepted`。
- 真实学术 API：Europe PMC、PubMed E-utilities、Crossref；OpenAlex 与 Semantic Scholar 可选补充。
- 跨源去重与身份匹配：DOI / PMID / PMCID / OpenAlex ID + 标题相似度（含冲突保护：不同 DOI/PMID 永不合并）。
- 真实核验：DOI 解析、PubMed 交叉匹配、撤稿/勘误/关注声明、预印本、全文可访问性、元数据冲突，全部落库为核验记录。
- 可解释质量评分（100 分，7 维度），规则化且逐项给理由；质量门槛 + 相关性门槛 + 撤稿排除。
- 每日「前沿 / 经典」双轨推荐：质量优先，宁缺毋滥；同一天只产生一条主推荐。
- AI 中文深度精讲：背景、核心问题、技术路线、结果、创新、局限、意义、学习总结、术语、阅读指南、推荐语；严格区分全文级 / 摘要级。
- Figure-by-Figure 逐图精讲：Europe PMC JATS 全文解析图注与子图，PMC CDN 原图（仅 OA/CC 许可），中文分析贴在原图旁。
- 知识图谱：实体去重（含别名）、有证据关系（逐字匹配校验）、自然语言证据与证据性质分层。
- 技术时间线：区分「发表日期 / 首次报告 / 后续验证」，不把发表日当发明日。
- 每周研究进展报告：默认为周日 18:00（Asia/Singapore），直接读取中央库；AI 不可用时降级为数据模板报告并明确标注。
- 个人学习：收藏、已读/在读、阅读进度、笔记、最近阅读。
- 精美响应式前端：首页、文献库、论文精讲、知识图谱、时间线、周报、Agent 状态、候选审核、设置；浅色/深色主题。
- **首页 P0 研究控制台**：双轨精选、手动检索、精讲队列、候选审核、运行控制五个交互标签，集中完成日常 P0 操作。
- 独立后台 worker：真实任务队列、cron 调度、心跳、超时恢复、重试、取消、真实日志。
- 测试：31 个单元/数据库测试 + 真实 API 冒烟脚本 + 真实端到端入库 + 生产构建浏览器 QA（0 控制台错误）。

### P1（已实现）

知识图谱、时间线、自动知识抽取、周报历史、收藏/阅读状态/笔记、相关论文、全局搜索（LIKE 检索）、深色模式。

### P2（部分实现 / 明确边界）

- Markdown 导出 ✅；PDF 通过浏览器打印（`打印 / 导出 PDF`）✅；BibTeX ❌。
- 研究趋势统计：目前只有主题分布与引用速度信号，❌ 更复杂趋势建模。
- 个性化推荐：❌（当前为统一质量推荐）。
- 更多数据库集成：Semantic Scholar 可选接入 ✅；其余 ❌。

---

## 2. 快速开始

### 环境要求

- Node.js **22+**（已在 Node 24.15 / Windows 11 验证）
- 可选：本机已安装并登录 Claude Code（用于 `claude-cli` AI 模式，无需额外 API Key）
- 不需要 PostgreSQL、Redis、Docker

### 安装与启动

```bash
cd app
npm install

# 1) 配置（可先直接复制示例）
cp .env.example .env.local      # Windows: copy .env.example .env.local
# 编辑 .env.local：至少把 NCBI_EMAIL / OPENALEX_MAILTO 换成自己的邮箱

# 2) 初始化数据库
npm run db:migrate

# 3) 启动 Web + Worker（开发）
npm run dev:all
# 只启动 Web：npm run dev
# 只启动 Worker：npm run worker
```

打开 <http://localhost:3000>。

> 当前工作目录已包含一份**真实运行产生的数据集**：12 篇通过核验的论文、9 条拒绝候选、1 份周报、60 个知识实体与 66 条有证据关系。可以直接浏览；如需从零开始，停止服务后删除 `data/baseedit.db`（以及 `-wal` / `-shm`），再执行 `npm run db:migrate`。

> **必须启动 worker**：检索、核验、精讲、周报等任务都进入 `jobs` 队列，由独立 worker 执行。关闭浏览器不影响定时任务；关闭 worker 则任务保持排队。

### 首次数据

首页 →「立即运行检索」；或命令行：

```bash
npm run pipeline:run -- --limit=15 --since-days=120 --deep-reads=1 --figures=2
```

首次运行会真实访问 Europe PMC / PubMed / Crossref，耗时取决于网络与 AI 调用（通常 8–15 分钟）。Agent 页面可实时看到每一步日志。

---

## 3. 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Next.js 开发服务器 |
| `npm run worker` | 后台任务 + cron 调度进程 |
| `npm run dev:all` | 同时启动 Web 与 Worker |
| `npm run build` / `npm start` | 生产构建 / 启动 |
| `npm run db:migrate` | 执行数据库迁移（幂等） |
| `npm run db:backup` | SQLite 在线备份到 `data/backups/` |
| `npm run pipeline:run -- --search-only` | 只检索并核验入库，不调用 AI |
| `npm run live:check` | 真实 API 冒烟测试（不写库） |
| `npm test` | Vitest 单元/数据库测试 |

---

## 4. 架构总览

```
外部学术源                   任务层                      数据层
─────────                  ─────────                   ─────────
Europe PMC ─┐              Next.js UI / API             SQLite（中央文献库）
PubMed     ─┼─► 检索适配器 ─► jobs 队列 ─► worker ─►  papers / sources
Crossref   ─┤   去重/核验       ▲  cron 调度   │        verification_records
OpenAlex   ─┘   质量门槛       │ 手动触发       │        quality_assessments
                              └───────────────┘        full_texts / figures
                                                       ai_analyses
               推荐 / 精讲 / 图表 / 知识图谱 ◄──────────┤ knowledge_entities/relations
               时间线 / 周报 / 文献库 / 个人记录 ◄──────┘ timeline_events / weekly_reports
```

- **Single Source of Truth**：所有读接口经过 `src/server/db/repo/*`，UI 不直接拼 SQL、不维护第二份论文数据。
- **一篇论文一个 `paper_id`**：来源记录、图表、AI 分析、推荐、图谱、时间线、周报全部通过它关联。
- **证据绑定**：AI 关系/事件必须能匹配原文片段；未匹配的关系会被丢弃并记入日志。
- **状态隔离**：`accepted` 之外的数据不会出现在推荐、图谱、时间线或周报结论中。

详见 [ARCHITECTURE.md](./ARCHITECTURE.md)；P0 逐项审计见 [P0-AUDIT.md](./P0-AUDIT.md)。

---

## 5. AI 模式

### 默认：`claude-cli`（无需 API Key）

使用本机已登录的 Claude Code CLI，以 `-p --output-format json --tools "" --json-schema ...` 调用：

- 不用额外申请 Key；
- 每次调用有 `AI_MAX_BUDGET_USD` 上限（默认 $1.50/次）；
- 结构化输出由 JSON Schema 校验，失败自动重试一次；
- 模型名、provider、模板版本、生成时间全部写入 `ai_analyses`。

要求：终端可执行 `claude --version` 且已登录。

### 可选：`anthropic` Messages API

```env
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
# 可选：ANTHROPIC_BASE_URL=
```

模型默认 `claude-sonnet-5-5`，可在设置页覆盖。

### AI 不可用时

- 检索、去重、核验、入库、质量评分、数据模板周报仍可运行；
- 精讲、逐图分析、AI 知识抽取会跳过，日志明确记录原因；
- 不会生成假分析。

---

## 6. 数据来源与合规

| 来源 | 用途 | 认证 |
| --- | --- | --- |
| Europe PMC REST | 主检索、OA 全文 XML、图注、许可 | 无 |
| PubMed E-utilities | 补充检索、PMID/撤稿/勘误核验 | 可选 API Key |
| Crossref | DOI 解析、题名一致性、更新/撤稿关系 | 无（mailto 礼貌池） |
| OpenAlex | 引用数、`is_retracted`、OA 状态 | 可选 mailto |
| Semantic Scholar | 引用补充（默认关闭） | 可选 Key |
| PMC CDN | OA 论文原始图片 | 仅 CC/开放许可，页面标注来源 |

- 只保存开放获取（CC/CC0）全文与图注；非 OA 论文仅保存摘要/元数据与官方链接。
- 不保存受版权保护全文，不分发 PDF。
- 图片直接引用 PMC CDN 原始地址，并在图下标注 `Europe PMC / PMC · 许可`。
- 所有 AI 内容标注「论文事实 / 作者解释 / AI 综合 / 推测」，不把推测写成实验结果。

---

## 7. 调度与可靠性

- 默认时区 `Asia/Singapore`；每日 08:00 流水线；每周日 18:00 周报。
- worker 使用 `node-cron` 精确触发 + 每 5 分钟补偿检查（重启后补跑当天错过任务）。
- 同一类型/日期的任务不会重复创建（数据库去重）。
- 运行中任务超过 45 分钟无进度更新会被重新排队；失败按 `max_attempts` 重试。
- worker 每 10 秒写心跳；首页/设置/Agent 页面显示真实在线状态。
- 关闭浏览器不影响任务；关闭 worker 则任务仅排队。

修改调度时间：设置页 → 保存；worker 30 秒内重新加载 cron。

---

## 8. 测试与验收

```bash
npm test          # 31 passed
npm run live:check
npm run build
```

真实验收记录见 [TESTING.md](./TESTING.md)，包括：

- 真实 Europe PMC / PubMed 检索与跨源去重；
- DOI/PMID/PMCID 核验与撤稿检查；
- 质量门槛与禁止降级推荐；
- 全流程入库 + AI 精讲 + 图注解析 + 图片 URL；
- 候选隔离、单日推荐唯一、图谱实体/关系去重；
- 任务原子领取、去重、重试。

---

## 9. 主要目录

```
src/
  app/                    Next.js App Router 页面 + API
  components/             设计系统与交互组件
  lib/                    共享类型、常量、格式化
  server/
    db/                   SQLite 连接、迁移、Repository 层
    sources/              Europe PMC/PubMed/Crossref/OpenAlex/S2 适配器
    pipeline/             检索→去重→核验→质量→入库→推荐
    ai/                   provider、prompts、schema、精讲/图表/知识/周报
    fulltext/             JATS 全文与图表解析
    jobs/                 任务调度分发
    exports/              Markdown 导出
worker/index.ts           独立后台进程（队列 + cron + 心跳）
scripts/                  迁移、备份、真实检索冒烟、流水线 CLI
tests/                    Vitest 测试
data/                     SQLite 数据库与备份（git-ignored）
```

---

## 10. 已知边界（如实说明）

1. **未实现 PDF 全文解析**：只解析 Europe PMC OA JATS XML；其他 OA 出版社 PDF 不下载、不解析，因此其分析为摘要级。
2. **图片可访问性依赖 PMC CDN**：极少数情况下 CDN 变更或论文下架，页面会降级为「前往官方来源」。
3. **知识图谱规模**：关系抽取每次最多 6 篇、图谱展示上限 220 实体 / 800 关系；超出部分需分批或后续扩展。
4. **质量评分为规则化评分**：可解释、稳定，但不等于同行评议结论；引用次数只作辅助。
5. **单用户、无账号体系**：适合本地/内网。公网部署必须在反向代理层加认证（见 DEPLOYMENT.md）。
6. **周报 PDF**：使用浏览器打印生成，不是服务端 PDF 渲染。
7. **SQLite 并发**：WAL 模式适合单机；不要放在网络文件系统上。
8. **AI 输出存在不确定性**：JSON Schema 保证结构，不保证科学判断绝对正确；页面提供证据引用供核验。
9. **AI 分析按预算限量**：每轮默认补齐 2 篇精讲、4 张图；示例库中仍有 8 篇已核验论文未生成精讲，论文页会明确显示「尚未生成」并提供手动生成入口。

---

## 11. 部署

见 [DEPLOYMENT.md](./DEPLOYMENT.md)（本地生产、systemd、Docker Compose、备份恢复、反向代理认证）。

---

## 12. 许可与科研使用

本项目为科研文献阅读辅助工具，只分析科学原理、研究思路、结果与证据，不提供可直接照搬的实验操作流程、参数、序列设计或 protocol。论文全文/图表的版权归原作者与出版方所有；系统仅存储并展示开放许可内容，并保留来源与许可信息。
