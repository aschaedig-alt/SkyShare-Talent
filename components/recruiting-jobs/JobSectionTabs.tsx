"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";

// The section switcher on a job's page: Overview | Pilot requirement |
// Candidates | Screening | Source text.
//
// Same job as NewHireBottomTabs on /people/<id> — one pane at a time instead of
// a stack of panels — but the tabs here are real links rather than buttons, so a
// section has an address you can ctrl-click, bookmark or send to somebody.

export type JobSectionTab = {
  key: string;
  label: string;
  /** Count chip, e.g. the number of applicants. Always a real figure from the data. */
  chip?: string;
};

function resolve(tabs: JobSectionTab[], requested: string | null | undefined, fallback: string) {
  return requested && tabs.some((t) => t.key === requested) ? requested : fallback;
}

/**
 * Which section is open, and the one way to change it.
 *
 * Held in ?tab= so the address bar describes what is on screen, and read by the
 * SERVER for the first paint — a link straight to ?tab=candidates renders that
 * pane rather than flashing Overview first.
 *
 * The URL is written with history.pushState rather than a router navigation: the
 * job is already on the page and every pane is built from the detail the server
 * already sent, so a navigation would rebuild the whole jobs dataset (~1s) to
 * produce markup the browser is holding.
 *
 * `tabs` must be a stable reference (memoize it); the popstate listener is torn
 * down and rebuilt whenever it changes.
 */
export function useJobSection(tabs: JobSectionTab[], requested: string | undefined, basePath: string) {
  const fallback = tabs[0]?.key ?? "";
  const [active, setActive] = useState(() => resolve(tabs, requested, fallback));

  // Each section click pushes a history entry, so Back has to move between
  // sections before it leaves the job.
  useEffect(() => {
    const onPop = () => setActive(resolve(tabs, new URLSearchParams(window.location.search).get("tab"), fallback));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [tabs, fallback]);

  const select = useCallback(
    (key: string) => {
      setActive(key);
      window.history.pushState(null, "", `${basePath}?tab=${key}`);
    },
    [basePath]
  );

  return [active, select] as const;
}

export function JobSectionTabs({
  basePath,
  tabs,
  active,
  onSelect
}: {
  basePath: string;
  tabs: JobSectionTab[];
  active: string;
  onSelect: (key: string) => void;
}) {
  return (
    <nav className="flex flex-wrap gap-1.5" role="tablist" aria-label="Job sections">
      {tabs.map((t) => {
        const on = t.key === active;
        const href = `${basePath}?tab=${t.key}`;
        return (
          <Link
            key={t.key}
            role="tab"
            aria-selected={on}
            href={href}
            // The anchor carries the real href, so ctrl-click, middle-click and
            // "copy link address" behave the way they do anywhere else in the
            // app. A plain left click is handled here instead (see useJobSection
            // for why), which is also why prefetch is off — nothing on the other
            // side of that href is ever fetched.
            prefetch={false}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
              e.preventDefault();
              onSelect(t.key);
            }}
            className={clsx(
              "flex items-center gap-2 rounded border px-3.5 py-2 text-sm transition hover:shadow-glow",
              on
                ? "border-brand-lea bg-brand-lea font-semibold text-white shadow-[inset_0_-3px_0_theme(colors.brand.gold)]"
                : "border-brand-lea/10 bg-white text-brand-grey hover:text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
            )}
          >
            {t.label}
            {t.chip ? (
              <span
                className={clsx(
                  "rounded px-1.5 py-0.5 text-[11px] font-bold",
                  on ? "bg-brand-gold text-brand-lea" : "bg-brand-lea/10 text-brand-eden dark:bg-white/10 dark:text-brand-sweet"
                )}
              >
                {t.chip}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
