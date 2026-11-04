import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpen,
  Clock,
  Database,
  FlaskConical,
  Network,
  Quote,
  Search,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { getDashboardData } from "@/server/db/repo/dashboard";
import { getSettings } from "@/server/db/repo/settings";
import {
  countByStatus,
  getAcceptedPaperById,
  getAcceptedWithoutDeepRead,
  getFeaturedTracks,
  listCandidates,
} from "@/server/db/repo/papers";
import { getLatestAnalysis, getVerificationRecords } from "@/server/db/repo/analysis";
import { listJobs, listSearchRuns } from "@/server/db/repo/jobs";
import type { DeepReadContent } from "@/lib/types";
import { FOCUS_LABEL, RELATION_LABELS } from "@/lib/constants";
import { authorsLine, formatDate, formatDateLong, formatDateTimeZone, markdownExcerpt, relativeTime } from "@/lib/format";
import { PaperCard } from "@/components/paper-card";
import { ActionButton } from "@/components/action-button";
import { P0Console } from "@/components/p0-console";
import { FavoriteButton } from "@/components/library-controls";
import { PaperMiniItem } from "@/components/paper-card";
import {
  Badge,
  EmptyState,
  InlineNotice,
  Kicker,
  ProgressBar,
  ScoreRing,
  SectionHeading,
  Stat,
  TextLink,
  cx,
  ExternalLink,
  PeerReviewBadge,
  RetractionBadge,
} from "@/components/ui";
import { todayInZone } from "@/server/db/client";

export const metadata = { title: "今日研究台" };

