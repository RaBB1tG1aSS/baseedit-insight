"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  Check,
  FileCheck2,
  FileText,
  Loader2,
  RefreshCw,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from "lucide-react";
import { cx } from "./ui";

const MAX_CHARS = 500_000;

export interface ImportedFullText {
  sections: number;
  chars: number;
}

export function FullTextImport({
  paperId,
  imported,
  defaultOpen = false,
}: {
  paperId: string;
  imported: ImportedFullText | null;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(defaultOpen && !imported);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [generate, setGenerate] = useState(true);
  const [state, setState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const busy = state === "loading";

  const reset = () => {
    setText("");
    setFileName(null);
    setState("idle");
    setMessage(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (/\.pdf$/i.test(file.name)) {
      setState("error");
      setMessage("暂不能直接解析 PDF：请用阅读器打开 PDF，全选复制正文后粘贴到下方文本框。");
      return;
    }
    if (!/\.(txt|text|md|markdown)$/i.test(file.name) && !file.type.startsWith("text/")) {
      setState("error");
      setMessage("仅支持 .txt / .md 等纯文本文件；PDF 请复制正文后粘贴。");
      return;
    }
    const content = await file.text();
    setText(content.slice(0, MAX_CHARS));
    setFileName(file.name);
    setState("idle");
    setMessage(null);
  };

  const submit = async (withGenerate: boolean) => {
    if (text.trim().length < 500) {
      setState("error");
      setMessage("正文太短：至少需要 500 个字符。请检查是否只粘贴了标题或摘要。");
      return;
    }
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch(`/api/papers/${paperId}/fulltext`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text, generate: withGenerate }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        job?: { id?: string } | null;
        sections?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? `导入失败 (${response.status})`);

      setState("success");
      setMessage(payload.message ?? "原文已导入");
      if (withGenerate && payload.job?.id) {
        router.push(`/agent?job=${payload.job.id}`);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const regenerate = async () => {
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch(`/api/papers/${paperId}/analysis`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        message?: string;
        error?: string;
        job?: { id?: string };
      };
      if (!response.ok) throw new Error(payload.error ?? `提交失败 (${response.status})`);
      if (payload.job?.id) router.push(`/agent?job=${payload.job.id}`);
      else router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const remove = async () => {
    if (!window.confirm("移除手动导入的原文？已有的精讲不会删除，但之后的重新生成将回到摘要级。")) return;
    setState("loading");
    setMessage(null);
    try {
      const response = await fetch(`/api/papers/${paperId}/fulltext`, { method: "DELETE" });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? `移除失败 (${response.status})`);
      reset();
      setOpen(false);
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  if (imported && !open) {
    return (
      <div className="card p-4" id="fulltext-import">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink">
              <FileCheck2 size={14} className="text-accent" />
              已导入原文
            </div>
            <p className="mt-1 text-[11px] leading-5 text-muted">
              {imported.sections} 个章节 · {imported.chars.toLocaleString()} 字符 · 仅保存在本机，用于生成全文级精讲
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={regenerate}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-strong disabled:opacity-60"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
              用导入原文重新生成精讲
            </button>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] text-ink-2 hover:border-line-strong"
            >
              <Upload size={12} /> 替换
            </button>
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] text-ink-2 hover:border-danger/40 hover:text-danger disabled:opacity-60"
            >
              <Trash2 size={12} /> 移除
            </button>
          </div>
        </div>
        {message ? (
          <p className={cx("mt-2 text-[11px]", state === "error" ? "text-danger" : "text-muted")}>{message}</p>
        ) : null}
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        id="fulltext-import"
        className="card flex w-full items-center gap-3 p-4 text-left transition hover:border-line-strong"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
          <Upload size={15} />
        </span>
        <span className="min-w-0">
          <span className="block text-[12.5px] font-medium text-ink">无法获取全文？手动导入原文</span>
          <span className="mt-0.5 block text-[11px] leading-5 text-muted">
            从出版商页面、机构订阅或预印本复制正文（或上传 .txt / .md），再生成包含 Results 与图表细节的全文级精讲。
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="card p-4" id="fulltext-import">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="kicker">全文不可获取</div>
          <h3 className="mt-1 text-[13.5px] font-semibold text-ink">手动导入论文原文</h3>
          <p className="mt-1 max-w-2xl text-[11px] leading-5 text-muted">
            把论文正文粘贴到下方，或上传纯文本文件。系统会按章节切分并只保存在本机数据库，
            随后可生成全文级精讲。请确认你有权访问该原文，并遵守出版方许可。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="rounded-full p-1 text-faint hover:bg-surface-2 hover:text-ink"
          aria-label="收起"
        >
          <X size={14} />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <input
          ref={fileInput}
          type="file"
          accept=".txt,.text,.md,.markdown,text/plain"
          className="hidden"
          onChange={(event) => void onFile(event.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] text-ink-2 hover:border-line-strong"
        >
          <FileText size={12} /> 选择 .txt / .md
        </button>
        {fileName ? <span className="text-[11px] text-muted">{fileName}</span> : null}
        <span className="ml-auto num text-[10.5px] text-faint">
          {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
        </span>
      </div>

      <textarea
        value={text}
        onChange={(event) => {
          setText(event.target.value.slice(0, MAX_CHARS));
          setState("idle");
          setMessage(null);
        }}
        rows={10}
        spellCheck={false}
        placeholder="在此粘贴论文正文。建议包含 Abstract、Introduction、Results、Discussion 等章节，可去掉参考文献、页眉页脚与作者信息。"
        className="mt-3 w-full resize-y rounded-xl border border-line bg-surface px-3.5 py-3 text-[12.5px] leading-6 text-ink outline-none placeholder:text-faint focus:border-accent/50"
      />

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-[11.5px] text-muted">
          <input
            type="checkbox"
            checked={generate}
            onChange={(event) => setGenerate(event.target.checked)}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          导入后立即生成全文级精讲
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={busy || text.trim().length < 500}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] text-ink-2 hover:border-line-strong disabled:opacity-50"
          >
            仅导入
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={busy || text.trim().length < 500}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-accent px-3.5 text-[12px] font-medium text-white hover:bg-accent-strong disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            {busy ? "导入中…" : "导入并生成精讲"}
          </button>
        </div>
      </div>

      {message ? (
        <p
          className={cx(
            "mt-2 flex items-start gap-1.5 text-[11px] leading-5",
            state === "error" ? "text-danger" : state === "success" ? "text-success" : "text-muted",
          )}
        >
          {state === "error" ? <TriangleAlert size={12} className="mt-0.5 shrink-0" /> : null}
          {state === "success" ? <Check size={12} className="mt-0.5 shrink-0" /> : null}
          {message}
        </p>
      ) : null}

      <p className="mt-2 text-[10px] leading-4 text-faint">
        导入内容只写入本机 SQLite，不会上传到任何第三方服务；自动抓取流程不会覆盖你导入的文本。
      </p>
    </div>
  );
}
