"use client";

import { History, Check, ArrowRight } from "lucide-react";
import type { CandidateProfileData } from "@/lib/data/candidates";

type HistoricalMatchPanelProps = {
  match: NonNullable<CandidateProfileData["historicalMatch"]>;
  jazzCandidateNumber: string | null;
  onViewTimeline: () => void;
};

// Prominent banner surfaced on candidates that carry legacy (Jazz) history. The
// checklist only shows facts that are actually true for this person.
export function HistoricalMatchPanel({ match, jazzCandidateNumber, onViewTimeline }: HistoricalMatchPanelProps) {
  const facts: string[] = ["Previous candidate"];
  if (match.applicationCount > 0)
    facts.push(`Applied ${match.applicationCount} ${match.applicationCount === 1 ? "time" : "times"}`);
  if (match.interviewers.length > 0) facts.push(`Interviewed by ${match.interviewers.join(", ")}`);
  if (match.hasNotes) facts.push("Recruiter notes available");
  if (match.hired) facts.push("Previously hired");
  if (match.declinedOffer) facts.push("Previous offer declined");
  if (match.resumeArchived) facts.push("Resume archived");

  return (
    <section className="rounded border border-brand-gold/70 bg-brand-gold/10 p-4 dark:border-brand-gold/50 dark:bg-brand-gold/10">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-brand-gold" />
          <span className="text-sm font-semibold text-brand-lea dark:text-amber-100">Historical match found</span>
          {jazzCandidateNumber && (
            <span className="hidden rounded bg-brand-gold/20 px-2 py-0.5 text-[10px] font-semibold text-brand-eden dark:text-amber-200 sm:inline">
              Archived from JazzHR
            </span>
          )}
        </div>
        <button
          onClick={onViewTimeline}
          className="flex items-center gap-1 text-xs font-semibold text-brand-eden transition hover:text-brand-lea dark:text-amber-100"
        >
          View historical timeline <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact} className="flex items-center gap-2 text-xs text-brand-lea dark:text-amber-50">
            <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {fact}
          </div>
        ))}
      </div>
    </section>
  );
}
