import Link from "next/link";
import type { ReactNode } from "react";

function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:|\/|#)/i.test(href);
}

function renderInline(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((token, index) => {
    if (!token) return null;
    if (token.startsWith("**") && token.endsWith("**")) {
      return (
        <strong key={index} className="font-semibold text-ink">
          {renderInline(token.slice(2, -2))}
        </strong>
      );
    }
    if (token.startsWith("`") && token.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em] text-ink-2">
          {token.slice(1, -1)}
        </code>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
    if (link) {
      const [, label, href] = link;
      if (!isSafeHref(href)) return <span key={index}>{label}</span>;
      if (href.startsWith("/")) {
        return (
          <Link key={index} href={href} className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent">
            {label}
          </Link>
        );
      }
      return (
        <a
          key={index}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent"
        >
          {label}
        </a>
      );
    }
    return <span key={index}>{token}</span>;
  });
}

/**
 * Minimal, XSS-safe Markdown renderer for AI-generated report bodies.
 * Raw HTML is never interpreted.
 */
export function Markdown({ content, className }: { content: string; className?: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let key = 0;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push(
      <p key={`p-${key++}`} className="my-3 leading-[1.9] text-ink-2">
        {renderInline(paragraph.join(" "))}
      </p>,
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!list) return;
    const items = list.items.map((item, index) => (
      <li key={index} className="my-1.5 pl-1 leading-[1.85]">
        {renderInline(item)}
      </li>
    ));
    blocks.push(
      list.ordered ? (
        <ol key={`ol-${key++}`} className="my-3 list-decimal space-y-1 pl-5 text-ink-2">
          {items}
        </ol>
      ) : (
        <ul key={`ul-${key++}`} className="my-3 list-disc space-y-1 pl-5 marker:text-accent/60">
          {items}
        </ul>
      ),
    );
    list = null;
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const raw = lines[lineIndex];
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      flushParagraph();
      flushList();
      const tableLines = [trimmed];
      while (lineIndex + 1 < lines.length && lines[lineIndex + 1].trim().startsWith("|")) {
        lineIndex += 1;
        tableLines.push(lines[lineIndex].trim());
      }
      const rows = tableLines.map((row) =>
        row
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim()),
      );
      const hasSeparator = rows[1]?.every((cell) => /^:?-{2,}:?$/.test(cell)) ?? false;
      const header = rows[0];
      const bodyRows = rows.slice(hasSeparator ? 2 : 1);
      blocks.push(
        <div key={`table-${key++}`} className="my-4 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-left text-[12px]">
            <thead className="bg-surface-2">
              <tr>
                {header.map((cell, cellIndex) => (
                  <th key={cellIndex} className="border-b border-line px-3 py-2 font-semibold text-ink">
                    {renderInline(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rowIndex) => (
                <tr key={rowIndex} className="align-top">
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border-b border-line/70 px-3 py-2 leading-6 text-ink-2">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const sizes = {
        1: "text-2xl mt-8 mb-4",
        2: "text-xl mt-7 mb-3",
        3: "text-lg mt-6 mb-2",
        4: "text-base mt-5 mb-2",
      } as const;
      blocks.push(
        level === 1 ? (
          <h1 key={`h-${key++}`} className={`display font-semibold text-ink ${sizes[1]}`}>
            {renderInline(text)}
          </h1>
        ) : level === 2 ? (
          <h2 key={`h-${key++}`} className={`display font-semibold text-ink ${sizes[2]}`}>
            {renderInline(text)}
          </h2>
        ) : level === 3 ? (
          <h3 key={`h-${key++}`} className={`font-semibold text-ink ${sizes[3]}`}>
            {renderInline(text)}
          </h3>
        ) : (
          <h4 key={`h-${key++}`} className={`font-semibold text-ink ${sizes[4]}`}>
            {renderInline(text)}
          </h4>
        ),
      );
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      flushParagraph();
      flushList();
      blocks.push(<hr key={`hr-${key++}`} className="my-6 border-line" />);
      continue;
    }

    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push(
        <blockquote key={`q-${key++}`} className="my-4 border-l-2 border-accent/50 pl-4 text-[13.5px] leading-7 text-muted">
          {renderInline(trimmed.replace(/^>\s?/, ""))}
        </blockquote>,
      );
      continue;
    }

    const unordered = /^[-*]\s+(.*)$/.exec(trimmed);
    const ordered = /^\d+\.\s+(.*)$/.exec(trimmed);
    if (unordered || ordered) {
      flushParagraph();
      const isOrdered = Boolean(ordered);
      if (!list || list.ordered !== isOrdered) {
        flushList();
        list = { ordered: isOrdered, items: [] };
      }
      list.items.push((unordered ?? ordered)![1]);
      continue;
    }

    flushList();
    paragraph.push(trimmed);
  }

  flushParagraph();
  flushList();

  return <div className={className}>{blocks}</div>;
}
