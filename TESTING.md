# 测试与验收记录

> 本文件记录**实际执行**过的测试与结果。环境：Windows 11，Node.js 24.15，better-sqlite3（WAL），Chrome 156（Playwright core）。

---

## 1. 自动化测试

```bash
npm test
```

```
Test Files  9 passed (9)
Tests       45 passed (45)
Duration    ~1 s
```

| 文件 | 覆盖点 |
| --- | --- |
| `tests/normalize.test.ts` | DOI 规范化（大小写、前缀、尾标点）、PMID、HTML/数字实体、标题相似度、日期解析 |
| `tests/dedupe.test.ts` | 三源合并、不同 DOI 永不误合并、撤稿严重度取最大、摘要/关键词合并 |
| `tests/relevance.test.ts` | 核心碱基编辑识别、无关 CRISPR 排除、安全/递送焦点、连字符/复数形式、标题强信号下限 |
| `tests/quality.test.ts` | 7 维评分边界、撤稿可靠性归零、预印本可靠性上限 |
| `tests/time.test.ts` | 跨月日期、周一制周区间、Asia/Singapore → UTC、下次每日/每周时间 |
| `tests/pubmed.test.ts` | PubMed XML：PMID/DOI/PMCID、作者、摘要、撤稿信号、同行评审 |
| `tests/db.test.ts` | 候选隔离、DOI 反查、收藏/进度/笔记/历史、单日推荐唯一、实体别名去重、关系唯一、任务原子领取/去重、设置持久化、个性化推荐、全局搜索、洞察聚合 |
| `tests/bibtex.test.ts` | BibTeX 文章条目、缺失期刊回退、多篇合并、作者/DOI/PMID/PMCID 字段 |
| `tests/journal-metrics.test.ts` | 期刊名/ISSN 规范化、JCR CSV 导入、CWTS SNIP / SCImago SJR 导入、指标回写、门槛筛选、未知期刊策略、低于阈值拒绝 |

构建：

```bash
npm run build      # ✓ Compiled successfully；所有页面为动态渲染
```

---

## 2. 真实学术 API 冒烟测试

```bash
npm run live:check
```

2026-11-04 实际结果（窗口 2026-09-20 → 2026-11-04）：

```
Europe PMC: 20 条
PubMed:     15 条
去重后:     32 篇（3 篇由多源合并）
```

前 3 篇：

| 论文 | DOI | PubMed | 撤稿 | 全文 | 质量 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| In vivo base editing … HFE hemochromatosis | pass | pass | none | OA | 78.9 | accepted |
| Minimal indel-inducing … Cas12b | pass | pass | none | OA（PMC13691310） | 73.3 | accepted |
| A single liver-sparing myotropic AAV … | pass | pass | none | OA（PMC13722381） | 75.0 | accepted |

全文与图表解析（PMC13691310）：

```
21 个正文段落章节，35,336 字符，4 张图，
4 张可解析到 PMC CDN 原始图片 URL，许可 CC BY-NC-ND
Figure 1: 6 个子图；Figure 3: 10 个子图
```

> 只读脚本，不写数据库。

---

## 3. 端到端入库（真实数据 + 真实 AI）

命令：

```bash
npm run pipeline:run -- --limit=15 --since-days=120 --deep-reads=1 --figures=2
```

首轮结果：

- 检索：Europe PMC 15 + PubMed 15 + 经典论文 12 = 42 条来源记录；
- 去重：40 篇（2 篇多源合并）；
- 相关性预筛：7 篇进入核验；
- 核验与门槛：**7/7 accepted**，综合评分 67.3–87.0；
- 全文：2 篇 OA 解析成功（21/30 段、4/6 图），5 篇如实标记摘要级；
- 中文标题：7 条；
- AI 精讲：2 篇（1 篇摘要级 + 1 篇全文级）；
- 逐图分析：4 张；
- 知识图谱：44 实体 / 48 关系 / 7 时间线事件；
- 推荐：1 条；
- 本轮 AI 成本：约 **$1.93**。

后续修正与二次核验：

- 修正 OpenAlex 过度声明 OA、许可不可存储时降级摘要级；
- 修复连字符/复数碱基编辑术语识别（`base-editing`、`base editors`）；
- 执行 `npm run db:reverify` 后：**12 accepted / 9 rejected**，其中 4 篇此前误拒的核心论文（BE3 创制、综述等）被重新接纳；
- 当前数据：12 篇 accepted，12 个不同 DOI/PMID，无重复 `title_key`；
- 60 个知识实体、66 条有证据关系、10 个时间线事件；
- 4 张 Figure 已有逐图分析；8 篇 accepted 论文尚无精讲（AI 预算/时间限制，页面明确显示「尚未生成」）。

> 所有数字来自实际数据库（见下节审计）。

---

## 4. 数据一致性审计（SQL 实测）

```text
accepted / rejected / candidate: 12 / 9 / 0
accepted 唯一 DOI / PMID:         12 / 12（12 篇）
重复 title_key:                   0
推荐引用非 accepted:              0
同一天重复推荐:                   0
图表引用非 accepted:              0
图谱关系缺证据/引用非 accepted:   0
时间线引用非 accepted:            0
AI 分析孤记录:                    0
accepted 尚无精讲:                8（明确显示，不伪造）
有逐图分析的 Figure:              4
实体 / 关系 / 事件:               60 / 66 / 10
每周报告:                         1 篇，36,097 字符，引用 12 篇，claude-haiku-5-5
每篇论文平均来源:                 5.81
```

