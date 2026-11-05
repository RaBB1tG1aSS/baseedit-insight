import type { AppSettings, FocusArea, PaperStatus, RecommendationCategory } from "@/lib/types";
import { getDb, newId, nowIso } from "../db/client";
import {
  findPaperByExternalIds,
  getPaperById,
  insertPaper,
  markAnalysesNeedRefresh,
  setPaperStatus,
  updatePaper,
  type PaperPatch,
} from "../db/repo/papers";
import {
  addVerificationRecords,
  replaceSources,
  saveQualityAssessment,
} from "../db/repo/analysis";
import type { SourceRecord } from "../sources/types";
import type { MergedCandidate } from "./dedupe";
import type { VerificationOutcome } from "./verify";
import type { QualityResult } from "./quality";
import type { RelevanceAssessment } from "./relevance";
import { yearOf } from "../utils/normalize";

export interface IngestResult {
  paperId: string;
  created: boolean;
  status: PaperStatus;
  statusChanged: boolean;
  versionBumped: boolean;
  changedFields: string[];
}

function classifyCategory(candidate: MergedCandidate, quality: QualityResult): RecommendationCategory | null {
  const year = yearOf(candidate.publicationDate);
  const now = new Date().getFullYear();
  const age = year ? Math.max(0.5, now - year + 0.5) : 99;
  if (candidate.publicationDate && now - year! <= 2) return "latest";
  if (year && age >= 3 && quality.total >= 75 && candidate.citationCount / age >= 8) return "landmark";
  return null;
}

