"use client";

import { useEffect, useState } from "react";
import { cx } from "./ui";

export interface TocItem {
  id: string;
  label: string;
  level?: 1 | 2;
}

export function TableOfContents({ items }: { items: TocItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => Boolean(element));
    if (!elements.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]?.target.id) setActive(visible[0].target.id);
      },
      { rootMargin: "-96px 0px -65% 0px", threshold: [0, 1] },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label="文章目录" className="text-[12.5px]">
      <div className="kicker mb-3">目录</div>
      <ul className="space-y-0.5 border-l border-line">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className={cx(
                "-ml-px block border-l-2 py-1.5 transition",
                item.level === 2 ? "pl-5 text-[12px]" : "pl-3",
                active === item.id
                  ? "border-accent font-medium text-accent-ink"
                  : "border-transparent text-muted hover:border-line-strong hover:text-ink",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