结论：每个对外模块都读取同一个 `paper_id`；不存在重复论文记录；未通过核验的 9 篇只存在于候选/拒绝区。

---

## 5. 前端与交互验证（生产构建 + 浏览器）

命令：

```bash
npm run build && npm start
npx tsx scripts/qa.ts
```

Playwright/Chrome 实测结果（截图在 `data/screens/`，JSON 为 `qa-report.json`）：

- **控制台错误：0；页面异常：0；失败请求：0**（忽略 Next prefetch 的 `_rsc` 主动取消）。
- 页面：首页、文献库、筛选结果、论文精讲、知识图谱、时间线、周报列表、周报详情、Agent、候选审核、设置全部 HTTP 200 且无错误覆盖层。
- 论文页：4/4 图片从 PMC CDN 成功加载（naturalWidth 1600）；逐图分析渲染；阅读进度保存（滚动后 0.73）；笔记自动保存；收藏切换后持久化并恢复初始状态。
- 文献库：主题/评分筛选生效；分页；搜索参数保留。
- 知识图谱：Canvas 渲染、类型/年份筛选、节点点击面板。
- 时间线：年份分组、日期类型徽标、证据折叠。
- 周报详情：Markdown 表格渲染（33 行）、论文引用链接（165 个 `/papers/` 链接）、无残留原始 Markdown 链接。
- Agent：worker 在线、任务队列、真实日志、时区一致（Asia/Singapore）。
- 候选审核：默认展示全部候选，9 条 rejected 记录含核验证据与拒绝原因；人工通过受身份/撤稿/评分门槛约束。
- 设置：保存后 worker 30 秒内重新加载调度；在线备份 API 实测成功（`data/backups/baseedit-*.db`，3.7 MB）。
- 深色模式：`html.dark` 生效，首页截图正常。
- 首页 **P0 研究控制台**：双轨精选 / 手动检索 / 精讲队列 / 候选审核 / 运行控制 5 个标签全部可切换，内容校验通过（见 `qa-report.json` 的 `consoleTabs`）。
- **全局搜索** `/search?q=base editing`：论文与知识实体分组均有结果，无控制台错误。
- **研究洞察** `/insights`：发表年份分布与个性化推荐渲染正常。
- **论文对比** `/compare?ids=…`：2 篇并排比较，主要结果/创新/局限/数据字段完整。
- **对比浮层**：文献库点击「对比」后出现「已选 1 篇论文」浮层，可清空，localStorage 行为正常。
- **期刊指标**：文献库卡片显示 `2yr` 徽标；`/papers?minMetric=5` 筛选项生效；设置页显示指标覆盖、JCR 导入与 OpenAlex 刷新入口；论文页图表图片可随滚动加载，PMC CDN 无失败请求。
- 移动端（390×844）：`/`、`/papers`、`/papers/[id]`、`/insights`、`/search`、`/compare` 横向溢出均为 0px。
- Windows 静默启动器：Stop 后健康检查为 000；`Start-BaseEdit-Insight.ps1 -NoBrowser` 静默启动后健康检查 200、worker 在线；桌面快捷方式目标为 `wscript.exe` + `Start-BaseEdit-Insight.vbs`，图标为 `assets/baseedit.ico`。

> 未验证项不会标记为通过；见第 7 节。

---

## 6. 定时任务真实验证

目标：证明任务由独立 worker 的 cron 触发，而非浏览器。

步骤与结果：

1. 启动 `npm run worker`，确认心跳在线；
2. 设置页把每日时间改为 **05:55**（Asia/Singapore），阈值临时提高（95 / 15 / 1）；
3. 将当日已有 CLI 任务的 payload 日期临时回退，避免去重拦截；
4. **05:55:00 SGT**，worker 自动创建任务 `job_bb7149aa-bc6b-491f-95de-1060c2d3c7b2`，`requested_by='scheduler'`；
5. 任务从 queued → running → succeeded（21:55:02 → 22:03:13 UTC，约 8 分钟）；
6. 任务实际执行了检索、去重、候选审核、精讲补齐、逐图分析、知识抽取；日志与成本（$1.9074）落库；
7. 恢复 08:00 与正常阈值；重启 worker 后确认不会重复创建当天任务（`daily jobs = 1`）。

结论：定时任务由独立进程可靠触发；浏览器关闭不影响；重复调度有数据库级去重。

> 说明：该次验证运行在加入「分阶段 progress_json」之前的构建上，因此 Agent 页对这次历史任务只显示核验阶段。后续任务会显示检索/核验/全文/精讲/推荐/逐图/知识/完成各阶段进度。

---

## 7. 已知未测试项

- Docker 构建与 Compose 运行（本机未安装 Docker；Dockerfile/compose 未实测）。
- 公网反向代理 + Basic Auth（提供配置示例，未实测）。
- Windows 服务注册（NSSM/任务计划程序，提供说明，未实测）。
- >10,000 篇文献规模下的搜索性能。
- 非 Europe PMC 来源 PDF 全文解析（未实现）。
- 定时任务的 DST 时区切换（当前默认时区无夏令时）。
