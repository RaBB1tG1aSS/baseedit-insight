import type { Paper } from "@/lib/types";
import { getPaperById } from "../db/repo/papers";
import { getSources } from "../db/repo/analysis";
import { mergeSourceRecords } from "./dedupe";
import { assessRelevance } from "./relevance";
import { verifyCandidate } from "./verify";
import { scoreQuality } from "./quality";
import { gateDecision } from "./gate";
import { ingestCandidate } from "./ingest";
import { getSettings } from "../db/repo/settings";
import { env } from "../env";
import type { SourceRecord, SourceName } from "../sources/types";
import {
  applyJournalMetricToPaper,
  ensureOpenAlexJournalMetric,
  findJournalMetric,
  type ResolvedJournalMetric,
} from "../metrics/journals";

function recordFromPaper(paper: Paper, source: SourceName): SourceRecord {
  return {
    source,
    externalId: paper.doi ?? paper.pmid ?? paper.pmcid ?? paper.id,
    url: paper.officialUrl ?? "",
    doi: paper.doi,
    pmid: paper.pmid,
    pmcid: paper.pmcid,
    openalexId: paper.openalexId,
    title: paper.title,
    authors: paper.authors,
    journal: paper.journal,
    issn: paper.journalIssn,
    publicationDate: paper.publicationDate,
    onlinePublicationDate: paper.onlinePublicationDate,
    articleType: paper.articleType,
    abstract: paper.abstract,
    keywords: paper.keywords,
    peerReviewStatus: paper.peerReviewStatus,
    publicationStatus: paper.publicationStatus,
    retractionStatus: paper.retractionStatus,
    retractionNote: paper.retractionNote,
    fullTextAccessStatus: paper.fullTextAccessStatus,
    fullTextUrl: null,
    license: paper.fullTextLicense,
    citationCount: paper.citationCount,
    retrievedAt: paper.updatedAt,
    raw: { reconstructed: true },
  };
}

export interface ReverifyResult {
  paperId: string;
  status: string;
  changed: boolean;
  quality: number;
  checks: number;
}

export async function reverifyPaper(paperId: string): Promise<ReverifyResult> {
  const paper = getPaperById(paperId);
  if (!paper) throw new Error(`paper not found: ${paperId}`);

  const sources = getSources(paperId);
  const records = sources.length
    ? sources.map((source) => recordFromPaper(paper, source.sourceName as SourceName))
    : [recordFromPaper(paper, "europepmc")];

  const merged = mergeSourceRecords(records)[0];
  if (!merged) throw new Error("failed to reconstruct candidate record");

  const settings = getSettings();
  const relevance = assessRelevance(paper);
  const verification = await verifyCandidate(
    merged,
    {
      ncbiEmail: settings.ncbiEmail || env.ncbiEmail,
      ncbiApiKey: env.ncbiApiKey,
      openalexMailto: settings.openalexMailto || env.openalexMailto,
      semanticScholarKey: env.semanticScholarApiKey,
      enableSemanticScholar: settings.enableSemanticScholar,
    },
  );
  const metricFilterActive =
    settings.journalMetricMode !== "off" && settings.minJournalMetric > 0;
  let journalMetric: ResolvedJournalMetric | null = findJournalMetric(
    { journal: verification.candidate.journal, issn: verification.candidate.issn },
    settings.journalMetricMode,
  );
  if (
    !journalMetric &&
    metricFilterActive &&
    (settings.journalMetricMode === "openalex" || settings.journalMetricMode === "auto")
  ) {
    journalMetric = await ensureOpenAlexJournalMetric({
      journal: verification.candidate.journal,
      issn: verification.candidate.issn,
    });
  }
  if (metricFilterActive) {
    verification.checks.push({
      checkItem: "期刊影响力",
      result: journalMetric
        ? journalMetric.value >= settings.minJournalMetric
          ? "pass"
          : "fail"
        : settings.journalMetricUnknown === "reject"
          ? "fail"
          : "warning",
      evidenceSource: journalMetric?.source ?? settings.journalMetricMode,
      evidence: journalMetric
        ? `${journalMetric.value} (${journalMetric.source}, ${journalMetric.year})`
        : null,
      notes: journalMetric
        ? `当前门槛 ${settings.minJournalMetric}`
        : `未匹配到期刊指标；未知期刊策略：${settings.journalMetricUnknown}`,
    });
  }

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
    journalMetric,
  });

  const result = ingestCandidate({
    candidate: verification.candidate,
    verification,
    quality,
    relevance,
    status: gate.status,
    settings,
  });

  applyJournalMetricToPaper(result.paperId, journalMetric);

  return {
    paperId,
    status: result.status,
    changed: result.status !== paper.status,
    quality: quality.total,
    checks: verification.checks.length,
  };
}
