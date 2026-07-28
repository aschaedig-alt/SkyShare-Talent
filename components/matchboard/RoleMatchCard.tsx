"use client";

import { clsx } from "clsx";
import { ArrowRight, AlertTriangle, TrendingUp, Plane } from "lucide-react";
import { readinessStyles, barClass } from "@/components/pilot-requirements/MatchCard";
import { ScoreSplit } from "@/components/pilot-requirements/ScoreSplit";
import type { RoleMatch } from "@/lib/matching/matchboard";
import type { MatchVerdict } from "@/lib/matching/match-feedback";

const VERDICT_LABEL: Record<MatchVerdict, string> = {
  up: "Tagged: good fit",
  neutral: "Tagged: maybe",
  down: "Tagged: not a fit",
  under: "Tagged: underqualified",
  over: "Tagged: overqualified"
};

function seatStyle(seat: string | null): { label: string; cls: string } {
  const s = (seat ?? "").toLowerCase();
  if (s === "pic") return { label: "PIC", cls: "bg-value-teamwork-light text-value-teamwork-dark" };
  if (s === "sic") return { label: "SIC", cls: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" };
  return { label: seat || "Support", cls: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400" };
}

export function RoleMatchCard({
  role,
  onViewCandidates
}: {
  role: RoleMatch;
  onViewCandidates: (requirementId: string) => void;
}) {
  const { match } = role;
  const seat = seatStyle(role.seat);

  return (
    <article className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-sweet/30 text-brand-lea dark:text-slate-100">
            <Plane className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="font-semibold text-brand-lea dark:text-slate-100">{role.title}</span>
              <span className={clsx("rounded px-2 py-0.5 text-[10px] font-bold uppercase", seat.cls)}>{seat.label}</span>
            </div>
            <div className="mt-0.5 truncate text-xs text-brand-grey dark:text-slate-400">
              {[role.aircraft[0], role.jobTitle].filter(Boolean).join(" · ") || "No linked job"}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <span className={clsx("rounded px-2.5 py-0.5 text-[11px] font-semibold", readinessStyles[match.readiness])}>
            {match.readiness}
          </span>
        </div>
      </div>

      <div className="mt-2.5">
        <ScoreSplit qualified={match.qualified} bonus={match.bonus} gated={match.gated} size="sm" />
      </div>

      <div className="mt-2 h-1.5 rounded-full bg-brand-lea/10">
        <div
          className={clsx("h-1.5 rounded-full", match.gated ? "bg-value-customerFocus" : barClass(match.qualified))}
          style={{ width: `${Math.max(4, match.qualified)}%` }}
        />
      </div>

      <p className="mt-2 text-xs leading-5 text-brand-black/75 dark:text-slate-300">{match.summary}</p>

      {match.overqualified ? (
        <div className="mt-2 inline-flex items-center gap-1 rounded-element bg-value-leadership-light px-2 py-1 text-[10px] font-semibold text-value-leadership-dark">
          <TrendingUp className="h-3 w-3" /> Overqualified for this SIC seat — likely wants PIC
        </div>
      ) : null}

      {match.hardGaps.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {match.hardGaps.map((gap) => (
            <span
              key={gap}
              className="inline-flex items-center gap-1 rounded bg-value-customerFocus-light px-2 py-0.5 text-[10px] font-semibold text-value-customerFocus-dark"
            >
              <AlertTriangle className="h-3 w-3" /> {gap}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-2">
        {match.feedback ? (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-eden">
            {VERDICT_LABEL[match.feedback.verdict]}
          </span>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => onViewCandidates(role.requirementId)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-slate-100"
        >
          View candidates <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </article>
  );
}
