"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bookmark, BookmarkCheck, Check, Loader2 } from "lucide-react";
import { cx } from "./ui";

async function patchRecord(paperId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/library/${paperId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error("保存失败");
  return response.json();
}

export function FavoriteButton({
  paperId,
  initial,
  compact = false,
}: {
  paperId: string;
  initial: boolean;
  compact?: boolean;
}) {
  const [favorite, setFavorite] = useState(initial);
  const [pending, setPending] = useState(false);

  const toggle = async () => {
    const next = !favorite;
    setFavorite(next);
    setPending(true);
    try {
      await patchRecord(paperId, { favorite: next });
    } catch {
      setFavorite(!next);
    } finally {
      setPending(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={favorite}
      aria-label={favorite ? "取消收藏" : "收藏论文"}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition",
        compact ? "h-8" : "h-9",
        favorite
          ? "border-accent/30 bg-accent-soft text-accent-ink"
          : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {pending ? (
        <Loader2 size={13} className="animate-spin" />
      ) : favorite ? (
        <BookmarkCheck size={14} />
      ) : (
        <Bookmark size={14} />
      )}
      {favorite ? "已收藏" : "收藏"}
    </button>
  );
}

const READ_LABELS: { value: "unread" | "reading" | "read"; label: string }[] = [
  { value: "unread", label: "未读" },
  { value: "reading", label: "在读" },
  { value: "read", label: "已读" },
];

export function ReadStatusControl({
  paperId,
  initial,
}: {
  paperId: string;
  initial: "unread" | "reading" | "read";
}) {
  const [status, setStatus] = useState(initial);
  const [pending, setPending] = useState(false);

  const update = async (next: "unread" | "reading" | "read") => {
    setStatus(next);
    setPending(true);
    try {
      await patchRecord(paperId, { readStatus: next });
    } catch {
      setStatus(status);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5">
      {READ_LABELS.map((item) => (
        <button
          key={item.value}
          type="button"
          disabled={pending}
          onClick={() => update(item.value)}
          className={cx(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition",
            status === item.value ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function NoteEditor({ paperId, initial }: { paperId: string; initial: string }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef(initial);

  const save = useCallback(
    async (text: string) => {
      if (text === lastSaved.current) return;
      setStatus("saving");
      try {
        await patchRecord(paperId, { note: text });
        lastSaved.current = text;
        setStatus("saved");
        setTimeout(() => setStatus((current) => (current === "saved" ? "idle" : current)), 2500);
      } catch {
        setStatus("error");
      }
    },
    [paperId],
  );

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (value === lastSaved.current) return;
    timer.current = setTimeout(() => void save(value), 1200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, save]);

  return (
    <div>
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => void save(value)}
        placeholder="记录你的阅读笔记、疑问或可复用的研究思路…"
        rows={7}
        className="w-full resize-y rounded-xl border border-line bg-bg-elevated px-3 py-2.5 text-[13px] leading-6 text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none"
      />
      <div className="mt-1.5 flex items-center justify-between text-[10.5px] text-faint">
        <span>{value.length} 字符 · 自动保存</span>
        <span className="inline-flex items-center gap-1">
          {status === "saving" ? <Loader2 size={11} className="animate-spin" /> : null}
          {status === "saved" ? <Check size={11} className="text-success" /> : null}
          {status === "saving" ? "保存中" : status === "saved" ? "已保存" : status === "error" ? "保存失败" : ""}
        </span>
      </div>
    </div>
  );
}

export function ReadingTracker({ paperId, targetId }: { paperId: string; targetId: string }) {
  const [progress, setProgress] = useState(0);
  const saved = useRef(0);
  const lastSent = useRef(0);

  useEffect(() => {
    fetch(`/api/library/${paperId}/open`, { method: "POST" }).catch(() => {});
  }, [paperId]);

  useEffect(() => {
    let frame = 0;
    const compute = () => {
      const target = document.getElementById(targetId);
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const total = Math.max(rect.height, window.innerHeight);
      const passed = Math.max(0, Math.min(total, window.innerHeight * 0.7 - rect.top));
      const value = Math.max(0, Math.min(1, passed / total));
      setProgress(value);

      if (value - saved.current > 0.08 && Date.now() - lastSent.current > 2500) {
        saved.current = value;
        lastSent.current = Date.now();
        fetch(`/api/library/${paperId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ progress: value }),
          keepalive: true,
        }).catch(() => {});
      }
      frame = 0;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [paperId, targetId]);

  return (
    <div className="no-print fixed left-0 right-0 top-16 z-30 h-[2px] bg-transparent" aria-hidden>
      <div
        className="h-full bg-accent transition-[width] duration-150"
        style={{ width: `${Math.round(progress * 100)}%` }}
      />
    </div>
  );
}
