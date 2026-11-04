"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, ShieldCheck, X } from "lucide-react";
import { cx } from "./ui";

export function CandidateActions({ paperId, status }: { paperId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState<"accept" | "reject" | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "ok"; text: string } | null>(null);

  const act = async (action: "accept" | "reject") => {
    if (action === "reject" && !window.confirm("确定将该候选论文标记为排除？该操作会记录在核验日志中。")) return;
    setPending(action);
    setMessage(null);
    try {
      const response = await fetch(`/api/candidates/${paperId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        blockers?: string[];
        ok?: boolean;
      };
      if (!response.ok) {
        const detail = payload.blockers?.length ? `：${payload.blockers.join("；")}` : "";
        throw new Error(`${payload.error ?? "操作失败"}${detail}`);
      }
      setMessage({ tone: "ok", text: action === "accept" ? "已人工通过并写入中央数据库" : "已标记为排除" });
      router.refresh();
    } catch (error) {
      setMessage({ tone: "error", text: error instanceof Error ? error.message : String(error) });
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => act("accept")}
          disabled={pending !== null}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-accent/25 bg-accent-soft px-3 text-[11.5px] font-medium text-accent-ink transition hover:border-accent/50 disabled:opacity-60"
        >
          {pending === "accept" ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          人工通过
        </button>
        <button
          type="button"
          onClick={() => act("reject")}
          disabled={pending !== null}
          className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-surface px-3 text-[11.5px] text-muted transition hover:border-danger/30 hover:text-danger disabled:opacity-60"
        >
          {pending === "reject" ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
          排除
        </button>
      </div>
      {message ? (
        <span className={cx("max-w-sm text-right text-[10px] leading-4", message.tone === "error" ? "text-danger" : "text-success")}>
          {message.tone === "error" ? <ShieldCheck size={10} className="mr-1 inline" /> : null}
          {message.text}
        </span>
      ) : null}
      <span className="text-[9px] text-faint">
        {status === "needs_review" ? "人工通过需满足身份核验、撤稿与质量门槛" : "所有操作会写入核验记录"}
      </span>
    </div>
  );
}
