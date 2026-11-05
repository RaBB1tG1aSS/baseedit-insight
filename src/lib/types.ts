/**
 * Shared domain types.
 *
 * These types describe the API shape consumed by the UI. The raw SQLite rows
 * (snake_case, JSON encoded) are mapped in src/server/db/repositories.
 */

export type PaperStatus =
  | "discovered"
  | "candidate"
  | "metadata_verified"
  | "quality_assessed"
  | "accepted"
  | "rejected"
  | "needs_review";

export type PeerReviewStatus = "peer_reviewed" | "preprint" | "unknown";
export type PublicationStatus =
  | "published"
  | "ahead_of_print"
  | "epub"
  | "preprint"
  | "retracted"
  | "unknown";
export type RetractionStatus =
  | "none"
  | "retracted"
  | "expression_of_concern"
  | "correction"
  | "unknown";
export type FullTextStatus = "oa_fulltext" | "abstract_only" | "unknown";

export type JournalMetricSource = "jcr" | "openalex" | "custom";
export type JournalMetricMode = "off" | "jcr" | "openalex" | "auto";
export type RecommendationCategory = "latest" | "landmark";

export type FocusArea =
  | "editors"
  | "safety"
  | "delivery"
  | "disease"
  | "field";

export type EvidenceNature =
  | "reported_fact"
  | "author_interpretation"
  | "ai_synthesis"
  | "hypothesis";

export interface EvidenceRef {
  paper_id: string;
  /** "Figure 2", "Results — 3.1", "Abstract", "Table 1" ... */
  location: string;
  /** Verbatim excerpt from the paper (or abstract). */
  quote: string;
  nature: EvidenceNature;
}

export interface Paper {
  id: string;
  doi: string | null;
  pmid: string | null;
  pmcid: string | null;
  openalexId: string | null;
  semanticScholarId: string | null;
  title: string;
  titleZh: string | null;
  authors: string[];
  journal: string | null;
  journalIssn: string | null;
  journalMetric: number | null;
  journalMetricSource: JournalMetricSource | null;
  journalMetricYear: number | null;
  publicationDate: string | null;
  onlinePublicationDate: string | null;
  articleType: string | null;
  abstract: string | null;
  keywords: string[];
  officialUrl: string | null;
  peerReviewStatus: PeerReviewStatus;
  publicationStatus: PublicationStatus;
  retractionStatus: RetractionStatus;
  retractionNote: string | null;
  fullTextAccessStatus: FullTextStatus;
  fullTextLicense: string | null;
  qualityScore: number | null;
  qualitySummary: string | null;
  recommendationCategory: RecommendationCategory | null;
  focusAreas: FocusArea[];
  citationCount: number;
  status: PaperStatus;
  verifiedAt: string | null;
  needsAnalysisRefresh: boolean;
  dataVersion: number;
  createdAt: string;
  updatedAt: string;
}

/** Minimal paper projection for lists and links. */
export interface PaperSummary {
  id: string;
  title: string;
  titleZh: string | null;
  authors: string[];
  journal: string | null;
  journalIssn: string | null;
  journalMetric: number | null;
  journalMetricSource: JournalMetricSource | null;
  journalMetricYear: number | null;
  publicationDate: string | null;
  articleType: string | null;
  peerReviewStatus: PeerReviewStatus;
  retractionStatus: RetractionStatus;
  qualityScore: number | null;
  recommendationCategory: RecommendationCategory | null;
  focusAreas: FocusArea[];
  status: PaperStatus;
  citationCount: number;
  fullTextAccessStatus: FullTextStatus;
}

export interface SourceLink {
  sourceId: string;
  paperId: string;
  sourceName: string;
  sourceUrl: string;
  externalId: string | null;
  retrievalTime: string;
  verificationStatus: "unverified" | "verified" | "conflict" | "failed";
}

export interface VerificationRecord {
  id: string;
  paperId: string;
  checkItem: string;
  result: "pass" | "fail" | "conflict" | "warning";
  evidenceSource: string | null;
  evidence: string | null;
  notes: string | null;
  checkedAt: string;
}