export default function DashboardPage() {
  const data = getDashboardData();
  const settings = getSettings();
  const today = todayInZone(settings.timezone);
  const rec = data.today;
  const paper = rec ? getAcceptedPaperById(rec.paperId) : null;
  const analysis = rec ? getLatestAnalysis(rec.paperId, "deep_read") : null;
  const content = analysis?.content as DeepReadContent | null;
  const maxTopic = Math.max(1, ...data.hotTopics.map((item) => item.count));
  const worker = data.worker;

  const tracks = getFeaturedTracks(5);
  const backlog = getAcceptedWithoutDeepRead(8);
  const searchRuns = listSearchRuns(6);
  const counts = countByStatus();
  const recentJobs = listJobs(6);
  const candidates = listCandidates({ statuses: ["needs_review", "rejected"], limit: 4 }).map((row) => {
    const checks = getVerificationRecords(row.paper.id, 12);
    const prefilter = checks.find((check) => check.checkItem === "预筛拒绝");
    const decision = checks.find((check) => check.checkItem === "入库判定");
    const reason = prefilter
      ? `预筛拒绝：${prefilter.notes ?? prefilter.evidence ?? "相关性不足"}`
      : decision
        ? `质量门槛：${decision.notes ?? decision.evidence ?? "未通过"}`
        : row.paper.qualitySummary ?? "";
    return {
      paperId: row.paper.id,
      title: row.paper.title,
      titleZh: row.paper.titleZh,
      status: row.paper.status,
      qualityScore: row.paper.qualityScore,
      reason,
    };
  });

  return (
    <div className="container-page pb-8 pt-10">
      {!worker.online ? (
        <div className="no-print mb-6">
          <InlineNotice tone="warn" title="后台 worker 当前离线">
            定时任务与手动任务都需要 worker 进程执行。请在项目目录运行 <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px]">npm run worker</code>
            （开发时可使用 <code className="rounded bg-surface px-1.5 py-0.5 font-mono text-[11px]">npm run dev:all</code>）。
            已排队的任务会在 worker 启动后继续执行，不会伪造进度。
          </InlineNotice>
        </div>
      ) : null}

      <header className="animate-rise mb-8 flex flex-wrap items-end justify-between gap-5">
        <div>
          <Kicker className="mb-2">BaseEdit Insight · Daily Briefing</Kicker>
          <h1 className="display text-[2rem] font-semibold leading-tight text-ink md:text-[2.5rem]">
            每天一篇，读懂碱基编辑
          </h1>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-muted">
            {formatDateLong(today)} · {settings.timezone}
            <span className="mx-2 text-line-strong">/</span>
            已核验文献 <span className="num font-medium text-ink-2">{data.weeklyProgress.papersTotal}</span> 篇
            <span className="mx-2 text-line-strong">/</span>
            所有内容可追溯到 paper_id
          </p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Link
            href="/papers"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[12.5px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
          >
            <Search size={13} /> 检索文献库
          </Link>
          <a
            href="#p0-console"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[12.5px] font-medium text-ink-2 transition hover:border-line-strong hover:text-ink"
          >
            研究控制台 ↓
          </a>
          <ActionButton
            endpoint="/api/jobs"
            body={{ type: "daily_pipeline", payload: {} }}
            label="立即运行检索"
            pendingLabel="提交中…"
            variant="primary"
            size="sm"
            icon={<Sparkles size={13} />}
            redirectTo="/agent?job={jobId}"
          />
        </div>
      </header>

      {rec && paper ? (
        <section className="animate-rise-1 relative overflow-hidden rounded-2xl border border-line bg-surface shadow-soft">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(110% 130% at 100% 0%, color-mix(in oklab, var(--accent) 10%, transparent) 0%, transparent 58%)",
            }}
          />
          <div className="relative grid gap-8 p-6 md:p-8 lg:grid-cols-[1fr_auto] lg:gap-12">
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1 text-[10.5px] font-semibold tracking-wide text-white">
                  <Sparkles size={11} /> 今日精选
                </span>
                <Badge variant={rec.recType === "landmark" ? "gold" : "accent"}>
                  {rec.recType === "landmark" ? "经典奠基研究" : "前沿研究"}
                </Badge>
                <PeerReviewBadge status={paper.peerReviewStatus} />
                <RetractionBadge status={paper.retractionStatus} />
                {paper.fullTextAccessStatus === "oa_fulltext" ? (
                  <Badge variant="outline">
                    <BookOpen size={10} /> 开放全文
                  </Badge>
                ) : (
                  <Badge variant="outline">摘要级材料</Badge>
                )}
              </div>

              <h2 className="display max-w-4xl text-[1.55rem] font-semibold leading-[1.35] text-ink md:text-[2.05rem]">
                {paper.title}
              </h2>
              {paper.titleZh ? (
                <p className="mt-2.5 text-[14px] leading-7 text-muted md:text-[15px]">{paper.titleZh}</p>
              ) : null}

              <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-muted">
                <span className="font-medium text-ink-2">{paper.journal ?? "期刊未知"}</span>
                <span className="text-line-strong">·</span>
                <span>{formatDate(paper.publicationDate)}</span>
                <span className="text-line-strong">·</span>
                <span>{paper.articleType ?? "研究论文"}</span>
                <span className="text-line-strong">·</span>
                <span className="inline-flex items-center gap-1">
                  <Quote size={10} /> 被引 {paper.citationCount}
                </span>
              </div>
              <p className="mt-2 text-[11.5px] leading-6 text-faint">{authorsLine(paper.authors, 6)}</p>

              <div className="mt-6 rounded-xl border border-line bg-bg-elevated/80 px-4 py-3.5">
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                  <Sparkles size={11} /> AI 今日导读
                </div>
                <p className="display text-[15px] leading-7 text-ink md:text-[16px]">
                  {content?.one_liner ?? rec.reason}
                </p>
                {!analysis ? (
                  <p className="mt-1.5 text-[10.5px] text-faint">
                    该论文尚未生成 AI 精讲；以上为基于核验元数据的推荐说明，不包含 AI 分析。
                  </p>
                ) : null}
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">核心创新</div>
                  <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-6 text-ink-2">{rec.innovation}</p>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">推荐理由</div>
                  <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-6 text-ink-2">{rec.reason}</p>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">研究价值</div>
                  <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-6 text-ink-2">{rec.value}</p>
                </div>
              </div>

              <div className="no-print mt-6 flex flex-wrap items-center gap-2.5">
                <Link
                  href={`/papers/${paper.id}`}
                  className="inline-flex h-10 items-center gap-1.5 rounded-full bg-accent px-5 text-[13px] font-medium text-white shadow-sm transition hover:bg-accent-strong"
                >
                  阅读中文精讲 <ArrowRight size={14} />
                </Link>
                <ExternalLink href={paper.officialUrl} className="h-10 rounded-full border border-line bg-surface px-4 text-[13px]">
                  官方原文
                </ExternalLink>
                <FavoriteButton paperId={paper.id} initial={false} />
                <span className="ml-1 text-[10.5px] text-faint">
                  {paper.doi ? `DOI ${paper.doi}` : paper.pmid ? `PMID ${paper.pmid}` : "无外部标识符"}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-start gap-5 lg:w-[230px] lg:border-l lg:border-line lg:pl-8">
              <ScoreRing score={paper.qualityScore} size={104} stroke={7} />
              <div className="w-full space-y-2.5 text-[11.5px]">
                <MetaRow label="论文类型" value={paper.articleType ?? "研究论文"} />
                <MetaRow label="发表状态" value={paper.publicationStatus} />
                <MetaRow label="全文许可" value={paper.fullTextLicense ?? "—"} />
                <MetaRow label="PMID" value={paper.pmid ?? "—"} mono />
                <MetaRow label="PMCID" value={paper.pmcid ?? "—"} mono />
                <MetaRow label="推荐日期" value={formatDate(rec.date)} />
              </div>
              <div className="w-full border-t border-line pt-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">研究主题</div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {paper.focusAreas.map((area) => (
                    <Badge key={area} variant="outline">
                      {FOCUS_LABEL[area]}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <section className="animate-rise-1">
          <EmptyState
            title="今日精选尚未生成"
            description="系统不会为了完成每日任务而降低质量门槛。若今天没有满足条件的论文，会从已入库但尚未推荐的高价值论文中选择，或保持空白。"
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <ActionButton
                  endpoint="/api/jobs"
                  body={{ type: "daily_pipeline", payload: {} }}
                  label="运行每日流水线"
                  variant="primary"
                  icon={<Sparkles size={13} />}
                  redirectTo="/agent?job={jobId}"
                />
                <Link
                  href="/papers"
                  className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-[13px] text-ink-2 hover:border-line-strong"
                >
                  浏览已入库文献
                </Link>
              </div>
            }
          />
        </section>
      )}

      <section className="animate-rise-2 mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="已核验文献"
          value={data.weeklyProgress.papersTotal}
          hint="中央文献数据库 accepted"
          icon={<Database size={14} />}
        />
        <Stat
          label="本周新入库"
          value={data.weeklyProgress.acceptedThisWeek}
          hint="通过核验与质量门槛"
          icon={<TrendingUp size={14} />}
        />
        <Stat
          label="本周阅读"
          value={data.weeklyProgress.readingThisWeek}
          hint="打开过的不同论文"
          icon={<BookOpen size={14} />}
        />
        <Stat
          label="本周新知识实体"
          value={data.weeklyProgress.newEntities}
          hint="技术 / 疾病 / 递送"
          icon={<Network size={14} />}
        />
      </section>

      <div id="p0-console">
        <P0Console
          latest={tracks.latest}
          landmark={tracks.landmark}
          backlog={backlog}
          searchRuns={searchRuns}
          candidates={candidates}
          counts={counts}
          worker={worker}
          timezone={settings.timezone}
          recentJobs={recentJobs}
          todayPaperId={rec?.paperId ?? null}
        />
      </div>

      <div className="mt-12 grid gap-8 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <SectionHeading
            kicker="Recently verified"
            title="最近入库"
            description="全部来自同一中央文献数据库；列表中的每篇论文都经过身份核验与质量门槛。"
            action={<TextLink href="/papers">全部文献 <ArrowRight size={13} /></TextLink>}
          />
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            {data.recentPapers.length ? (
              data.recentPapers.slice(0, 4).map((item) => <PaperCard key={item.id} paper={item} />)
            ) : (
              <div className="md:col-span-2">
                <EmptyState
                  title="文献库还是空的"
                  description="运行一次检索，系统会从 Europe PMC 与 PubMed 发现候选论文，完成去重、核验、质量评估后才写入中央数据库。"
                  action={
                    <ActionButton
                      endpoint="/api/jobs"
                      body={{ type: "daily_pipeline", payload: {} }}
                      label="开始第一次检索"
                      variant="primary"
                      redirectTo="/agent?job={jobId}"
                    />
                  }
                />
              </div>
            )}
          </div>

          {data.latestReport ? (
            <div className="mt-8">
              <SectionHeading
                kicker="Weekly insights"
                title="本周研究进展"
                action={<TextLink href={`/weekly/${data.latestReport.id}`}>阅读全文 <ArrowRight size={13} /></TextLink>}
              />
              <Link
                href={`/weekly/${data.latestReport.id}`}
                className="card mt-4 block p-6 transition hover:border-line-strong hover:shadow-lift"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10.5px] font-medium uppercase tracking-[0.14em] text-accent">
                      {data.latestReport.weekStart} — {data.latestReport.weekEnd}
                    </div>
                    <h3 className="display mt-2 text-xl font-semibold leading-8 text-ink">
                      {data.latestReport.title}
                    </h3>
                    <p className="mt-2 line-clamp-2 text-[13px] leading-7 text-muted">
                      {markdownExcerpt(data.latestReport.content?.sections?.[0]?.body_md, 180) ||
                        "查看本周研究进展与分析。"}
                    </p>
                  </div>
                  <Badge variant="outline">{data.latestReport.paperCount ?? 0} 篇引用</Badge>
                </div>
              </Link>
            </div>
          ) : null}
        </div>

        <aside className="space-y-6 lg:col-span-4">
          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="display text-[15px] font-semibold text-ink">研究方向热点</h3>
              <FlaskConical size={14} className="text-faint" />
            </div>
            <p className="mt-1 text-[10.5px] text-faint">按已入库文献主题统计，不代表领域整体趋势。</p>
            <div className="mt-4 space-y-3">
              {data.hotTopics.map((topic) => (
                <Link key={topic.key} href={`/papers?focus=${topic.key}`} className="group block">
                  <div className="mb-1 flex items-center justify-between text-[11.5px]">
                    <span className="text-ink-2 group-hover:text-ink">{topic.label}</span>
                    <span className="num text-faint">{topic.count}</span>
                  </div>
                  <ProgressBar value={topic.count} max={maxTopic} />
                </Link>
              ))}
            </div>
            <Link
              href="/insights"
              className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:text-accent-strong"
            >
              研究洞察与个性化推荐 <ArrowRight size={12} />
            </Link>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="display text-[15px] font-semibold text-ink">继续阅读</h3>
              <Clock size={14} className="text-faint" />
            </div>
            {data.readingHistory.length ? (
              <div className="mt-3 -mx-1.5 space-y-0.5">
                {data.readingHistory.map((entry) => (
                  <PaperMiniItem
                    key={entry.paper.id}
                    title={entry.paper.titleZh || entry.paper.title}
                    meta={`${relativeTime(entry.openedAt)} · ${entry.paper.journal ?? "未知期刊"}`}
                    href={`/papers/${entry.paper.id}`}
                    icon={<BookOpen size={12} />}
                  />
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] leading-6 text-muted">
                还没有阅读记录。打开任意论文精讲后，阅读进度会自动保存。
              </p>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="display text-[15px] font-semibold text-ink">知识图谱动态</h3>
              <Network size={14} className="text-faint" />
            </div>
            {data.graphUpdates.length ? (
              <div className="mt-3 space-y-3">
                {data.graphUpdates.map((relation) => (
                  <Link key={relation.id} href="/graph" className="block rounded-lg p-1.5 transition hover:bg-surface-2">
                    <div className="text-[12px] leading-5 text-ink-2">
                      <span className="font-medium">{relation.sourceName}</span>
                      <span className="mx-1 text-[10.5px] text-accent">{RELATION_LABELS[relation.relationType] ?? relation.relationType}</span>
                      <span className="font-medium">{relation.targetName}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-1 text-[10px] text-faint">{relation.paperTitle}</div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[12px] leading-6 text-muted">
                尚未抽取到有证据支持的知识关系。知识图谱只收录能追溯到原文的关系。
              </p>
            )}
            <Link href="/graph" className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:text-accent-strong">
              打开知识图谱 <ArrowRight size={12} />
            </Link>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between">
              <h3 className="display text-[15px] font-semibold text-ink">自动化状态</h3>
              <Activity size={14} className="text-faint" />
            </div>
            <div className="mt-3 space-y-2 text-[11.5px]">
              <div className="flex items-center justify-between">
                <span className="text-muted">Worker</span>
                <span className={cx("inline-flex items-center gap-1.5", worker.online ? "text-success" : "text-warn")}>
                  <span className={cx("h-1.5 w-1.5 rounded-full", worker.online ? "bg-success" : "bg-warn")} />
                  {worker.online ? "在线" : "离线"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">每日任务</span>
                <span className="text-ink-2">{settings.dailyRunTime} ({settings.timezone})</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">下次运行</span>
                <span className="text-ink-2">
                  {worker.nextDailyRun ? formatDateTimeZone(worker.nextDailyRun, settings.timezone) : "调度关闭"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">定时调度</span>
                <span className={worker.schedulerEnabled ? "text-success" : "text-warn"}>
                  {worker.schedulerEnabled ? "已启用" : "已关闭"}
                </span>
              </div>
            </div>
            <Link href="/agent" className="mt-3 inline-flex items-center gap-1 text-[11.5px] font-medium text-accent hover:text-accent-strong">
              查看运行日志 <ArrowRight size={12} />
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-line/60 pb-2 last:border-0">
      <span className="shrink-0 text-faint">{label}</span>
      <span className={cx("truncate text-right text-ink-2", mono && "font-mono text-[10.5px]")} title={value}>
        {value}
      </span>
    </div>
  );
}
