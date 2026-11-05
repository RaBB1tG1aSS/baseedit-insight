# 期刊影响力筛选

BaseEdit Insight 支持按期刊影响力筛选论文，但**不内置、不抓取、不分发 Clarivate JCR 影响因子**。JCR 是授权数据，需由你所在机构导出后本地导入。

同时提供 **OpenAlex 2-year mean citedness** 作为公开的引用指标替代；它不是 Impact Factor，界面中始终标记为 `2yr`，不会伪装成 IF。

---

## 0. 如何合法获取 JCR CSV

### 方式 A：机构订阅（最常见、推荐）

JCR 本身需要机构订阅，匿名访问会跳转到登录页。一般路径：

1. 从学校/研究所图书馆的数据库列表进入 **Journal Citation Reports**，使用校园网、VPN、Shibboleth 或 OpenAthens 登录；
2. 选择年份（例如 2026 年发布的 JCR）；
3. 按学科类别、出版社、ISSN 或期刊名筛选（碱基编辑常用类别：Genetics & Heredity、Biotechnology & Applied Microbiology、Cell Biology、Medicine Research & Experimental、Hematology）；
4. 勾选期刊后使用 **Export / 导出**，选择 **CSV / Excel**，包含 Journal、JIF、JIF Quartile、JCI、Category、ISSN 等字段；
5. 单次导出通常有数量上限（常见为 500 条，具体以你机构界面为准）；超过时按学科/年份/出版社分批导出；
6. 保存为 CSV，在 BaseEdit Insight 设置页导入。

可参考的官方/机构页面：

- Clarivate JCR 产品页：<https://clarivate.com/academia-government/scientific-and-academic-research/research-funding-analytics/journal-citation-reports/>
- JCR 平台：<https://jcr.clarivate.com/jcr/home>
- JCR 注册/登录说明：<https://journalcitationreports.zendesk.com/hc/en-gb/articles/28351249405329-Registration-and-Signing-into-Journal-Citation-Reports>
- 机构访问示例（华东师范大学图书馆）：<https://lib.ecnu.edu.cn/91/48/c38585a495944/page.htm>

如果学校没有订阅，可以请图书馆/科研管理部门提供其订阅的 JCR 导出文件，或使用下面方式 B。

### 导出 Q1+Q2 全量（不按分类拆）

如果目标就是 Q1+Q2 的全部 10,000+ 期刊，不要用学科分类来拼覆盖面（同一期刊可能属于多个类别，容易重复或遗漏）。建议：

1. 在 JCR 结果页直接筛选 **JIF Quartile = Q1, Q2**；
2. 优先尝试页面上的 **Export all results / 全量导出**；
3. 如果单次导出有上限（例如 500 条），按**页码或结果区间**分批导出，而不是按学科分类；
4. 把多份 CSV 一起选中导入（客户端支持多文件、按 ISSN/刊名去重合并）；
5. 若需要完全自动化，使用 **Web of Science Journals API**，而不是翻页抓取网页。

> JCR 的网页分页抓取通常违反订阅条款，且受登录态、限流和页面结构影响，不建议作为数据获取方式。


### 方式 B：Clarivate Web of Science Journals API（付费）

Clarivate 提供官方的 **Web of Science Journals API**，可直接获取 JCR 收录期刊的 JIF 等指标，JSON 输出，速率上限 5 请求/秒；需要 JCR / InCites 的付费附加许可并在 Developer Portal 注册应用：

- <https://developer.clarivate.com/apis/wos-journal>

如果你有该 API Key，我可以再给 BaseEdit Insight 加一个 API 导入器（目前是 CSV 导入）。

### 方式 C：出版社/期刊官网逐个查看

很多期刊官网会显示自己的 JIF。适合少量补充，不适合批量抓取；请遵守网站条款，不要用脚本抓取。

### 不要使用

知乎、CSDN、GitHub 上流传的「JCR 完整版下载」「2026 影响因子总表」以及第三方查询站，很多是未授权抓取或二次整理，数据准确性和许可都无法保证，也不适合导入正式科研工具。

### 免费替代指标（都不是 JCR IF）

- **OpenAlex 2yr mean citedness / h-index**：免费 API，系统已接入并自动刷新；<https://docs.openalex.org/api-entities/sources/source-object>
- **CWTS Journal Indicators（SNIP / IPP）**：Leiden University 免费提供，覆盖 2 万多种 Scopus 期刊，可下载 Excel；<https://www.journalindicators.com/downloads>
- **SCImago Journal Rank（SJR）**：免费下载期刊排名表；<https://www.scimagojr.com/journalrank.php>
- **Google Scholar Metrics h5-index**：可手动查看，适合补充。

这些指标的计算方式和量纲与 JIF 不同，界面必须按实际来源标注，不能改名为 Impact Factor。


## 1. 三种指标来源

