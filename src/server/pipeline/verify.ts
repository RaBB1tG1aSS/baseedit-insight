import type { RetractionStatus } from "@/lib/types";
import type { VerificationInput } from "../db/repo/analysis";
import type { SourceRecord } from "../sources/types";
import { lookupCrossrefByDoi } from "../sources/crossref";
import {
  lookupEuropePmcByDoi,
  lookupEuropePmcByPmcid,
  lookupEuropePmcByPmid,
  searchEuropePmc,
} from "../sources/europepmc";
import { lookupOpenAlexByDoi } from "../sources/openalex";
import { lookupPubmedByDoi, lookupPubmedByPmid } from "../sources/pubmed";
import { lookupSemanticScholarByDoi } from "../sources/semantic";
import { titleSimilarity } from "../utils/normalize";
import { mergeSourceRecords, type MergedCandidate } from "./dedupe";

export interface VerifyConfig {
  ncbiEmail: string;
  ncbiApiKey: string;
  openalexMailto: string;
  semanticScholarKey?: string;
  enableSemanticScholar?: boolean;
}

export interface VerificationOutcome {
  candidate: MergedCandidate;
  identityVerified: boolean;
  retraction: { status: RetractionStatus; note: string | null };
  checks: VerificationInput[];
  conflicts: string[];
  fatal: string[];
  warnings: string[];
  fetched: SourceRecord[];
}

export interface VerifyOptions {
  onLog?: (level: "info" | "warn" | "error", message: string) => void;
}

const RETRACTION_SEVERITY: Record<RetractionStatus, number> = {
  retracted: 4,
  expression_of_concern: 3,
  correction: 2,
  none: 1,
  unknown: 0,
};

const DATACITE_PREFIXES = ["10.48550", "10.5281", "10.5061", "10.6084"];

