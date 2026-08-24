"use client";

import { useState, type ReactNode } from "react";
import { clsx } from "clsx";
import { ChevronRight } from "lucide-react";

// The three collapsible detail sections at the top of /people/<id>: Identity &
// contact (open by default), Dates & training, and HR. Purely the shell — the
// fields themselves are built by NewHireDetailWorkspace, which owns the form
// state, so this file never has to know what a supervisor picker is.
//
// Sweet Blue at 20% over white is #edf4fa. It is written as the resolved colour
// rather than `bg-brand-sweet/20` on purpose: these sections sit on the page
// background (#eaf0f7), not on white, so an alpha tint would composite against
// the page and come out darker than the approved mock.

export type DetailSection = {
  id: string;
  title: string;
  /** Only the first section is open on arrival. */
  defaultOpen?: boolean;
  /** Fields that share a row, row by row. Which fields share a line is a decision. */
  rows: ReactNode[][];
  /** Shown as "n of m" in the header, and turns green once every field is filled. */
  filled: number;
  total: number;
};

// Static strings so Tailwind sees them. Row lengths in use are 2, 3 and 4.
const COLS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
};

export function HireDetailsAccordion({ sections }: { sections: DetailSection[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(sections.map((s) => [s.id, Boolean(s.defaultOpen)]))
  );

  return (
    <div className="space-y-2">
      {sections.map((section) => {
        const isOpen = open[section.id];
        const complete = section.total > 0 && section.filled === section.total;
        return (
          <section
            key={section.id}
            // The gold outline is the site-standard hover cue, but only the header
            // is the control — has-[] keeps it off while you are typing in the body.
            className={clsx(
              "rounded bg-[#edf4fa] ring-1 transition has-[[data-section-head]:hover]:shadow-glow dark:bg-brand-sweet/[0.06]",
              isOpen ? "ring-brand-lea/15 dark:ring-white/15" : "ring-brand-lea/10 dark:ring-white/10"
            )}
          >
            <button
              type="button"
              data-section-head
              aria-expanded={isOpen}
              aria-controls={`${section.id}-panel`}
              onClick={() => setOpen((o) => ({ ...o, [section.id]: !o[section.id] }))}
              className={clsx(
                "flex w-full items-center gap-2.5 rounded px-3.5 py-2.5 text-left",
                isOpen && "border-b border-brand-lea/10 dark:border-white/10"
              )}
            >
              <ChevronRight
                className={clsx(
                  "h-3.5 w-3.5 shrink-0 text-brand-eden transition-transform dark:text-brand-edenOnDark",
                  isOpen && "rotate-90"
                )}
              />
              <span className="min-w-0 flex-1 text-[0.95rem] font-semibold text-brand-lea dark:text-slate-100">
                {section.title}
              </span>
              <span
                className={clsx(
                  "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] transition",
                  complete
                    ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                    : "bg-brand-eden/10 text-brand-eden dark:bg-white/10 dark:text-brand-edenOnDark"
                )}
              >
                {section.filled} of {section.total}
              </span>
            </button>

            {/* 0fr -> 1fr collapses without needing a measured height. */}
            <div
              id={`${section.id}-panel`}
              className={clsx(
                "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              )}
            >
              <div className="overflow-hidden">
                <div className="space-y-3 p-3.5">
                  {section.rows.map((row, i) => (
                    <div key={i} className={clsx("grid gap-3", COLS[row.length] ?? COLS[4])}>
                      {row.map((cell, j) => (
                        <div key={j} className="min-w-0">
                          {cell}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
