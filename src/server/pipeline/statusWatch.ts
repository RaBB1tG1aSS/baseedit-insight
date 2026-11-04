import type { Paper, RetractionStatus } from "@/lib/types";
import { addVerificationRecords } from "../db/repo/analysis";
import { getPaperById, markAnalysesNeedRefresh, setPaperStatus, updatePaper } from "../db/repo/papers";
import { lookupCrossrefByDoi } from "../sources/crossref";
import { lookupOpenAlexByDoi } from "../sources/openalex";
import { lookupPubmedByPmid } from "../sources/pubmed";
import { getSettings } from "../db/repo/settings";
import { env } from "../env";

const SEVERITY: Record<RetractionStatus, number> = {
  retracted: 4,
  expression_of_concern: 3,
  correction: 2,
  none: 1,
  unknown: 0,
};

export interface StatusWatchResult {
  paperId: string;
  changed: boolean;
  retractionStatus: RetractionStatus | null;
  notes: string[];
}

/**
 * Re-checks retraction / publication status of an accepted paper (§1.2).
 * A newly discovered retraction immediately downgrades the paper and marks its
 * AI artefacts as stale.
 */
export async function recheckPaperStatus(paperId: string): Promise<StatusWatchResult> {
  const paper = getPaperById(paperId);
  if (!paper) return { paperId, changed: false, retractionStatus: null, notes: ["paper not found"] };

  const settings = getSettings();
  const notes: string[] = [];
  let worst: { status: RetractionStatus; note: string | null } = {
    status: paper.retractionStatus,
    note: paper.retractionNote,
  };

  const consider = (status: RetractionStatus | null, note: string | null, source: string) => {
    if (!status) return;
    if ((SEVERITY[status] ?? 0) > (SEVERITY[worst.status] ?? 0)) {
      worst = { status, note };
      notes.push(`${source}: ${status} ${note ?? ""}`.trim());
    }
  };

  try {
    if (paper.doi) {
      const crossref = await lookupCrossrefByDoi(paper.doi, settings.openalexMailto);
      consider(crossref?.retractionStatus ?? null, crossref?.retractionNote ?? null, "Crossref");
    }
  } catch (error) {
    notes.push(`Crossref 复查失败：${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    if (paper.doi) {
      const openalex = await lookupOpenAlexByDoi(paper.doi, settings.openalexMailto);
      consider(openalex?.retractionStatus ?? null, openalex?.retractionNote ?? null, "OpenAlex");
    }
  } catch (error) {
    notes.push(`OpenAlex 复查失败：${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    if (paper.pmid) {
      const pubmed = await lookupPubmedByPmid(paper.pmid, {
        query: "",
        limit: 1,
        mailto: settings.ncbiEmail || env.ncbiEmail,
        apiKey: env.ncbiApiKey || undefined,
      });
      consider(pubmed?.retractionStatus ?? null, pubmed?.retractionNote ?? null, "PubMed");
    }
  } catch (error) {
    notes.push(`PubMed 复查失败：${error instanceof Error ? error.message : String(error)}`);
  }

  const changed = worst.status !== paper.retractionStatus;
  addVerificationRecords(paper.id, [
    {
      checkItem: "状态复查",
      result: worst.status === "retracted" ? "fail" : worst.status === "none" ? "pass" : "warning",
      evidenceSource: "Crossref/OpenAlex/PubMed",
      evidence: worst.note,
      notes: changed ? `状态由 ${paper.retractionStatus} 变更为 ${worst.status}` : "状态未变化",
    },
  ]);

  if (changed) {
    updatePaper(
      paper.id,
      {
        retraction_status: worst.status,
        retraction_note: worst.note,
        publication_status: worst.status === "retracted" ? "retracted" : paper.publicationStatus,
      },
      "status watch",
    );
    markAnalysesNeedRefresh(paper.id);
    if (worst.status === "retracted") {
      setPaperStatus(paper.id, "rejected");
      notes.push("论文已撤稿：已移出正式推荐集合，历史精讲已标记为 stale");
    }
  }

  return { paperId, changed, retractionStatus: worst.status, notes };
}

export function selectPapersForWatch(candidates: Paper[], limit: number): Paper[] {
  return [...candidates]
    .sort((a, b) => (a.verifiedAt ?? "").localeCompare(b.verifiedAt ?? ""))
    .slice(0, limit);
}
