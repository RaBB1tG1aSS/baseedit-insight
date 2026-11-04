import Link from "next/link";
import { NAV_ITEMS } from "@/lib/constants";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-bg-elevated">
      <div className="container-page py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent font-serif text-sm font-semibold text-white">
                B
              </span>
              <span className="display text-sm font-semibold text-ink">BaseEdit Insight</span>
            </div>
            <p className="mt-4 text-[13px] leading-7 text-muted">
              面向碱基编辑研究的文献核验、深度精讲与知识积累平台。所有功能共享同一个经过核验的中央文献数据库；
              每篇论文只核验和入库一次。
            </p>
            <p className="mt-4 text-[11px] leading-6 text-faint">
              数据来源：Europe PMC · PubMed · Crossref · OpenAlex · Semantic Scholar。
              全文与图表仅存储于开放获取（CC）许可范围内，并标注来源；受版权保护的全文不保存、不分发。
            </p>
          </div>

          <div>
            <div className="kicker mb-3">平台</div>
            <ul className="space-y-2 text-[13px] text-ink-2">
              {NAV_ITEMS.map((item) => (
                <li key={item.href}>
                  <Link href={item.href} className="hover:text-accent">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="kicker mb-3">管理</div>
            <ul className="space-y-2 text-[13px] text-ink-2">
              <li>
                <Link href="/candidates" className="hover:text-accent">
                  候选文献审核
                </Link>
              </li>
              <li>
                <Link href="/agent" className="hover:text-accent">
                  Agent 运行状态
                </Link>
              </li>
              <li>
                <Link href="/settings" className="hover:text-accent">
                  调度与数据源设置
                </Link>
              </li>
              <li>
                <Link href="/papers?favorite=1" className="hover:text-accent">
                  我的收藏
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-[11px] text-faint">
          <span>© {new Date().getFullYear()} BaseEdit Insight · 本地优先的科研知识库</span>
          <span>SQLite 持久化 · 单用户部署 · Asia/Singapore 调度</span>
        </div>
      </div>
    </footer>
  );
}
