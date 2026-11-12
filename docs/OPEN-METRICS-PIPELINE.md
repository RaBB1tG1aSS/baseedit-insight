# 开放期刊指标管线（CWTS SNIP / SCImago SJR / OpenAlex）

BaseEdit Insight 在不使用 JCR 授权数据的前提下，支持三种公开期刊指标。它们都不是 Clarivate Impact Factor，界面与核验记录会按真实来源标注。

## 1. 数据源

| 来源 | 指标 | 获取 | 备注 |
| --- | --- | --- | --- |
| CWTS Journal Indicators | SNIP、IPP | 官方 Excel 下载 | 基于 Scopus，免费；数据版权归 Leiden University |
| SCImago Journal Rank | SJR、H-index | 官方 XLS 下载 | 基于 Scopus；非商业使用并需引用 SCImago |
| OpenAlex | 2yr mean citedness、h-index | 官方 API | 已由客户端自动刷新 |

## 2. CWTS SNIP 导入

1. 从 <https://www.journalindicators.com/downloads> 下载官方 Excel；
2. 转成 CSV，至少保留：
   - `Journal` / `Source title` / `Title`
   - `SNIP`
   - `Year`（可选）
3. 导入：

```bash
npm run metrics:import -- data/external/cwts/cwts-normalized.csv --source=snip
```

或在设置页选择 **CWTS SNIP** 后上传 CSV。

阈值按 SNIP 量纲设置，通常从 **0.8–1.5** 开始，不要套用 IF 的 5/10。

## 3. SCImago SJR 导入

1. 在普通桌面浏览器打开 <https://www.scimagojr.com/journalrank.php>；
2. 站点有 Cloudflare 人机验证，自动化会被 403 拦截；请手动完成验证并下载官方 XLS；
3. 转成 CSV，保留 `Title`、`ISSN`、`SJR`、`Year`；
4. 导入：

```bash
npm run metrics:import -- data/external/sjr/sjr-normalized.csv --source=sjr
```

阈值建议从 **0.5–1.5** 开始。SCImago 要求非商业使用并引用其网站。

## 4. OpenAlex

```bash
npm run metrics:refresh
```

或在设置页点击「刷新 OpenAlex 指标」。该任务在后台 worker 中执行。

## 5. 多 agent 采集与验收

本轮采用并行 agent：

- Agent A：下载 CWTS 官方 Excel，检查工作表/列，规范化 `Journal,ISSN,SNIP,IPP,Year`，抽样核验；
- Agent B：尝试获取 SCImago SJR；因 Cloudflare 人机验证被拦截，未绕过、未使用镜像，保留人工下载步骤；
- 主进程：扩展数据模型（`snip`/`sjr` 来源）、导入器、设置页与徽标；
- 验收 agent：独立检查数据来源、行数、抽样值、无 JCR 未授权数据、测试与构建。

数据文件只保存在本机 `data/external/`，该目录已被 `.gitignore` 排除，不随仓库分发。

## 6. 使用建议

- 如果学校没有 JCR：推荐先使用 **CWTS SNIP** 或 **SCImago SJR**，它们比 OpenAlex 2yr 更接近期刊影响力评估；
- 如果之后获得 JCR：在设置页导入 JCR，切换来源为 JCR，并提高阈值；
- 所有来源的阈值不可混用（IF、SNIP、SJR、2yr citedness 量纲不同）；
- 指标只用于期刊层面的筛选，不能用于评价单篇论文或作者。
