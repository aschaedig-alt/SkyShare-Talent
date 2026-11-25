"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import { Download, Link2 } from "lucide-react";
import { R } from "@/components/reports/report-ui";
import { ReportShareButton } from "@/components/reports/ReportShareButton";
import { GLANCE_HREF, REPORT_GROUPS, reportAt, reportsFor } from "@/lib/reports/catalog";

// THE REPORTS LIBRARY SHELL - his pick of five redesigns, 2026-11-24.
//
// A list of every report, "At a glance" pinned first, one report at a time.
// Every entry is a real <Link>, so each report has a URL that can be sent to
// somebody and opened in a new tab (CLAUDE.md: anything that changes the whole
// screen is a real link).
//
// ON A DESKTOP THE LIST IS THE BLUE MENU since Nov 25 2026 (Aimee asked for it, his
// pick of menu layout 2): the Data group in lib/navigation/modules.ts is built from
// the same catalog, with the search box and HR badges, so there is one menu, not a
// second one inside the page. On a phone the list still folds into one menu at the
// top of the page, so the report you are on is named without opening the drawer.

function List({ isHr, query, onPick }: { isHr: boolean; query: string; onPick?: () => void }) {
  const pathname = usePathname();
  const q = query.trim().toLowerCase();
  const reports = reportsFor(isHr).filter((r) => !q || `${r.title} ${r.question} ${r.group}`.toLowerCase().includes(q));
  const item = (active: boolean) =>
    clsx(
      "block rounded px-3 py-2 text-sm font-semibold transition",
      active ? "bg-brand-lea text-white ring-1 ring-brand-gold" : "text-brand-lea hover:shadow-glow dark:text-slate-200"
    );

  return (
    <div className="mt-3 space-y-3">
      {!q ? (
        <Link href={GLANCE_HREF} onClick={onPick} className={item(pathname === GLANCE_HREF)} aria-current={pathname === GLANCE_HREF ? "page" : undefined}>
          At a glance
        </Link>
      ) : null}
      {REPORT_GROUPS.map((g) => {
        const inGroup = reports.filter((r) => r.group === g);
        if (!inGroup.length) return null;
        return (
          <div key={g}>
            <div className={clsx(R.sectionLabel, "px-3 pb-1")}>{g}</div>
            {inGroup.map((r) => {
              const active = reportAt(pathname)?.id === r.id;
              return (
                <Link key={r.id} href={r.href} onClick={onPick} className={item(active)} aria-current={active ? "page" : undefined}>
                  <span className="flex items-center justify-between gap-2">
                    {r.title}
                    {r.hrOnly ? <span className={clsx(R.chip, active && "border-white/30 text-white/80")}>HR</span> : null}
                  </span>
                </Link>
              );
            })}
          </div>
        );
      })}
      {q && !reports.length ? <p className={clsx(R.muted, "px-3 text-sm")}>No report matches &ldquo;{query}&rdquo;.</p> : null}
    </div>
  );
}

function Toolbar({ canShare, asOf }: { canShare: boolean; asOf: string }) {
  const pathname = usePathname();
  const here = reportAt(pathname);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
      <p className="hidden text-sm text-brand-grey lg:block dark:text-slate-400">
        {here ? (
          <>
            {here.group} <span aria-hidden>›</span> <span className={R.strong}>{here.title}</span>
          </>
        ) : (
          <span className={R.strong}>At a glance</span>
        )}
        <span className="ml-2">· as of {asOf}</span>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {canShare && here?.id === "progression" ? <ReportShareButton /> : null}
        <button type="button" onClick={copy} className={R.smallButton}>
          <Link2 className="h-3.5 w-3.5" /> {copied ? "Link copied" : "Copy link"}
        </button>
        <button type="button" onClick={() => window.print()} className={R.smallButton}>
          <Download className="h-3.5 w-3.5" /> Export PDF
        </button>
      </div>
    </div>
  );
}

export function ReportsLibrary({ isHr, canShare, asOf, children }: { isHr: boolean; canShare: boolean; asOf: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const here = reportAt(pathname);

  return (
    <div className="grid gap-4">

      {/* A phone: the same list, folded into one menu. */}
      <details
        open={menuOpen}
        onToggle={(e) => setMenuOpen((e.currentTarget as HTMLDetailsElement).open)}
        className={clsx(R.panel, "p-3 lg:hidden print:hidden")}
      >
        <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-3">
          <span>
            <span className={clsx(R.sectionLabel, "block")}>Reports · as of {asOf}</span>
            <span className={R.listTitle}>{here ? here.title : "At a glance"}</span>
          </span>
          <span className={R.smallButton}>{menuOpen ? "Close" : "All reports"}</span>
        </summary>
        <List isHr={isHr} query="" onPick={() => setMenuOpen(false)} />
      </details>

      <div className="min-w-0 space-y-4">
        <Toolbar canShare={canShare} asOf={asOf} />
        {children}
      </div>
    </div>
  );
}