| 来源 | 说明 | 获取方式 |
| --- | --- | --- |
| `jcr` | Clarivate Journal Citation Reports 的 Journal Impact Factor | 机构订阅导出 CSV，手动导入 |
| `custom` | 你维护的自定义期刊指标/白名单分数 | 手动导入 CSV |
| `openalex` | OpenAlex `2yr_mean_citedness`（开放引用指标） | 设置页点击「刷新 OpenAlex 指标」 |

设置页「期刊影响力筛选」中可选择：

- **关闭**：不按期刊指标筛选；
- **JCR 影响因子（导入）**：只使用你导入的 JCR 数据；
- **OpenAlex 2yr citedness**：使用 OpenAlex 开放指标；
- **优先 JCR，缺失用 OpenAlex**：先查 JCR，缺失时回退 OpenAlex。

> OpenAlex 的 2yr citedness 与 JCR IF 计算方式不同，部分期刊数值可能异常（例如 Journal of Hepatology 在 OpenAlex 中约 2.8，但 JCR IF 远高于此）。把它当作辅助信号，不建议直接用高阈值硬筛。
>
> 默认配置是 **auto + 1.0**：优先 JCR（未导入则回退 OpenAlex），只排除指标明显很低或缺失但被标记为未知的期刊；导入 JCR 后可把门槛提高到 5–10。

---

## 2. 导入 JCR 影响因子

### 2.1 从 JCR 导出

在机构订阅的 Journal Citation Reports 中：

1. 选择年份（例如 2025 JCR）；
2. 选择需要筛选的学科/期刊集合；
3. 导出 CSV / Excel（不同版本菜单名称可能不同）；
4. 保存为 CSV。

系统可识别以下列（大小写不敏感）：

| 字段 | 可接受的列名 |
| --- | --- |
| 期刊名 | `Journal` / `Journal name` / `Title` / `Full Journal Title` |
| 影响因子 | `Impact Factor` / `Journal Impact Factor` / `JIF` / `2024 JIF` / `2025 JIF` |
| ISSN（可选） | `ISSN` / `Print ISSN` |
| eISSN（可选） | `eISSN` / `Online ISSN` |
| 年份（可选） | `Year` / `JCR Year` / `Metric Year` |

示例（请填入你自己的真实数据）：

```csv
Journal,ISSN,Impact Factor,Year
Nature,0028-0836,50.5,2025
Nature Biotechnology,1087-0156,33.1,2025
```

### 2.2 导入方式

**界面（推荐）**：设置 → 期刊影响力筛选 → 选择 CSV 文件或直接粘贴 → 选择 `JCR IF` 与年份 → 点击「导入指标 CSV」。

**命令行**：

```bash
npm run metrics:import -- "C:\path\to\jcr-2025.csv" --year=2025 --source=jcr
```

导入文件只在本地解析并写入 SQLite，不会上传到任何第三方服务。请不要把 JCR 导出文件提交到 Git 仓库。

### 2.3 设置门槛

| 设置 | 作用 |
| --- | --- |
| 最低指标 | 低于该值的论文不进入正式推荐；0 表示不启用 |
| 未知期刊处理 | `允许`：缺少指标也保留；`排除`：只接受有指标期刊 |

示例：

- JCR 模式，最低 `5`，未知期刊 `允许`：有 IF 且 ≥5 的期刊论文入库；没有导入 IF 的期刊不因缺少数据被排除；
- JCR 模式，最低 `10`，未知期刊 `排除`：只接受已导入且 IF ≥10 的期刊，适合严格精选；
- OpenAlex 模式，最低 `5`：使用开放指标，不建议设得过高。

---

## 3. 筛选发生在哪里

1. **新候选入库**：每日流水线在质量门槛之外增加「期刊影响力」检查；低于阈值或按策略排除的候选进入拒绝区，并写入核验记录；
2. **每日推荐**：已入库论文若指标低于当前门槛，不会被今日推荐选中；
3. **文献库**：可按「期刊指标 ≥」筛选，卡片显示 `IF 8.2` 或 `2yr 5.6` 徽标；
4. **论文页**：侧栏显示指标来源与年份；
5. **对比页**：显示各论文的期刊指标。

指标只影响筛选与推荐，不会改写论文元数据或伪造数值。

---

## 4. 刷新 OpenAlex 指标

设置页 →「刷新 OpenAlex 指标」，或：

```bash
npm run metrics:refresh
```

系统会：

- 遍历中央库中出现过的期刊；
- 调用 OpenAlex Sources API 获取 `summary_stats.2yr_mean_citedness`；
- 按 ISSN/刊名匹配并缓存到 `journal_metrics`；
- 把最佳指标写回论文记录。

该任务在后台 worker 中执行，可在 Agent 页面查看日志。

---

## 5. 数据与审计

`journal_metrics` 表保存：

- 期刊名、标准化名、ISSN/eISSN；
- 指标来源（jcr/openalex/custom）；
- 指标年份；
- 指标值；
- 导入原始行（`raw_json`）；
- 创建/更新时间。

论文记录保存最终采用的 `journal_metric`、来源和年份。核验记录中会新增「期刊影响力」检查项，失败原因可追溯。
