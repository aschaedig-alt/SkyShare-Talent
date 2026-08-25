"use client";

import { useState, type ReactNode } from "react";
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
  const [active, setActive] = useState(tabs[0]?.key ?? "");
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="New hire sections">
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
                "flex items-center gap-2 rounded border px-3.5 py-2 text-sm transition hover:shadow-glow",
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
