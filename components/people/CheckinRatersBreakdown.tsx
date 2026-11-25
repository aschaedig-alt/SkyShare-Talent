"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CORE_VALUE_NAMES } from "@/lib/interviews/scorecard";
import { ROLE_PROGRESS_LABEL, type CheckinRaterRow } from "@/lib/onboarding/checkin-rating";
import { Score, SHORT } from "@/components/reports/CheckinReport";
import { formatMomentDateShort } from "@/lib/dates/display";

// "View both scores" (Aimee, Nov 25 2026, feedback cmwwiir1m): when two supervisors
// rated one check-in, the main numbers everywhere are their average, and this opens
// each supervisor's own answers underneath. Renders nothing for a one-person rating.
// Phone first: the same four-across score grid as the rating itself, no table.

export function CheckinRatersBreakdown({ raters, className }: { raters: CheckinRaterRow[]; className?: string }) {
  const [open, setOpen] = useState(false);
  if (raters.length < 2) return null;
  const splitHire = raters.some((r) => r.hireAgain === true) && raters.some((r) => r.hireAgain === false);
  return (
    <div className={clsx("mt-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="rounded border border-brand-lea/20 px-2 py-0.5 text-[11px] font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:text-slate-100"
      >
        {open ? "Hide" : "View"} both scores
      </button>
      <span className="ml-2 text-[11px] text-brand-grey dark:text-slate-400">
        Average of {raters.map((r) => r.name ?? "a supervisor").join(" and ")}
        {splitHire ? " · they split on hire again, so it counts as not again" : ""}
      </span>
      {open ? (
        <div className="mt-2 space-y-2">
          {raters.map((r, n) => (
            <div key={`${r.name ?? "rater"}-${n}`} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-2 dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">{r.name ?? "A supervisor"}</span>
                {r.at ? <span className="text-[11px] text-brand-grey dark:text-slate-400">{formatMomentDateShort(r.at)}</span> : null}
              </div>
              <div className="mt-1.5 grid grid-cols-4 gap-1.5">
                {CORE_VALUE_NAMES.map((v, i) => (
                  <div key={v} className="min-w-0">
                    <Score value={r.scores[i]} band={null} label={SHORT[i]} />
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px]">
                <span className={clsx("rounded border px-1.5 py-0.5 font-semibold", r.progress === "BEHIND" ? "border-red-600/60 text-red-700 dark:border-red-400/50 dark:text-red-300" : "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400")}>
                  Role: {r.progress ? ROLE_PROGRESS_LABEL[r.progress] : "—"}
                </span>
                <span className={clsx("rounded border px-1.5 py-0.5 font-semibold", r.hireAgain === false ? "border-red-600/60 text-red-700 dark:border-red-400/50 dark:text-red-300" : "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400")}>
                  {r.hireAgain === null ? "Hire again: —" : r.hireAgain ? "Would hire again" : "Would not hire again"}
                </span>
              </div>
              {r.note ? <p className="mt-1.5 whitespace-pre-line text-xs text-brand-grey dark:text-slate-400">{r.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