export function ingestCandidate(params: {
  candidate: MergedCandidate;
  verification: VerificationOutcome;
  quality: QualityResult;
  relevance: RelevanceAssessment;
  status: PaperStatus;
  settings: AppSettings;
}): IngestResult {
  const { candidate, verification, quality, relevance, status } = params;
  const existing = findPaperByExternalIds({
    doi: candidate.doi,
    pmid: candidate.pmid,
    pmcid: candidate.pmcid,
    openalexId: candidate.openalexId,
    titleKey: candidate.titleKey,
  });

  const officialUrl =
    candidate.doi ? `https://doi.org/${candidate.doi}` : candidate.records.map((record) => record.url).find(Boolean) ?? null;

  const sourceRecords = dedupeSources([...candidate.records, ...verification.fetched]);
  const now = nowIso();

  if (existing) {
    const patch: PaperPatch = {};
    const setIf = (key: keyof PaperPatch, value: unknown, currentValue: unknown) => {
      if (value == null || value === "") return;
      if (String(currentValue ?? "") !== String(value)) {
        (patch as Record<string, unknown>)[key] = value;
      }
    };

    setIf("title", candidate.title, existing.title);
    setIf("doi", candidate.doi, existing.doi);
    setIf("pmid", candidate.pmid, existing.pmid);
    setIf("pmcid", candidate.pmcid, existing.pmcid);
    setIf("openalex_id", candidate.openalexId, existing.openalexId);
    setIf("journal", candidate.journal, existing.journal);
    setIf("journal_issn", candidate.issn, existing.journalIssn);
    setIf("publication_date", candidate.publicationDate, existing.publicationDate);
    setIf("online_publication_date", candidate.onlinePublicationDate, existing.onlinePublicationDate);
    setIf("article_type", candidate.articleType, existing.articleType);
    setIf("abstract", candidate.abstract, existing.abstract);
    setIf("official_url", officialUrl, existing.officialUrl);
    setIf("peer_review_status", candidate.peerReviewStatus, existing.peerReviewStatus);
    setIf("publication_status", candidate.publicationStatus, existing.publicationStatus);
    setIf("retraction_status", candidate.retractionStatus, existing.retractionStatus);
    setIf("retraction_note", candidate.retractionNote, existing.retractionNote);
    setIf("full_text_access_status", candidate.fullTextAccessStatus, existing.fullTextAccessStatus);
    setIf("full_text_license", candidate.license, existing.fullTextLicense);
    setIf("quality_score", quality.total, existing.qualityScore);
    setIf("quality_summary", quality.summary, existing.qualitySummary);
    if (candidate.authors.length && JSON.stringify(candidate.authors) !== JSON.stringify(existing.authors)) {
      patch.authors_json = JSON.stringify(candidate.authors);
    }
    if (candidate.keywords.length && JSON.stringify(candidate.keywords) !== JSON.stringify(existing.keywords)) {
      patch.keywords_json = JSON.stringify(candidate.keywords);
    }
    const focusAreas = relevance.focusAreas as FocusArea[];
    if (focusAreas.length) patch.focus_areas_json = JSON.stringify(focusAreas);
    if (candidate.citationCount > existing.citationCount) patch.citation_count = candidate.citationCount;
    const category = existing.recommendationCategory ?? classifyCategory(candidate, quality);
    if (category) patch.recommendation_category = category;

    const nextStatus: PaperStatus =
      existing.status === "accepted" && status === "accepted" ? "accepted" : status;
    if (nextStatus !== existing.status) patch.status = nextStatus;
    if (nextStatus === "accepted" && !existing.verifiedAt) patch.verified_at = now;

    const update = updatePaper(existing.id, patch, "pipeline verification");
    if (update.versionBumped) {
      markAnalysesNeedRefresh(existing.id);
    }
    if (patch.status && patch.status !== existing.status) {
      setPaperStatus(existing.id, patch.status);
    }
    if (candidate.retractionStatus === "retracted") {
      markAnalysesNeedRefresh(existing.id);
    }

    replaceSources(existing.id, sourceRecords, verification.identityVerified ? "verified" : "unverified");
    addVerificationRecords(existing.id, verification.checks);
    addVerificationRecords(existing.id, [
      {
        checkItem: "入库判定",
        result: nextStatus === "accepted" ? "pass" : nextStatus === "rejected" ? "fail" : "warning",
        evidenceSource: "quality-gate",
        evidence: `质量 ${quality.total}/100；相关性 ${relevance.score}/15`,
        notes: params.status === "accepted" ? "通过质量门槛" : "未通过质量门槛",
      },
    ]);
    saveQualityAssessment({
      paperId: existing.id,
      dimensions: quality.dimensions.map((dimension) => ({
        key: dimension.key,
        score: dimension.score,
        rationale: dimension.rationale,
        method: dimension.method,
      })),
      summary: quality.summary,
      model: null,
      promptVersion: null,
    });

    return {
      paperId: existing.id,
      created: false,
      status: nextStatus,
      statusChanged: nextStatus !== existing.status,
      versionBumped: update.versionBumped,
      changedFields: update.changed,
    };
  }

  const paper = insertPaper({
    doi: candidate.doi,
    pmid: candidate.pmid,
    pmcid: candidate.pmcid,
    openalexId: candidate.openalexId,
    title: candidate.title,
    authors: candidate.authors,
    journal: candidate.journal,
    journalIssn: candidate.issn,
    publicationDate: candidate.publicationDate,
    onlinePublicationDate: candidate.onlinePublicationDate,
    articleType: candidate.articleType,
    abstract: candidate.abstract,
    keywords: candidate.keywords,
    officialUrl,
    peerReviewStatus: candidate.peerReviewStatus,
    publicationStatus: candidate.publicationStatus,
    retractionStatus: candidate.retractionStatus,
    retractionNote: candidate.retractionNote,
    fullTextAccessStatus: candidate.fullTextAccessStatus,
    fullTextLicense: candidate.license,
    qualityScore: quality.total,
    qualitySummary: quality.summary,
    recommendationCategory: classifyCategory(candidate, quality),
    focusAreas: relevance.focusAreas,
    citationCount: candidate.citationCount,
    status,
    verifiedAt: status === "accepted" ? now : null,
  });

  replaceSources(paper.id, sourceRecords, verification.identityVerified ? "verified" : "unverified");
  addVerificationRecords(paper.id, verification.checks);
  addVerificationRecords(paper.id, [
    {
      checkItem: "入库判定",
      result: status === "accepted" ? "pass" : status === "rejected" ? "fail" : "warning",
      evidenceSource: "quality-gate",
      evidence: `质量 ${quality.total}/100；相关性 ${relevance.score}/15`,
      notes: params.status === "accepted" ? "通过质量门槛" : "未通过质量门槛",
    },
  ]);
  saveQualityAssessment({
    paperId: paper.id,
    dimensions: quality.dimensions.map((dimension) => ({
      key: dimension.key,
      score: dimension.score,
      rationale: dimension.rationale,
      method: dimension.method,
    })),
    summary: quality.summary,
    model: null,
    promptVersion: null,
  });

  return {
    paperId: paper.id,
    created: true,
    status,
    statusChanged: false,
    versionBumped: false,
    changedFields: [],
  };
}

