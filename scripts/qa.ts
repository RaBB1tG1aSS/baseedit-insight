/**
 * Browser QA harness (development only).
 *
 *   npx tsx scripts/qa.ts
 *
 * Uses the Chrome binary installed by agent-browser via playwright-core.
 * Captures full-page screenshots, console/page errors and a few interactions.
 */
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { chromium, type Browser, type ConsoleMessage } from "playwright-core";

const CHROME =
  process.env.CHROME_PATH ||
  "C:/Users/zangrun/.agent-browser/browsers/chrome-156.0.8078.80/chrome.exe";
const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.join(process.cwd(), "data", "screens");

interface PageCheck {
  name: string;
  url: string;
  file: string;
  fullPage?: boolean;
  waitMs?: number;
  action?: (page: import("playwright-core").Page) => Promise<Record<string, unknown>>;
}

function db() {
  return new Database(path.join(process.cwd(), "data", "baseedit.db"), { readonly: true });
}

async function main(): Promise<void> {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}`);
  fs.mkdirSync(OUT, { recursive: true });

  const database = db();
  const recommendation = database
    .prepare("SELECT paper_id, rec_date FROM daily_recommendations ORDER BY rec_date DESC LIMIT 1")
    .get() as { paper_id: string; rec_date: string } | undefined;
  const paperId =
    recommendation?.paper_id ??
    (database.prepare("SELECT id FROM papers WHERE status='accepted' ORDER BY quality_score DESC LIMIT 1").get() as
      | { id: string }
      | undefined)?.id;

  const secondPaperId = (
    database
      .prepare("SELECT id FROM papers WHERE status='accepted' AND id <> ? ORDER BY quality_score DESC LIMIT 1")
      .get(paperId) as { id: string } | undefined
  )?.id;
  const reportId = (
    database
      .prepare("SELECT report_id FROM weekly_reports ORDER BY week_start DESC LIMIT 1")
      .get() as { report_id: string } | undefined
  )?.report_id;
  const figureCount = paperId
    ? (database.prepare("SELECT COUNT(*) AS n FROM figures WHERE paper_id = ?").get(paperId) as { n: number }).n
    : 0;
  database.close();
  if (!paperId) throw new Error("No accepted paper in database");

  const browser: Browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ["--disable-gpu", "--no-sandbox"],
  });

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "zh-CN" });
  const page = await context.newPage();

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const failedRequests: string[] = [];

  page.on("console", (message: ConsoleMessage) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // Next.js prefetch requests are aborted on navigation; this is not an app error.
    if (text.includes("ERR_ABORTED") || text.includes("ERR_CONNECTION_CLOSED")) return;
    consoleErrors.push(text.slice(0, 500));
  });
  page.on("pageerror", (error) => pageErrors.push(String(error).slice(0, 500)));
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (url.includes("favicon")) return;
    failedRequests.push(`${request.failure()?.errorText ?? "failed"} ${url}`.slice(0, 300));
  });

  const checks: PageCheck[] = [
    { name: "dashboard", url: "/", file: "01-home.png", fullPage: true, waitMs: 1200 },
    {
      name: "p0-console",
      url: "/",
      file: "14-p0-console.png",
      waitMs: 1000,
      action: async (target) => {
        const validations: Record<string, boolean> = {};
        const expectations: [string, string][] = [
          ["双轨精选", "经典奠基"],
          ["手动检索", "手动触发学术检索"],
          ["精讲队列", "待生成精讲"],
          ["候选审核", "最近未通过"],
          ["运行控制", "最近任务"],
        ];
        for (const [tab, expected] of expectations) {
          await target.getByRole("tab", { name: tab }).click();
          await target.waitForTimeout(450);
          const text = await target.locator("body").innerText();
          validations[tab] = text.includes(expected) || (tab === "精讲队列" && text.includes("精讲队列已清空"));
        }
        await target.getByRole("tab", { name: "双轨精选" }).click();
        await target.waitForTimeout(300);
        return { consoleTabs: validations };
      },
    },
    {
      name: "library",
      url: "/papers",
      file: "02-library.png",
      fullPage: true,
      waitMs: 800,
      action: async (target) => {
        const compareButton = target.getByRole("button", { name: /^对比$/ }).first();
        await compareButton.click();
        await target.waitForTimeout(500);
        const dockVisible = (await target.locator("text=已选 1 篇论文").count()) > 0;
        await target.evaluate(() => {
          localStorage.removeItem("baseedit-compare");
          window.dispatchEvent(new Event("baseedit-compare-change"));
        });
        const bodyText = await target.locator("body").innerText();
        return {
          compareDockVisible: dockVisible,
          metricBadgesVisible: /(?:IF|2yr) \d/.test(bodyText),
        };
      },
    },
    {
      name: "paper-top",
      url: `/papers/${paperId}`,
      file: "04a-paper-top.png",
      waitMs: 1400,
    },
    {
      name: "library-filtered",
      url: "/papers?focus=delivery&minScore=60&sort=score",
      file: "03-library-filtered.png",
      fullPage: true,
      waitMs: 600,
    },
    {
      name: "paper",
      url: `/papers/${paperId}`,
      file: "04-paper.png",
      fullPage: true,
      waitMs: 1800,
      action: async (target) => {
        const title = await target.locator("h1").first().innerText();
        const pageHeight = await target.evaluate(() => document.body.scrollHeight);
        // Figure images use native lazy loading; scroll each into view first.
        await target.locator("#figures").scrollIntoViewIfNeeded().catch(() => {});
        await target.waitForTimeout(800);
        const figureImages = await target.locator(`#figures img`).count();
        for (const image of await target.locator("#figures img").all()) {
          await image.scrollIntoViewIfNeeded().catch(() => {});
          await target.waitForTimeout(900);
        }
        await target.waitForTimeout(2000);
        const loadedImages: number[] = [];
        for (let index = 0; index < figureImages; index += 1) {
          const width = await target
            .locator("#figures img")
            .nth(index)
            .evaluate((image) => (image as HTMLImageElement).naturalWidth);
          loadedImages.push(width);
        }

        // Favorite toggle + persistence (restore the initial state afterwards)
        const favoriteButton = target.getByRole("button", { name: /收藏论文|取消收藏/ }).first();
        const initialFavorite = (await favoriteButton.getAttribute("aria-pressed")) === "true";
        await favoriteButton.click();
        await target.waitForTimeout(700);
        const record = await target.request.get(`${BASE}/api/library/${paperId}`);
        const recordJson = (await record.json()) as { record?: { note?: string; favorite?: boolean } };
        await favoriteButton.click();
        await target.waitForTimeout(600);

        // Note autosave
        const textarea = target.locator("textarea").first();
        await textarea.fill("QA 自动测试笔记：阅读进度与自动保存验证。");
        await target.waitForTimeout(1800);
        const recordAfterNote = await target.request.get(`${BASE}/api/library/${paperId}`);
        const recordAfterNoteJson = (await recordAfterNote.json()) as { record?: { note?: string } };

        // Reading progress
        await target.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await target.waitForTimeout(2800);
        const afterScroll = await target.request.get(`${BASE}/api/library/${paperId}`);
        const afterJson = (await afterScroll.json()) as { record?: { readingProgress?: number } };

        // restore note
        await target.request.patch(`${BASE}/api/library/${paperId}`, { data: { note: "" } });

        return {
          title: title.slice(0, 80),
          pageHeight,
          figureImages,
          loadedImages,
          figureCount,
          initialFavorite,
          favoriteToggledAndPersisted: recordJson.record?.favorite === !initialFavorite,
          noteSaved: recordAfterNoteJson.record?.note?.includes("QA 自动测试笔记"),
          progressAfterScroll: afterJson.record?.readingProgress,
        };
      },
    },
    { name: "graph", url: "/graph", file: "05-graph.png", fullPage: true, waitMs: 3500 },
    { name: "timeline", url: "/timeline", file: "06-timeline.png", fullPage: true, waitMs: 900 },
    { name: "weekly", url: "/weekly", file: "07-weekly.png", fullPage: true, waitMs: 600 },
    {
      name: "library-metric",
      url: "/papers?minMetric=5",
      file: "03b-library-metric.png",
      fullPage: true,
      waitMs: 700,
      action: async (target) => {
        const text = await target.locator("body").innerText();
        return {
          hasMetricChip: text.includes("期刊指标 ≥ 5"),
          hasCards: (await target.locator("article.card").count()) > 0,
        };
      },
    },
    {
      name: "global-search",
      url: "/search?q=base%20editing",
      file: "15-global-search.png",
      fullPage: true,
      waitMs: 900,
      action: async (target) => {
        const text = await target.locator("body").innerText();
        return { hasPapers: text.includes("已核验论文"), hasEntities: text.includes("知识实体") };
      },
    },
    {
      name: "insights",
      url: "/insights",
      file: "16-insights.png",
      fullPage: true,
      waitMs: 1000,
      action: async (target) => {
        const text = await target.locator("body").innerText();
        return { hasPersonalized: text.includes("个性化推荐"), hasYearChart: text.includes("发表年份分布") };
      },
    },
    ...(secondPaperId
      ? [
          {
            name: "compare",
            url: "/compare?ids=" + paperId + "," + secondPaperId,
            file: "17-compare.png",
            fullPage: true,
            waitMs: 900,
            action: async (target: import("playwright-core").Page) => {
              const text = await target.locator("body").innerText();
              return { hasComparison: text.includes("论文对比") && text.includes("主要结果") };
            },
          },
        ]
      : []),
    ...(reportId
      ? [
          {
            name: "weekly-detail",
            url: `/weekly/${reportId}`,
            file: "07b-weekly-detail.png",
            fullPage: true,
            waitMs: 1000,
          },
        ]
      : []),
    { name: "agent", url: "/agent", file: "08-agent.png", fullPage: true, waitMs: 1200 },
    { name: "candidates", url: "/candidates", file: "09-candidates.png", fullPage: true, waitMs: 800 },
    {
      name: "settings",
      url: "/settings",
      file: "10-settings.png",
      fullPage: true,
      waitMs: 900,
      action: async (target) => {
        const text = await target.locator("body").innerText();
        return {
          hasMetricSettings: text.includes("期刊影响力筛选"),
          hasImportUi: text.includes("导入指标 CSV"),
        };
      },
    },
  ];

  const results: Record<string, unknown>[] = [];

  for (const check of checks) {
    const beforeErrors = consoleErrors.length;
    await page.goto(`${BASE}${check.url}`, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(check.waitMs ?? 800);
    let extra: Record<string, unknown> = {};
    if (check.action) {
      try {
        extra = await check.action(page);
      } catch (error) {
        extra = { actionError: String(error).slice(0, 400) };
      }
    }
    await page.screenshot({ path: path.join(OUT, check.file), fullPage: check.fullPage ?? false });
    const title = await page.locator("h1").first().innerText().catch(() => "");
    const bodyText = await page.locator("body").innerText().catch(() => "");
    results.push({
      page: check.name,
      status: "ok",
      h1: title.slice(0, 80),
      bodyLength: bodyText.length,
      hasErrorOverlay: bodyText.includes("Application error") || bodyText.includes("Unhandled Runtime Error"),
      newConsoleErrors: consoleErrors.slice(beforeErrors),
      ...extra,
    });
    console.log(`✓ ${check.name} → ${check.file}`);
  }

  // Dark mode screenshot
  const darkContext = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    colorScheme: "dark",
    locale: "zh-CN",
  });
  const darkPage = await darkContext.newPage();
  await darkPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await darkPage.waitForTimeout(900);
  const darkClass = await darkPage.evaluate(() => document.documentElement.classList.contains("dark"));
  await darkPage.screenshot({ path: path.join(OUT, "11-home-dark.png"), fullPage: true });
  await darkContext.close();

  // Mobile screenshot
  const mobileContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    deviceScaleFactor: 2,
    locale: "zh-CN",
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForTimeout(900);
  await mobilePage.screenshot({ path: path.join(OUT, "12-home-mobile.png"), fullPage: true });
  await mobilePage.goto(`${BASE}/papers/${paperId}`, { waitUntil: "domcontentloaded" });
  await mobilePage.waitForTimeout(1200);
  await mobilePage.screenshot({ path: path.join(OUT, "13-paper-mobile.png"), fullPage: true });
  const mobileOverflowByPage: Record<string, number> = {};
  const mobilePaths = [
    "/",
    "/papers/" + paperId,
    "/papers",
    "/insights",
    "/search?q=base",
    ...(secondPaperId ? ["/compare?ids=" + paperId + "," + secondPaperId] : []),
  ];
  for (const path of mobilePaths) {
    await mobilePage.goto(BASE + path, { waitUntil: "domcontentloaded" });
    await mobilePage.waitForTimeout(700);
    mobileOverflowByPage[path] = await mobilePage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
  }
  const mobileOverflow = Math.max(0, ...Object.values(mobileOverflowByPage));
  await mobileContext.close();

  await context.close();
  await browser.close();

  const summary = {
    paperId,
    figureCount,
    darkModeApplied: darkClass,
    mobileHorizontalOverflowPx: mobileOverflow,
    mobileOverflowByPage,
    consoleErrors,
    pageErrors,
    failedRequests,
    results,
    screenshots: fs.readdirSync(OUT).sort(),
  };
  fs.writeFileSync(path.join(OUT, "qa-report.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
