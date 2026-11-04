import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { CompareDock } from "@/components/compare-controls";
import { getWorkerStatus } from "@/server/db/repo/dashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: {
    default: "BaseEdit Insight · 碱基编辑文献研究平台",
    template: "%s · BaseEdit Insight",
  },
  description:
    "专注于碱基编辑（base editing）的 AI 文献检索、核验、深度精读、知识图谱与技术时间线平台。",
};

const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('baseedit-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let workerOnline = false;
  try {
    workerOnline = getWorkerStatus().online;
  } catch {
    workerOnline = false;
  }

  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg text-ink antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
        >
          跳转到正文
        </a>
        <SiteHeader workerOnline={workerOnline} />
        <main id="content" className="min-h-[70vh]">
          {children}
        </main>
        <SiteFooter />
        <CompareDock />
      </body>
    </html>
  );
}
