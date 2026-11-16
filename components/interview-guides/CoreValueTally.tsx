"use client";

import { Check, AlertTriangle } from "lucide-react";
import { COMPANY_VALUES } from "@/lib/compliments/constants";

// How many of the selected questions touch each of the four core values, so
// a guide can be checked for coverage while it is being built (his ask, Nov 16
// 2026). A question tagged with two values counts once for EACH of them, so the
// four numbers can add up to more than the number of questions — that is
// intended. A value with nothing selected is flagged.

export function CoreValueTally({
  questions,
  label = "Core values covered"
}: {
  questions: Array<{ coreValues: string[] }>;
  label?: string;
}) {
  const counts = COMPANY_VALUES.map((v) => ({
    key: v.colorKey,
    name: v.name,
    n: questions.filter((q) => q.coreValues.includes(v.colorKey)).length
  }));
  const missing = counts.filter((c) => c.n === 0);
  const none = questions.length === 0;

  return (
    <div className="rounded border border-brand-lea/10 bg-white p-3 dark:border-white/10 dark:bg-brand-panel">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-eden dark:text-brand-sweet">{label}</span>
        <span
          className={`inline-flex items-center gap-1 text-xs font-semibold ${
            none
              ? "text-brand-grey dark:text-slate-400"
              : missing.length === 0
                ? "text-emerald-700 dark:text-emerald-300"
                : "text-amber-700 dark:text-amber-300"
          }`}
        >
          {none ? (
            "No questions selected yet"
          ) : missing.length === 0 ? (
            <>
              <Check className="h-3.5 w-3.5" /> All four covered
            </>
          ) : (
            <>
              <AlertTriangle className="h-3.5 w-3.5" /> {missing.length} not covered
            </>
          )}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {counts.map((c) => {
          const gap = !none && c.n === 0;
          return (
            <div
              key={c.key}
              className={`flex items-center justify-between gap-2 rounded border px-3 py-2 ${
                // Covered: white with a gold edge (the site's selected accent).
                // Not covered: filled amber with a warning icon, so a gap reads
                // at a glance rather than as a slightly different yellow.
                gap
                  ? "border-amber-500 bg-amber-100 dark:border-amber-400/70 dark:bg-amber-500/20"
                  : c.n > 0
                    ? "border-brand-lea/15 border-l-4 border-l-brand-gold bg-white dark:border-white/10 dark:border-l-brand-gold dark:bg-transparent"
                    : "border-brand-lea/15 bg-white dark:border-white/10 dark:bg-transparent"
              }`}
            >
              <span className={`flex min-w-0 items-center gap-1 text-xs font-semibold leading-tight ${gap ? "text-amber-900 dark:text-amber-200" : "text-brand-lea dark:text-slate-100"}`}>
                {gap ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-label="Not covered" /> : null}
                {c.name}
              </span>
              <span className={`shrink-0 text-lg font-semibold leading-none ${gap ? "text-amber-700 dark:text-amber-300" : "text-brand-lea dark:text-slate-100"}`}>
                {c.n}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-brand-grey dark:text-slate-400">
        A question tagged with two values counts toward both, so these can add up to more than the number selected.
      </p>
    </div>
  );
}
