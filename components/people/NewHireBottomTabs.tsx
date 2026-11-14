"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { clsx } from "clsx";

// The bottom half of /people/<id>: four tabs instead of a pile of panels.
// Checklist | Travel | Business cards | History.
//
// Layout only. Each tab's contents are the panels that already existed — this
// file does not restyle any of them.

export type BottomTab = {
  key: string;
  label: string;
  /** Small count/status chip on the tab, e.g. "2 left" or "1 trip". */
  chip?: string;
  /** Draws the chip in gold — something is outstanding. */
  chipWarn?: boolean;
  content: ReactNode;
};

export function NewHireBottomTabs({ tabs }: { tabs: BottomTab[] }) {
  const searchParams = useSearchParams();

  /**
   * ?tab= opens straight onto a tab, which is what makes this page linkable
   * from elsewhere — the travel hub sends people here with ?tab=travel rather
   * than loading a second copy of the profile at the bottom of its own page.
   *
   * Read once, as the INITIAL value, not on every render: somebody who lands on
   * ?tab=travel and then clicks Checklist must stay on Checklist. The candidate
   * profile already reads its tab this way; this matches it.
   *
   * An unknown or missing value falls back to the first tab. searchParams.get
   * returns a single string, so the string | string[] trap that crashed /login
   * does not apply here.
   */
  const [active, setActive] = useState(() => {
    const requested = searchParams.get("tab");
    return requested && tabs.some((t) => t.key === requested) ? requested : (tabs[0]?.key ?? "");
  });
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  // The browser's own #sections jump happens before this page has streamed in
  // past its loading skeleton, so it finds nothing and stays at the top —
  // measured Nov 3: scrollY 0 with the checklist 882px down. Do the jump
  // ourselves once the tabs exist, and only when the link asked for it.
  useEffect(() => {
    if (window.location.hash === "#sections") {
      document.getElementById("sections")?.scrollIntoView({ block: "start" });
    }
  }, []);

  return (
    // id="sections" is a link target: /people/<id>?tab=checklist#sections opens
    // the record on its Checklist AND scrolls down to it (the onboarding
    // calendar's Open checklist button, Nov 3). Without the jump, ?tab= alone
    // selects the tab but leaves you at the top of a long page.
    <div id="sections" className="scroll-mt-4 space-y-3">
      {/* Phones: an even two-by-two grid, not four chips wrapping raggedly
          (feedback cmwfo53k5). sm and up: one row. */}
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap" role="tablist" aria-label="New hire sections">
        {tabs.map((t) => {
          const on = t.key === current?.key;
          return (
            <button
              key={t.key}
              role="tab"
              type="button"
              aria-selected={on}
              onClick={() => setActive(t.key)}
              className={clsx(
                "flex min-w-0 items-center justify-between gap-2 rounded border px-3 py-2 text-sm transition hover:shadow-glow sm:justify-start sm:px-3.5",
                on
                  ? "border-brand-lea bg-brand-lea font-semibold text-white shadow-[inset_0_-3px_0_theme(colors.brand.gold)]"
                  : "border-brand-lea/10 bg-white text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
              )}
            >
              {t.label}
              {t.chip ? (
                <span
                  className={clsx(
                    "rounded px-1.5 py-0.5 text-[11px] font-bold",
                    t.chipWarn
                      ? "bg-brand-gold text-brand-lea"
                      : on
                        ? "bg-white/20 text-white"
                        : "bg-brand-lea/10 text-brand-eden dark:bg-white/10 dark:text-brand-edenOnDark"
                  )}
                >
                  {t.chip}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="tabpanel">{current?.content}</div>
    </div>
  );
}
