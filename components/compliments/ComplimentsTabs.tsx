"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";

const BASE_TABS = [
  { href: "/compliments", label: "Dashboard", exact: true },
  { href: "/compliments/celebrations", label: "Celebrations", exact: false },
  { href: "/compliments/give", label: "Give", exact: false },
  { href: "/compliments/feed", label: "Feed", exact: false },
  { href: "/compliments/rewards", label: "Rewards", exact: false },
  { href: "/compliments/analytics", label: "Insights", exact: false }
];

const ADMIN_TAB = { href: "/compliments/budget", label: "Budget", exact: false };

export function ComplimentsTabs({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const TABS = isAdmin ? [...BASE_TABS, ADMIN_TAB] : BASE_TABS;

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="border-b border-brand-lea/10 dark:border-white/10">
      <nav className="flex flex-wrap gap-6" aria-label="Compliments sections">
        {TABS.map((t) => {
          const active = isActive(t.href, t.exact);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={clsx(
                "border-b-2 px-1 py-3 text-sm font-semibold transition hover:shadow-glow",
                active
                  ? "border-brand-lea text-brand-lea dark:border-slate-100 dark:text-slate-100"
                  : "border-transparent text-brand-grey hover:text-brand-lea dark:text-slate-400 dark:hover:text-slate-100"
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
