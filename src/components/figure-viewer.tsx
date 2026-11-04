"use client";

import { useEffect, useState } from "react";
import { ExternalLink, ImageOff, Maximize2, X } from "lucide-react";
import type { Figure } from "@/lib/types";
import { ActionButton } from "./action-button";
import { Badge, EvidenceNatureBadge, cx } from "./ui";

function AnalysisRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-line/70 py-3 first:border-t-0 first:pt-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</div>
      <div className="text-[13px] leading-7 text-ink-2">{children}</div>
    </div>
  );
}

export function FigureBlock({ figure, paperId }: { figure: Figure; paperId: string }) {
  const [zoom, setZoom] = useState(false);
  const [imageError, setImageError] = useState(false);
  const analysis = figure.analysis?.content ?? null;

  useEffect(() => {
    if (!zoom) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoom]);

  const imageAvailable = figure.imageAccessStatus === "available" && figure.sourceUrl && !imageError;

  return (
    <section id={`figure-${figure.id}`} className="scroll-mt-28">
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg-elevated px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-accent px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
              {figure.number}
            </span>
            {figure.title ? <span className="text-[12px] text-ink-2">{figure.title}</span> : null}
          </div>
          <div className="flex items-center gap-2">
            {figure.imageAccessStatus === "available" ? (
              <Badge variant="success">原始图表</Badge>
            ) : (
              <Badge variant="outline">仅提供来源链接</Badge>
            )}
            {figure.sourceUrl && imageAvailable ? (
              <a
                href={figure.sourceUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex items-center gap-1 text-[11px] text-accent hover:text-accent-strong"
              >
                原图 <ExternalLink size={11} />
              </a>
            ) : null}
          </div>
        </div>

        <div className="grid gap-0 lg:grid-cols-[1.05fr_1fr]">
          <div className="border-b border-line bg-surface-2/40 p-4 lg:sticky lg:top-24 lg:self-start lg:border-b-0 lg:border-r">
            {imageAvailable ? (
              <button
                type="button"
                onClick={() => setZoom(true)}
                className="group relative block w-full overflow-hidden rounded-lg border border-line bg-white"
                aria-label="放大查看原始图表"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={figure.sourceUrl ?? ""}
                  alt={`${figure.number} 原始图表`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={() => setImageError(true)}
                  className="h-auto w-full object-contain"
                />
                <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition group-hover:opacity-100">
                  <Maximize2 size={13} />
                </span>
              </button>
            ) : (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line-strong bg-bg-elevated px-4 text-center">
                <ImageOff size={22} className="text-faint" />
                <p className="text-[12px] leading-6 text-muted">
                  无法在此展示原始图表（可能受版权或访问许可限制）。
                </p>
                {figure.sourceUrl ? (
                  <a
                    href={figure.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1 text-[11.5px] text-accent"
                  >
                    前往官方来源查看 <ExternalLink size={11} />
                  </a>
                ) : null}
              </div>
            )}

            {figure.legend ? (
              <details className="mt-3 rounded-lg border border-line bg-surface px-3 py-2" open>
                <summary className="cursor-pointer text-[11px] font-medium text-muted">原始 Figure Legend</summary>
                <p className="mt-2 text-[11.5px] leading-6 text-ink-2">{figure.legend}</p>
              </details>
            ) : null}
            {figure.attribution ? (
              <p className="mt-2 text-[10px] leading-5 text-faint">{figure.attribution}</p>
            ) : null}
          </div>

          <div className="p-5">
            {analysis ? (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <span className="kicker">逐图精讲</span>
                  <span className="text-[10px] text-faint">
                    {figure.analysis?.analysisLevel === "full_text" ? "全文级分析" : "图注级分析"}
                  </span>
                </div>
                <AnalysisRow label="研究目的">{analysis.purpose}</AnalysisRow>
                <AnalysisRow label="科学问题">{analysis.question}</AnalysisRow>
                <AnalysisRow label="研究设计">{analysis.design}</AnalysisRow>
                {analysis.panels.length ? (
                  <AnalysisRow label="子图解释">
                    <ul className="space-y-1.5">
                      {analysis.panels.map((panel) => (
                        <li key={panel.label} className="flex gap-2">
                          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded bg-surface-2 text-[10px] font-semibold text-ink-2">
                            {panel.label}
                          </span>
                          <span>{panel.description}</span>
                        </li>
                      ))}
                    </ul>
                  </AnalysisRow>
                ) : null}
                <AnalysisRow label="数据理解">{analysis.data_reading}</AnalysisRow>
                <AnalysisRow label="结果">{analysis.result}</AnalysisRow>
                <AnalysisRow label="科学意义">{analysis.significance}</AnalysisRow>
                <AnalysisRow label="逻辑联系">{analysis.logic_link}</AnalysisRow>
                <div className="mt-3 rounded-lg border border-gold/25 bg-gold-soft/60 px-3.5 py-3">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-gold">
                    批判性分析
                  </div>
                  <p className="text-[12.5px] leading-7 text-ink-2">{analysis.critique}</p>
                </div>
                {analysis.evidence?.length ? (
                  <details className="mt-3 rounded-lg border border-line bg-bg-elevated px-3 py-2">
                    <summary className="cursor-pointer text-[11px] font-medium text-muted">
                      证据引用（{analysis.evidence.length}）
                    </summary>
                    <ul className="mt-2 space-y-2">
                      {analysis.evidence.map((evidence, index) => (
                        <li key={index} className="text-[11px] leading-6 text-ink-2">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <EvidenceNatureBadge nature={evidence.nature} />
                            <span className="text-faint">{evidence.location}</span>
                          </div>
                          <p className="italic text-muted">“{evidence.quote}”</p>
                        </li>
                      ))}
                    </ul>
                  </details>
                ) : null}
              </div>
            ) : (
              <div className="flex h-full flex-col items-start justify-center gap-3">
                <div>
                  <div className="kicker mb-1">逐图精讲</div>
                  <p className="text-[13px] leading-7 text-muted">
                    该 Figure 尚未生成中文分析。系统只会在能够获取图注或全文时进行分析，不会虚构图表内容。
                  </p>
                </div>
                <ActionButton
                  endpoint={`/api/papers/${paperId}/analysis`}
                  body={{ figuresOnly: true, maxFigures: 8 }}
                  label="生成逐图分析"
                  pendingLabel="排队中…"
                  variant="secondary"
                  size="sm"
                  icon={<Maximize2 size={13} />}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {zoom && figure.sourceUrl ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="图表放大查看"
          onClick={() => setZoom(false)}
        >
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="关闭"
            className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
          >
            <X size={18} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={figure.sourceUrl}
            alt={`${figure.number} 放大图`}
            className={cx("max-h-full max-w-full rounded-lg bg-white object-contain shadow-2xl")}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      ) : null}
    </section>
  );
}