export const QUALITY_DIMENSIONS = [
  { key: "reliability", label: "学术可靠性", max: 20, description: "同行评审、期刊与出版信息、发表状态、可靠性警示" },
  { key: "innovation", label: "创新性", max: 15, description: "技术创新与科学发现的新颖程度" },
  { key: "rigor", label: "研究严谨性", max: 15, description: "实验设计、对照、统计分析、证据充分性" },
  { key: "impact", label: "领域影响", max: 15, description: "对碱基编辑领域的潜在影响" },
  { key: "scientificValue", label: "科学价值", max: 15, description: "是否解决重要科学问题" },
  { key: "relevance", label: "领域相关性", max: 15, description: "是否真正属于碱基编辑研究" },
  { key: "completeness", label: "信息完整性", max: 5, description: "是否具备充分材料支持深入分析" },
] as const;

export type QualityDimensionKey = (typeof QUALITY_DIMENSIONS)[number]["key"];

export interface QualityDimensionScore {
  key: QualityDimensionKey;
  label: string;
  score: number;
  max: number;
  rationale: string;
  method: "rule" | "llm" | "hybrid";
}

export interface QualityAssessment {
  paperId: string;
  dimensions: QualityDimensionScore[];
  total: number;
  summary: string | null;
  assessedAt: string;
  model: string | null;
}

export interface Figure {
  id: string;
  paperId: string;
  number: string;
  title: string | null;
  legend: string | null;
  sourceUrl: string | null;
  imageAccessStatus: "available" | "link_only" | "unavailable";
  attribution: string | null;
  panels: { label: string; description: string }[];
  /** Latest AI analysis for this figure, if any. */
  analysis?: FigureAnalysis | null;
}

export interface DeepReadContent {
  one_liner: string;
  background: string[];
  core_question: string;
  hypothesis: string;
  goal: string;
  approach: { step: string; question: string; rationale: string }[];
  results: {
    finding: string;
    meaning: string;
    evidence_location: string;
    caveat?: string;
  }[];
  innovations: { type: string; description: string }[];
  author_limitations: string[];
  independent_limitations: string[];
  significance: string;
  takeaways: string[];
  glossary: { term: string; explanation: string }[];
  prerequisites: string[];
  reading_guide: { section: string; reason: string }[];
  evidence: EvidenceRef[];
  figure_logic?: { figure: string; role: string }[];
  recommendation?: {
    reason: string;
    innovation: string;
    value: string;
  };
}

export interface FigureAnalysisContent {
  purpose: string;
  question: string;
  design: string;
  panels: { label: string; description: string }[];
  data_reading: string;
  result: string;
  significance: string;
  critique: string;
  logic_link: string;
  evidence: EvidenceRef[];
}

export interface AiAnalysis {
  id: string;
  paperId: string;
  figureId: string | null;
  kind: "deep_read" | "figure" | "knowledge" | "weekly";
  analysisLevel: "full_text" | "abstract_only";
  templateVersion: string;
  model: string;
  provider: string;
  content: DeepReadContent | FigureAnalysisContent | unknown;
  status: "succeeded" | "failed" | "stale";
  error: string | null;
  generatedAt: string;
}

export interface FigureAnalysis {
  id: string;
  figureId: string;
  analysisLevel: "full_text" | "abstract_only";
  content: FigureAnalysisContent;
  model: string;
  generatedAt: string;
  status: "succeeded" | "failed" | "stale";
}

export interface DailyRecommendation {
  id: string;
  date: string;
  paperId: string;
  recType: RecommendationCategory;
  reason: string;
  innovation: string;
  value: string;
  score: number;
  createdAt: string;
  paper?: PaperSummary;
}

export type EntityType =
  | "editor"
  | "editor_generation"
  | "editing_window"
  | "efficiency"
  | "specificity"
  | "off_target"
  | "delivery"
  | "in_vivo"
  | "disease"
  | "application"
  | "research_team"
  | "researcher"
  | "technology"
  | "research_direction"
  | "concept";

export interface KnowledgeEntity {
  id: string;
  name: string;
  nameZh: string | null;
  type: EntityType;
  description: string | null;
  aliases: string[];
  paperCount: number;
  firstYear: number | null;
}