function dedupeSources(records: SourceRecord[]): SourceRecord[] {
  const map = new Map<string, SourceRecord>();
  for (const record of records) {
    map.set(`${record.source}:${record.externalId}`, record);
  }
  return [...map.values()];
}

export function getPaperStatusSnapshot(paperId: string): PaperStatus | null {
  return getPaperById(paperId)?.status ?? null;
}

export function countUnknownStatus(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM papers WHERE status IN ('discovered','candidate')")
    .get() as { n: number };
  return row.n;
}

/**
 * Persists a candidate that failed the cheap pre-filter (topic relevance /
 * article type). These records stay isolated as `rejected` and are visible in
 * the review queue, so "not stored at all" is never silently conflated with
 * "verified and accepted".
 */
export function ingestPrefilterRejection(params: {
  candidate: MergedCandidate;
  relevance: RelevanceAssessment;
  reason: string;
}): boolean {
  const { candidate, relevance, reason } = params;
  const existing = findPaperByExternalIds({
    doi: candidate.doi,
    pmid: candidate.pmid,
    pmcid: candidate.pmcid,
    openalexId: candidate.openalexId,
    titleKey: candidate.titleKey,
  });

  if (existing) {
    if (existing.status === "accepted") return false;
    setPaperStatus(existing.id, "rejected");
    addVerificationRecords(existing.id, [
      {
        checkItem: "预筛拒绝",
        result: "fail",
        evidenceSource: "relevance-filter",
        evidence: `相关性 ${relevance.score}/15`,
        notes: reason,
      },
    ]);
    return true;
  }

  const paper = insertPaper({
    doi: candidate.doi,
    pmid: candidate.pmid,
    pmcid: candidate.pmcid,
    openalexId: candidate.openalexId,
    title: candidate.title,
    authors: candidate.authors,
    journal: candidate.journal,
    publicationDate: candidate.publicationDate,
    onlinePublicationDate: candidate.onlinePublicationDate,
    articleType: candidate.articleType,
    abstract: candidate.abstract,
    keywords: candidate.keywords,
    officialUrl: candidate.doi ? `https://doi.org/${candidate.doi}` : candidate.records[0]?.url ?? null,
    peerReviewStatus: candidate.peerReviewStatus,
    publicationStatus: candidate.publicationStatus,
    retractionStatus: candidate.retractionStatus,
    retractionNote: candidate.retractionNote,
    fullTextAccessStatus: candidate.fullTextAccessStatus,
    fullTextLicense: candidate.license,
    qualityScore: 0,
    qualitySummary: reason,
    recommendationCategory: null,
    focusAreas: relevance.focusAreas,
    citationCount: candidate.citationCount,
    status: "rejected",
  });

  replaceSources(paper.id, candidate.records, "unverified");
  addVerificationRecords(paper.id, [
    {
      checkItem: "预筛拒绝",
      result: "fail",
      evidenceSource: "relevance-filter",
      evidence: `相关性 ${relevance.score}/15`,
      notes: reason,
    },
  ]);

  return true;
}

export function touchPaperVersion(paperId: string): void {
  getDb()
    .prepare("UPDATE papers SET data_version = data_version + 1, updated_at = ? WHERE id = ?")
    .run(nowIso(), paperId);
}

export function newVerificationId(): string {
  return newId("ver");
}