function severity(status: RetractionStatus): number {
  return RETRACTION_SEVERITY[status] ?? 0;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function similarity(a: string, b: string): number {
  return titleSimilarity(a, b);
}

/**
 * Verifies identity, publication status, retraction status and full-text access
 * against independent sources. Every check is persisted as evidence (§1.3, §6.2).
 */
export async function verifyCandidate(
  candidate: MergedCandidate,
  config: VerifyConfig,
  options: VerifyOptions = {},
): Promise<VerificationOutcome> {
  const checks: VerificationInput[] = [];
  const conflicts: string[] = candidate.conflicts.map((conflict) => conflict.field);
  const fatal: string[] = [];
  const warnings: string[] = [];
  const fetched: SourceRecord[] = [];
  let identityVerified = false;

  for (const conflict of candidate.conflicts) {
    checks.push({
      checkItem: "元数据一致性",
      result: "conflict",
      evidenceSource: conflict.values.map((item) => item.source).join(", "),
      evidence: conflict.values.map((item) => `${item.source}: ${item.value}`).join(" | "),
      notes: `不同来源在 ${conflict.field} 上不一致，保留原始记录供人工核查`,
    });
  }

  const pubmedOptions = {
    query: "",
    limit: 1,
    mailto: config.ncbiEmail,
    apiKey: config.ncbiApiKey || undefined,
  };

  /* ── DOI resolution ─────────────────────────────────────────────── */
  let crossrefRecord: SourceRecord | null = null;
  if (candidate.doi) {
    try {
      crossrefRecord = await lookupCrossrefByDoi(candidate.doi, config.openalexMailto);
      if (crossrefRecord) {
        fetched.push(crossrefRecord);
        const sim = similarity(candidate.title, crossrefRecord.title);
        if (sim >= 0.85) {
          identityVerified = true;
          checks.push({
            checkItem: "DOI 解析",
            result: "pass",
            evidenceSource: "Crossref",
            evidence: `DOI ${candidate.doi} 解析成功，题名相似度 ${(sim * 100).toFixed(0)}%`,
            notes: "DOI 在 Crossref 中真实存在且题名一致",
          });
        } else {
          conflicts.push("DOI 题名不一致");
          checks.push({
            checkItem: "DOI 解析",
            result: "conflict",
            evidenceSource: "Crossref",
            evidence: `Crossref 题名：${crossrefRecord.title}`,
            notes: `DOI 指向的题名与候选记录相似度仅 ${(sim * 100).toFixed(0)}%`,
          });
        }
      } else {
        const isDataCite = DATACITE_PREFIXES.some((prefix) => candidate.doi!.startsWith(prefix));
        checks.push({
          checkItem: "DOI 解析",
          result: isDataCite ? "warning" : "fail",
          evidenceSource: "Crossref",
          evidence: `DOI ${candidate.doi} 未在 Crossref 中解析`,
          notes: isDataCite
            ? "该 DOI 前缀可能由 DataCite 注册，Crossref 无法确认，需依赖其他来源"
            : "DOI 无法解析，不能确认论文真实性",
        });
        if (!isDataCite) warnings.push("DOI 未在 Crossref 解析");
      }
    } catch (error) {
      checks.push({
        checkItem: "DOI 解析",
        result: "warning",
        evidenceSource: "Crossref",
        evidence: errorText(error),
        notes: "Crossref 查询失败，无法完成 DOI 核验",
      });
    }
  } else {
    checks.push({
      checkItem: "DOI 解析",
      result: "warning",
      evidenceSource: null,
      evidence: null,
      notes: "该论文没有 DOI，将依赖 PMID/PMCID/题名匹配进行核验",
    });
  }

  /* ── PubMed identity ───────────────────────────────────────────── */
  let pubmedRecord: SourceRecord | null = null;
  if (candidate.pmid) {
    try {
      pubmedRecord = await lookupPubmedByPmid(candidate.pmid, pubmedOptions);
      if (pubmedRecord) {
        fetched.push(pubmedRecord);
        const sim = similarity(candidate.title, pubmedRecord.title);
        if (sim >= 0.85) {
          identityVerified = true;
          checks.push({
            checkItem: "PubMed 记录",
            result: "pass",
            evidenceSource: "PubMed",
            evidence: `PMID ${candidate.pmid}（题名相似度 ${(sim * 100).toFixed(0)}%）`,
            notes: "PubMed 记录与候选论文一致",
          });
        } else {
          conflicts.push("PubMed 题名不一致");
          checks.push({
            checkItem: "PubMed 记录",
            result: "conflict",
            evidenceSource: "PubMed",
            evidence: `PubMed 题名：${pubmedRecord.title}`,
            notes: "PMID 对应题名与候选论文不一致",
          });
        }

        if (candidate.doi && pubmedRecord.doi && candidate.doi !== pubmedRecord.doi) {
          conflicts.push("DOI/PMID 不一致");
          checks.push({
            checkItem: "DOI/PMID 交叉匹配",
            result: "conflict",
            evidenceSource: "PubMed",
            evidence: `候选 DOI ${candidate.doi}；PubMed DOI ${pubmedRecord.doi}`,
            notes: "DOI 与 PMID 指向不同记录",
          });
        }
      } else {
        checks.push({
          checkItem: "PubMed 记录",
          result: "fail",
          evidenceSource: "PubMed",
          evidence: `PMID ${candidate.pmid} 无法获取`,
          notes: "PMID 记录缺失",
        });
      }
    } catch (error) {
      checks.push({
        checkItem: "PubMed 记录",
        result: "warning",
        evidenceSource: "PubMed",
        evidence: errorText(error),
        notes: "PubMed 查询失败",
      });
    }
  } else if (candidate.doi) {
    try {
      pubmedRecord = await lookupPubmedByDoi(candidate.doi, pubmedOptions);
      if (pubmedRecord) {
        fetched.push(pubmedRecord);
        const sim = similarity(candidate.title, pubmedRecord.title);
        if (sim >= 0.85) {
          identityVerified = true;
          checks.push({
            checkItem: "PubMed 记录",
            result: "pass",
            evidenceSource: "PubMed",
            evidence: `通过 DOI 找到 PMID ${pubmedRecord.pmid ?? "?"}（题名相似度 ${(sim * 100).toFixed(0)}%）`,
            notes: "DOI 与 PubMed 记录交叉一致",
          });
        }
      }
    } catch (error) {
      options.onLog?.("warn", `PubMed DOI 查询失败: ${errorText(error)}`);
    }
  }

  /* ── Europe PMC (full text / status) ───────────────────────────── */
  let epmcRecord: SourceRecord | null = null;
  try {
    if (candidate.doi) epmcRecord = await lookupEuropePmcByDoi(candidate.doi);
    if (!epmcRecord && candidate.pmid) epmcRecord = await lookupEuropePmcByPmid(candidate.pmid);
    if (!epmcRecord && candidate.pmcid) epmcRecord = await lookupEuropePmcByPmcid(candidate.pmcid);
    if (epmcRecord) {
      fetched.push(epmcRecord);
      const sim = similarity(candidate.title, epmcRecord.title);
      if (sim >= 0.85) {
        identityVerified = true;
        if (!candidate.pmcid && epmcRecord.pmcid) {
          checks.push({
            checkItem: "PMCID 关联",
            result: "pass",
            evidenceSource: "Europe PMC",
            evidence: `PMCID ${epmcRecord.pmcid}`,
            notes: "发现可关联的 PMC 全文记录",
          });
        }
      }
    }
  } catch (error) {
    options.onLog?.("warn", `Europe PMC 查询失败: ${errorText(error)}`);
    checks.push({
      checkItem: "Europe PMC 记录",
      result: "warning",
      evidenceSource: "Europe PMC",
      evidence: errorText(error),
      notes: "Europe PMC 查询失败，全文状态可能不准确",
    });
  }

  /* ── Title-based fallback for DOI-less records ─────────────────── */
  if (!identityVerified) {
    try {
      const titleQuery = candidate.title.replace(/["\\]/g, " ").slice(0, 220);
      const matches = await searchEuropePmc({ query: `TITLE:"${titleQuery}"`, limit: 3 });
      const near = matches
        .map((record) => ({ record, sim: similarity(candidate.title, record.title) }))
        .sort((a, b) => b.sim - a.sim)[0];
      if (near && near.sim >= 0.95) {
        fetched.push(near.record);
        identityVerified = true;
        warnings.push("通过题名匹配核验身份（无 DOI/PMID）");
        checks.push({
          checkItem: "题名匹配核验",
          result: "warning",
          evidenceSource: "Europe PMC",
          evidence: `${near.record.url}（相似度 ${(near.sim * 100).toFixed(0)}%）`,
          notes: "论文没有 DOI/PMID，通过高相似度题名匹配到官方记录；建议人工复核",
        });
      }
    } catch (error) {
      options.onLog?.("warn", `题名匹配失败: ${errorText(error)}`);
    }
  }

  /* ── OpenAlex / Semantic Scholar enrichment ────────────────────── */
  let openalexRecord: SourceRecord | null = null;
  if (candidate.doi) {
    try {
      openalexRecord = await lookupOpenAlexByDoi(candidate.doi, config.openalexMailto);
      if (openalexRecord) fetched.push(openalexRecord);
    } catch (error) {
      options.onLog?.("warn", `OpenAlex 查询失败: ${errorText(error)}`);
    }

    if (config.enableSemanticScholar && config.semanticScholarKey) {
      try {
        const s2 = await lookupSemanticScholarByDoi(candidate.doi, config.semanticScholarKey);
        if (s2) fetched.push(s2);
      } catch (error) {
        options.onLog?.("warn", `Semantic Scholar 查询失败: ${errorText(error)}`);
      }
    }
  }

  /* ── Merge enrichment back into the candidate ──────────────────── */
  const groups = mergeSourceRecords([...candidate.records, ...fetched]);
  const enriched = [...groups].sort((a, b) => b.records.length - a.records.length)[0] ?? candidate;

  /* ── Retraction ────────────────────────────────────────────────── */
  const retractionSources = enriched.records.filter((record) => record.retractionStatus !== "unknown");
  const worst = retractionSources.reduce<{ status: RetractionStatus; note: string | null }>(
    (current, record) =>
      severity(record.retractionStatus) > severity(current.status)
        ? { status: record.retractionStatus, note: record.retractionNote }
        : current,
    { status: "unknown", note: null },
  );
  const retraction = worst.status === "unknown" && retractionSources.length > 0
    ? { status: "none" as RetractionStatus, note: null }
    : worst;

  if (retraction.status === "retracted") {
    fatal.push("论文已撤稿");
    checks.push({
      checkItem: "撤稿状态",
      result: "fail",
      evidenceSource: retractionSources.map((record) => record.source).join(", "),
      evidence: retraction.note,
      notes: "检测到撤稿记录，禁止进入正式推荐",
    });
  } else if (retraction.status === "expression_of_concern") {
    warnings.push("存在 Expression of Concern");
    checks.push({
      checkItem: "撤稿状态",
      result: "warning",
      evidenceSource: retractionSources.map((record) => record.source).join(", "),
      evidence: retraction.note,
      notes: "论文存在关注声明，可靠性存疑，需人工复核",
    });
  } else if (retraction.status === "correction") {
    checks.push({
      checkItem: "撤稿状态",
      result: "warning",
      evidenceSource: retractionSources.map((record) => record.source).join(", "),
      evidence: retraction.note,
      notes: "存在勘误记录，引用时需注意版本",
    });
  } else {
    checks.push({
      checkItem: "撤稿状态",
      result: "pass",
      evidenceSource: retractionSources.map((record) => record.source).join(", ") || null,
      evidence: retractionSources.length ? "未检测到撤稿/关注声明" : null,
      notes: retractionSources.length ? "已检查撤稿状态" : "未能确认撤稿状态",
    });
  }

  /* ── Preprint / article type ───────────────────────────────────── */
  if (enriched.peerReviewStatus === "preprint") {
    warnings.push("预印本，未经过同行评审");
  }
  checks.push({
    checkItem: "同行评审状态",
    result: enriched.peerReviewStatus === "peer_reviewed" ? "pass" : enriched.peerReviewStatus === "preprint" ? "warning" : "warning",
    evidenceSource: enriched.records.map((record) => record.source).join(", "),
    evidence: enriched.journal ?? enriched.articleType,
    notes:
      enriched.peerReviewStatus === "peer_reviewed"
        ? "已确认为同行评审文献"
        : enriched.peerReviewStatus === "preprint"
          ? "预印本：将明确标记，不视为正式同行评审论文"
          : "同行评审状态未能确认",
  });

  const titleLooksLikeNotice = /^(retraction|erratum|correction|expression of concern)\b/i.test(enriched.title);
  if (titleLooksLikeNotice || /retraction|erratum/i.test(enriched.articleType ?? "")) {
    fatal.push("该记录属于撤稿/勘误声明，而非研究论文");
    checks.push({
      checkItem: "论文类型",
      result: "fail",
      evidenceSource: enriched.records.map((record) => record.source).join(", "),
      evidence: enriched.articleType,
      notes: "撤稿声明/勘误不是可推荐的研究论文",
    });
  } else {
    checks.push({
      checkItem: "论文类型",
      result: "pass",
      evidenceSource: enriched.records.map((record) => record.source).join(", "),
      evidence: enriched.articleType,
      notes: "非撤稿/勘误声明",
    });
  }

  /* ── Full-text accessibility ───────────────────────────────────── */
  checks.push({
    checkItem: "全文可访问性",
    result: enriched.fullTextAccessStatus === "oa_fulltext" ? "pass" : "warning",
    evidenceSource: "Europe PMC",
    evidence: enriched.fullTextUrl,
    notes:
      enriched.fullTextAccessStatus === "oa_fulltext"
        ? "开放获取全文可用，可进行 Figure 级分析"
        : "仅摘要可访问：精讲将明确标记为摘要级分析",
  });

  if (!enriched.publicationDate) warnings.push("发表时间缺失");
  if (!identityVerified) {
    checks.push({
      checkItem: "身份核验",
      result: "fail",
      evidenceSource: null,
      evidence: null,
      notes: "无法通过 DOI、PMID、PMCID 或题名匹配确认论文身份",
    });
  }

  // Ensure the final candidate carries the enriched identifiers and access state.
  const finalCandidate: MergedCandidate = {
    ...enriched,
    conflicts: candidate.conflicts.concat(
      enriched.conflicts.filter(
        (conflict) => !candidate.conflicts.some((existing) => existing.field === conflict.field),
      ),
    ),
  };

  return {
    candidate: finalCandidate,
    identityVerified,
    retraction,
    checks,
    conflicts: [...new Set(conflicts)],
    fatal: [...new Set(fatal)],
    warnings: [...new Set(warnings)],
    fetched,
  };
}