export interface KnowledgeRelation {
  id: string;
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  relationType: string;
  paperId: string;
  paperTitle?: string;
  evidenceText: string;
  evidenceLocation: string;
  nature: EvidenceNature;
  confidence: number;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  eventDate: string;
  dateKind: "publication" | "first_report" | "validation";
  title: string;
  titleZh: string | null;
  description: string | null;
  category: string;
  paperId: string;
  paperTitle?: string;
  significance: number;
  evidenceText: string | null;
  createdAt: string;
}

export interface WeeklyReportSection {
  key: string;
  heading: string;
  body_md: string;
  paper_ids: string[];
}

export interface WeeklyReportContent {
  title: string;
  period_label: string;
  sections: WeeklyReportSection[];
}

export interface WeeklyReport {
  id: string;
  weekStart: string;
  weekEnd: string;
  title: string;
  content: WeeklyReportContent | null;
  contentMd: string | null;
  citedPapers: string[];
  model: string | null;
  promptVersion: string | null;
  status: "draft" | "published" | "failed";
  generatedAt: string;
  paperCount?: number;
}

export interface UserRecord {
  paperId: string;
  favorite: boolean;
  readStatus: "unread" | "reading" | "read";
  readingProgress: number;
  note: string;
  lastOpenedAt: string | null;
  updatedAt: string;
}

export type JobType =
  | "daily_pipeline"
  | "weekly_report"
  | "search_only"
  | "manual_analysis"
  | "reanalyze_paper"
  | "knowledge_update"
  | "reverify_paper"
  | "journal_metrics_refresh"
  | "status_watch";

export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface JobRun {
  id: string;
  type: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  requestedBy: string;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  attempts: number;
  maxAttempts: number;
  error: string | null;
  progress: JobProgress | null;
}

export interface JobProgress {
  stage?: string;
  stageLabel?: string;
  candidates?: number;
  verified?: number;
  accepted?: number;
  failed?: number;
  total?: number;
  current?: number;
  message?: string;
}

export interface JobLog {
  id: number;
  jobId: string;
  ts: string;
  level: "info" | "warn" | "error";
  stage: string;
  message: string;
  data: unknown;
}

export interface DashboardData {
  today: DailyRecommendation | null;
  recentPapers: PaperSummary[];
  weeklyProgress: { acceptedThisWeek: number; readingThisWeek: number; newEntities: number; papersTotal: number };
  readingHistory: { paper: PaperSummary; openedAt: string }[];
  hotTopics: { key: string; label: string; count: number }[];
  graphUpdates: KnowledgeRelation[];
  latestReport: WeeklyReport | null;
  worker: WorkerStatus;
}

export interface WorkerStatus {
  online: boolean;
  lastSeen: string | null;
  version: string | null;
  nextDailyRun: string | null;
  nextWeeklyRun: string | null;
  schedulerEnabled: boolean;
}

export interface SearchFilters {
  q?: string;
  author?: string;
  doi?: string;
  year?: number;
  journal?: string;
  focusArea?: FocusArea;
  category?: RecommendationCategory;
  minScore?: number;
  minJournalMetric?: number;
  readStatus?: "unread" | "reading" | "read";
  favorite?: boolean;
  status?: PaperStatus;
  sort?: "score" | "date" | "citations" | "added";
  page?: number;
  pageSize?: number;
}

export interface PaperSearchResult {
  papers: (PaperSummary & { userRecord?: UserRecord | null })[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AppSettings {
  timezone: string;
  dailyRunTime: string;
  weeklyRunDay: string;
  weeklyRunTime: string;
  schedulerEnabled: boolean;
  aiProvider: "claude-cli" | "anthropic";
  aiModel: string;
  minAcceptScore: number;
  minTopicRelevance: number;
  maxCandidatesPerRun: number;
  journalMetricMode: JournalMetricMode;
  minJournalMetric: number;
  journalMetricUnknown: "allow" | "reject";
  focusQuery: string;
  ncbiEmail: string;
  openalexMailto: string;
  enableSemanticScholar: boolean;
}

export interface JournalMetricRecord {
  journalId: string;
  journalName: string;
  issn: string | null;
  eissn: string | null;
  metricSource: JournalMetricSource;
  metricYear: number;
  value: number;
}

export interface JournalMetricCoverage {
  totalJournals: number;
  matchedJournals: number;
  jcrCount: number;
  openalexCount: number;
  customCount: number;
  missingJournals: string[];
  recent: JournalMetricRecord[];
}
