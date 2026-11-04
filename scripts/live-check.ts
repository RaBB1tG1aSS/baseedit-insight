/**
 * Live integration check against real academic APIs.
 *
 *   npx tsx scripts/live-check.ts
 *
 * Performs: search → dedupe → verification → quality scoring → gate.
 * Optionally fetches and parses one open-access full text + figure captions.
 * It does NOT write to the central database.
 */
import { searchEuropePmc } from "../src/server/sources/europepmc";
import { searchPubmed } from "../src/server/sources/pubmed";
import { mergeSourceRecords } from "../src/server/pipeline/dedupe";
import { assessRelevance } from "../src/server/pipeline/relevance";
import { verifyCandidate } from "../src/server/pipeline/verify";
import { scoreQuality } from "../src/server/pipeline/quality";
import { gateDecision } from "../src/server/pipeline/gate";
import { defaultSettings } from "../src/server/db/repo/settings";
import { env } from "../src/server/env";
import { addDays } from "../src/server/utils/time";
import { todayInZone } from "../src/server/db/client";
import { fetchJatsXml, parseJatsFullText, resolvePmcImageUrls } from "../src/server/fulltext/europepmc";

async function main(): Promise<void> {
  const settings = defaultSettings();
  const today = todayInZone(settings.timezone);
  const since = addDays(today, -45);
  console.log(`\n=== 1. 检索（${since} → ${today}）===`);

  const [epmc, pubmed] = await Promise.allSettled([
    searchEuropePmc({ query: settings.focusQuery, limit: 20, since }),
    searchPubmed({
      query: "",
      limit: 15,
      since,
      mailto: settings.ncbiEmail,
      apiKey: env.ncbiApiKey || undefined,
    }),
  ]);

  const records = [
    ...(epmc.status === "fulfilled" ? epmc.value : []),
    ...(pubmed.status === "fulfilled" ? pubmed.value : []),
  ];
  console.log(`Europe PMC: ${epmc.status === "fulfilled" ? epmc.value.length : "FAILED"} 条`);
  console.log(`PubMed:     ${pubmed.status === "fulfilled" ? pubmed.value.length : "FAILED"} 条`);

  const merged = mergeSourceRecords(records);
  console.log(`去重后:     ${merged.length} 篇`);
  const multiSource = merged.filter((item) => item.records.length > 1);
  console.log(`多源合并:   ${multiSource.length} 篇（示例：${multiSource[0]?.title.slice(0, 60) ?? "无"}）`);

  console.log(`\n=== 2. 核验与质量评分（前 3 篇）===`);
  const candidates = merged
    .map((candidate) => ({ candidate, relevance: assessRelevance(candidate) }))
    .filter((item) => item.relevance.isCore)
    .sort((a, b) => b.relevance.score - a.relevance.score)
    .slice(0, 3);

  let oaPmcid: string | null = null;
  let oaLicense: string | null = null;
  for (const { candidate, relevance } of candidates) {
    console.log(`\n— ${candidate.title}`);
    console.log(`  DOI=${candidate.doi ?? "-"} PMID=${candidate.pmid ?? "-"} 来源=${candidate.sources.join("+")}`);
    console.log(`  相关性 ${relevance.score}/15 焦点=${relevance.focusAreas.join(",")}`);

    const verification = await verifyCandidate(candidate, {
      ncbiEmail: settings.ncbiEmail,
      ncbiApiKey: env.ncbiApiKey,
      openalexMailto: settings.openalexMailto,
    });
    const quality = scoreQuality({
      candidate: verification.candidate,
      relevance,
      identityVerified: verification.identityVerified,
    });
    const gate = gateDecision({
      verification,
      quality,
      relevance,
      settings,
      articleType: verification.candidate.articleType,
      title: verification.candidate.title,
    });

    console.log(`  身份核验: ${verification.identityVerified ? "PASS" : "FAIL"}  撤稿: ${verification.retraction.status}`);
    console.log(`  全文: ${verification.candidate.fullTextAccessStatus}  PMCID=${verification.candidate.pmcid ?? "-"}`);
    console.log(`  质量: ${quality.total}/100  判定: ${gate.status}  (${gate.reasons.join("；")})`);
    console.log(`  检查项: ${verification.checks.map((check) => `${check.checkItem}=${check.result}`).join(" ")}`);

    if (
      !oaPmcid &&
      gate.status === "accepted" &&
      verification.candidate.fullTextAccessStatus === "oa_fulltext" &&
      verification.candidate.pmcid
    ) {
      oaPmcid = verification.candidate.pmcid;
      oaLicense = verification.candidate.license;
    }
  }

  if (oaPmcid) {
    console.log(`\n=== 3. 全文与图表解析（只读）===`);
    try {
      const xml = await fetchJatsXml(oaPmcid);
      const parsed = parseJatsFullText(xml, oaLicense);
      const charCount = parsed.sections.reduce((sum, section) => sum + section.text.length, 0);
      const imageMap = await resolvePmcImageUrls(oaPmcid);
      const withImage = parsed.figures.filter((figure) => figure.href && imageMap.has(figure.href));
      console.log(
        `PMCID ${oaPmcid}: ${parsed.sections.length} 个段落章节，${charCount} 字符，${parsed.figures.length} 张图，` +
          `${withImage.length} 张可解析到原始图片 URL，许可=${parsed.license ?? "-"}`,
      );
      for (const figure of parsed.figures.slice(0, 3)) {
        console.log(`  ${figure.number}: ${figure.legend.slice(0, 90)}… (${figure.panels.length} 个子图)`);
      }
      if (withImage[0]?.href) {
        console.log(`  示例图片: ${imageMap.get(withImage[0].href)}`);
      }
    } catch (error) {
      console.log("全文解析失败:", error instanceof Error ? error.message : error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
