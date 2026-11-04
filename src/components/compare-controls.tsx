"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GitCompare, X } from "lucide-react";
import { cx } from "./ui";

const STORAGE_KEY = "baseedit-compare";
const EVENT = "baseedit-compare-change";
export const COMPARE_LIMIT = 3;

function readIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, COMPARE_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids.slice(0, COMPARE_LIMIT)));
  } catch {
    // ignore storage failures
  }
  window.dispatchEvent(new Event(EVENT));
}

export function CompareToggle({ paperId }: { paperId: string }) {
  const [active, setActive] = useState(false);
  const [limitHit, setLimitHit] = useState(false);

  useEffect(() => {
    const sync = () => setActive(readIds().includes(paperId));
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, [paperId]);

  const toggle = () => {
    const ids = readIds();
    if (ids.includes(paperId)) {
      writeIds(ids.filter((id) => id !== paperId));
      setActive(false);
      return;
    }
    if (ids.length >= COMPARE_LIMIT) {
      setLimitHit(true);
      setTimeout(() => setLimitHit(false), 2200);
      return;
    }
    writeIds([...ids, paperId]);
    setActive(true);
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={active}
      title={limitHit ? `最多选择 ${COMPARE_LIMIT} 篇论文` : active ? "从对比中移除" : "加入论文对比"}
      className={cx(
        "inline-flex h-8 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition",
        active
          ? "border-accent/30 bg-accent-soft text-accent-ink"
          : limitHit
            ? "border-warn/40 bg-warn-soft text-warn"
            : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      <GitCompare size={12} />
      {limitHit ? "最多 3 篇" : active ? "已选" : "对比"}
    </button>
  );
}

export function CompareDock() {
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setIds(readIds());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  if (!ids.length) return null;

  return (
    <div className="no-print fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-5 sm:w-[360px]">
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <GitCompare size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-medium text-ink">已选 {ids.length} 篇论文</div>
          <div className="text-[9.5px] text-faint">最多 {COMPARE_LIMIT} 篇 · 对比要点与证据</div>
        </div>
        <Link
          href={`/compare?ids=${ids.join(",")}`}
          className="inline-flex h-8 shrink-0 items-center rounded-full bg-accent px-3 text-[11.5px] font-medium text-white hover:bg-accent-strong"
        >
          开始对比
        </Link>
        <button
          type="button"
          onClick={() => writeIds([])}
          aria-label="清空对比"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-faint hover:bg-surface-2 hover:text-ink"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
