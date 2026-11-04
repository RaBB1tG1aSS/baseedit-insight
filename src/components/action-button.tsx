"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Check, Loader2, TriangleAlert } from "lucide-react";
import { cx } from "./ui";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-strong shadow-sm disabled:opacity-60",
  secondary:
    "border border-line bg-surface text-ink-2 hover:border-line-strong hover:text-ink disabled:opacity-60",
  ghost: "text-muted hover:bg-surface-2 hover:text-ink disabled:opacity-60",
  danger: "border border-danger/30 bg-danger-soft text-danger hover:bg-danger/10 disabled:opacity-60",
  gold: "bg-gold text-white hover:opacity-90 disabled:opacity-60",
};

export interface ActionButtonProps {
  endpoint: string;
  method?: "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  label: string;
  pendingLabel?: string;
  successMessage?: string;
  variant?: Variant;
  size?: "sm" | "md";
  icon?: ReactNode;
  className?: string;
  redirectTo?: string;
  confirmText?: string;
  disabled?: boolean;
  title?: string;
}

export function ActionButton({
  endpoint,
  method = "POST",
  body,
  label,
  pendingLabel,
  successMessage,
  variant = "secondary",
  size = "md",
  icon,
  className,
  redirectTo,
  confirmText,
  disabled,
  title,
}: ActionButtonProps) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const run = async () => {
    if (confirmText && !window.confirm(confirmText)) return;
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch(endpoint, {
        method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        blockers?: string[];
        job?: { id?: string };
      };
      if (!response.ok) {
        const detail = payload.blockers?.length ? `：${payload.blockers.join("；")}` : "";
        throw new Error(`${payload.error ?? `请求失败 (${response.status})`}${detail}`);
      }
      setState("success");
      setMessage(payload.message ?? successMessage ?? "操作成功");
      if (redirectTo) {
        const target = redirectTo.replace("{jobId}", payload.job?.id ?? "");
        router.push(target);
      } else {
        router.refresh();
        setTimeout(() => setState("idle"), 4000);
      }
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className={cx("inline-flex flex-col items-start gap-1.5", className)}>
      <button
        type="button"
        onClick={run}
        disabled={disabled || state === "loading"}
        title={title}
        className={cx(
          "inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition",
          size === "sm" ? "h-8 px-3 text-[12px]" : "h-10 px-4 text-[13px]",
          VARIANTS[variant],
        )}
      >
        {state === "loading" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : state === "success" ? (
          <Check size={14} />
        ) : state === "error" ? (
          <TriangleAlert size={14} />
        ) : (
          icon
        )}
        <span>{state === "loading" ? pendingLabel ?? "处理中…" : label}</span>
      </button>
      {message ? (
        <span
          className={cx(
            "max-w-[26rem] text-[11px] leading-5",
            state === "error" ? "text-danger" : "text-muted",
          )}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
