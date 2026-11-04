"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ClipboardCheck, Menu, Search, Settings, X } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";
import { ThemeToggle } from "./theme-toggle";
import { cx } from "./ui";

export function SiteHeader({ workerOnline }: { workerOnline: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/search?q=${encodeURIComponent(value)}` : "/search");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/85 backdrop-blur-xl">
      <div className="container-page">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/" className="group flex items-center gap-2.5" aria-label="BaseEdit Insight 首页">
            <span className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent font-serif text-[17px] font-semibold text-white shadow-sm">
              B
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border-2 border-bg bg-gold" />
            </span>
            <span className="leading-none">
              <span className="display block text-[15px] font-semibold tracking-tight text-ink">
                BaseEdit Insight
              </span>
              <span className="mt-1 block text-[10px] tracking-[0.14em] text-faint">
                碱基编辑文献研究平台
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "relative rounded-lg px-3 py-2 text-[13px] font-medium transition",
                  isActive(item.href) ? "text-ink" : "text-muted hover:bg-surface-2 hover:text-ink",
                )}
              >
                {item.label}
                {isActive(item.href) ? (
                  <span className="absolute inset-x-3 -bottom-[13px] h-[2px] rounded-full bg-accent" />
                ) : null}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <form onSubmit={submit} className="relative hidden md:block">
              <Search
                size={14}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint"
              />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索论文 / 概念 / 周报"
                aria-label="全局搜索"
                className="h-9 w-52 rounded-full border border-line bg-surface pl-8 pr-12 text-[12.5px] text-ink placeholder:text-faint focus:border-accent/50 focus:outline-none lg:w-60"
              />
              <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 text-[9px] text-faint">
                Ctrl K
              </kbd>
            </form>

            <div
              className="hidden items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1.5 text-[10.5px] text-muted sm:flex"
              title={workerOnline ? "后台 worker 在线，定时任务可执行" : "后台 worker 离线：请在终端运行 npm run worker"}
            >
              <span
                className={cx(
                  "h-1.5 w-1.5 rounded-full",
                  workerOnline ? "bg-success" : "bg-warn",
                )}
                style={workerOnline ? { animation: "pulse-dot 2.4s ease-in-out infinite" } : undefined}
              />
              {workerOnline ? "Worker 在线" : "Worker 离线"}
            </div>

            <Link
              href="/candidates"
              aria-label="候选文献审核"
              title="候选文献审核"
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-line-strong hover:text-ink lg:flex"
            >
              <ClipboardCheck size={15} />
            </Link>
            <Link
              href="/settings"
              aria-label="设置"
              title="设置与数据维护"
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted transition hover:border-line-strong hover:text-ink lg:flex"
            >
              <Settings size={15} />
            </Link>

            <ThemeToggle />

            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-label="展开导航"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-muted lg:hidden"
            >
              {open ? <X size={16} /> : <Menu size={16} />}
            </button>
          </div>
        </div>
      </div>

      {open ? (
        <div className="border-t border-line bg-surface lg:hidden">
          <div className="container-page space-y-1 py-4">
            <form onSubmit={submit} className="mb-3">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索论文 / 概念 / 周报"
                  className="h-10 w-full rounded-xl border border-line bg-bg pl-9 pr-3 text-sm focus:border-accent/50 focus:outline-none"
                />
              </div>
            </form>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cx(
                  "flex items-center justify-between rounded-lg px-3 py-2.5 text-sm",
                  isActive(item.href) ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-2",
                )}
              >
                <span>{item.label}</span>
                <span className="text-[10px] uppercase tracking-widest text-faint">{item.en}</span>
              </Link>
            ))}
            <Link
              href="/insights"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2"
            >
              <span>研究洞察</span>
              <span className="text-[10px] uppercase tracking-widest text-faint">Insights</span>
            </Link>
            <Link
              href="/compare"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2"
            >
              <span>论文对比</span>
              <span className="text-[10px] uppercase tracking-widest text-faint">Compare</span>
            </Link>
            <Link
              href="/search"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2"
            >
              <span>全局搜索</span>
              <span className="text-[10px] uppercase tracking-widest text-faint">Search</span>
            </Link>
            <Link
              href="/candidates"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2"
            >
              <span>候选审核</span>
              <span className="text-[10px] uppercase tracking-widest text-faint">Review</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm text-ink-2 hover:bg-surface-2"
            >
              <span>设置</span>
              <span className="text-[10px] uppercase tracking-widest text-faint">Settings</span>
            </Link>
          </div>
        </div>
      ) : null}
    </header>
  );
}
