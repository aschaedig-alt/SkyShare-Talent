"use client";

import { clsx } from "clsx";
import { CORE_VALUE_NAMES } from "@/lib/interviews/scorecard";
import { RATED_CHECKINS, ROLE_PROGRESS_LABEL } from "@/lib/onboarding/checkin-rating";
import type { CheckinRow } from "@/lib/quality-of-hire/checkins";
import { Score, SHORT } from "@/components/reports/CheckinReport";
import { formatMomentDate } from "@/lib/dates/display";

// The profile's Check-ins tab (his call, Nov 17 2026: "Yes, on the profile"). One
// card per check-in - 3, 6 and 12 months - so a person's ratings stay visible after
// they leave Post-onboard. Admins only: the page loads the ratings for admins and
// does not render this tab for anyone else (managers' notes about the person).
// Read-only here; ratings are entered on Post-onboard or through the manager's link.

const STATUS_WORD: Record<string, string> = { TODO: "Not rated yet", NA: "Marked not needed", DONE: "Ticked done without a rating" };

export function CheckinRatingsPanel({ ratings, tasks }: { ratings: CheckinRow[]; tasks: { key: string; status: string }[] }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-brand-grey dark:text-slate-400">
        The hiring manager&apos;s 1 to 10 on each core value at 3, 6 and 12 months, how well they have learned the role, and whether they would hire them again. Ratings are
        entered on People &gt; Post-onboard or through the manager&apos;s emailed link. Visible to admins only.
      </p>
      {RATED_CHECKINS.map((c) => {
        const r = ratings.find((x) => x.dayMark === c.dayMark);
        const task = tasks.find((t) => t.key === c.taskKey);
        return (
          <div key={c.dayMark} className="rounded border border-brand-lea/10 bg-white p-3 dark:border-white/10 dark:bg-white/5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{c.title}</span>
              <span className="text-[11px] text-brand-grey dark:text-slate-400">
                {r ? [r.ratedBy ? `Rated by ${r.ratedBy}` : null, formatMomentDate(r.ratedOn)].filter(Boolean).join(" · ") : task ? (STATUS_WORD[task.status] ?? task.status) : "Not on this checklist"}
              </span>
            </div>
            {r ? (
              <>
                <div className="mt-2 grid grid-cols-4 gap-1.5">
                  {CORE_VALUE_NAMES.map((v, i) => (
                    <div key={v} className="min-w-0">
                      <span className="mb-0.5 hidden truncate text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey sm:block dark:text-slate-400">{SHORT[i]}</span>
                      <Score value={r.scores[i]} band={r.legacyBands?.[i] ?? null} label={SHORT[i]} />
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className={clsx("rounded border px-1.5 py-0.5 font-semibold", r.progress === "BEHIND" ? "border-red-600/60 text-red-700 dark:border-red-400/50 dark:text-red-300" : "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400")}>
                    Role: {r.progress ? ROLE_PROGRESS_LABEL[r.progress] : "—"}
                  </span>
                  <span className={clsx("rounded border px-1.5 py-0.5 font-semibold", r.hireAgain === false ? "border-red-600/60 text-red-700 dark:border-red-400/50 dark:text-red-300" : "border-brand-lea/15 text-brand-grey dark:border-white/10 dark:text-slate-400")}>
                    {r.hireAgain === null ? "Hire again: —" : r.hireAgain ? "Would hire again" : "Would not hire again"}
                  </span>
                  {r.followUp.length ? <span className="font-semibold text-red-700 dark:text-red-300">For HR to talk to: {r.followUp.join(", ")}</span> : null}
                </div>
                {r.note ? (
                  <p className="mt-2 whitespace-pre-line rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{r.note}</p>
                ) : null}
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
