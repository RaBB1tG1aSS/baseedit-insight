"use client";

import { Printer } from "lucide-react";

export function PrintButton({ label = "打印 / 导出 PDF" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-3.5 text-[12px] text-ink-2 transition hover:border-line-strong hover:text-ink"
    >
      <Printer size={13} /> {label}
    </button>
  );
}
