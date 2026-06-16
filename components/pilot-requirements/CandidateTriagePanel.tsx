"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  MinusCircle,
  AlertTriangle,
  ThumbsDown,
  ThumbsUp,
  SlidersHorizontal,
  ShieldCheck
} from "lucide-react";
import { submitMatchFeedback } from "@/app/pilot-requirements/scoring-actions";
import type {
  PilotRequirementCandidateMatch,
  FactorStatus,
  ReadinessLabel,
  ScoredFactor
} from "@/lib/matching/pilot-requirement-matches";

type Props = {
  matches: PilotRequirementCandidateMatch[];
  requirementId: string | null;
  canEdit: boolean;
};

const readinessStyles: Record<ReadinessLabel, string> = {
  "Strong signal": "bg-value-teamwork-light text-value-teamwork-dark",
  "Worth a look": "bg-value-leadership-light text-value-leadership-dark",
  "Needs review": "bg-brand-cloudDancer text-brand-grey"
};

function barClass(score: number | null): string {
  if (score === null) return "bg-brand-lea/10";
  if (score >= 70) return "bg-value-teamwork";
  if (score >= 40) return "bg-value-leadership";
  return "bg-value-customerFocus";
}

function FactorIcon({ status }: { status: FactorStatus }) {
  switch (status) {
    case "met":
      return <Check className="h-3.5 w-3.5 text-value-teamwork-dark" aria-hidden />;
    case "near":
      return <MinusCircle className="h-3.5 w-3.5 text-value-leadership-dark" aria-hidden />;
    case "missing":
      return <AlertTriangle className="h-3.5 w-3.5 text-value-customerFocus-dark" aria-hidden />;
    default:
      return <CircleHelp className="h-3.5 w-3.5 text-brand-grey" aria-hidden />;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function CandidateTriagePanel({ matches, requirementId, canEdit }: Props) {
  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Candidate fit</p>
          <h3 className="text-base font-semibold text-brand-lea">Who to screen first</h3>
          <p className="mt-1 text-xs text-brand-grey">
            Decision support — not a ranking, no one is filtered out. Scores never use age, name, gender or location.
          </p>
        </div>
        <Link
          href="/pilot-requirements/scoring"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-element border border-brand-lea/15 px-2.5 py-1.5 text-xs font-semibold text-brand-eden transition hover:border-brand-sweet hover:bg-brand-cloudDancer/60"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Scoring setup
        </Link>
      </div>

      {matches.length > 0 ? (
        <div className="mt-4 space-y-3">
          {matches.map((match) => (
            <MatchCard key={match.candidateId} match={match} requirementId={requirementId} canEdit={canEdit} />
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-4 text-sm text-brand-grey">
          No candidate evidence is strong enough yet. Add resume text, notes, tags, or structured candidate hours to
          improve matching.
        </div>
      )}
    </section>
  );
}

function MatchCard({
  match,
  requirementId,
  canEdit
}: {
  match: PilotRequirementCandidateMatch;
  requirementId: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [verdict, setVerdict] = useState<"up" | "down" | null>(match.feedback?.verdict ?? null);
  const [reason, setReason] = useState(match.feedback?.reason ?? "");
  const [notice, setNotice] = useState<string | null>(null);

  function setFeedback(next: "up" | "down" | null) {
    if (!requirementId || !canEdit) return;
    setNotice(null);
    const applied = next === verdict ? null : next; // tap active thumb to clear
    setVerdict(applied);
    startTransition(async () => {
      const res = await submitMatchFeedback({
        requirementId,
        candidateId: match.candidateId,
        verdict: applied,
        reason: applied ? reason : ""
      });
      if (res.ok) {
        setNotice(applied ? "Saved — thanks." : "Cleared.");
        router.refresh();
      } else {
        setNotice(res.error ?? "Could not save.");
      }
    });
  }

  function saveReason() {
    if (!requirementId || !canEdit || !verdict) return;
    setNotice(null);
    startTransition(async () => {
      const res = await submitMatchFeedback({ requirementId, candidateId: match.candidateId, verdict, reason });
      setNotice(res.ok ? "Saved — thanks." : res.error ?? "Could not save.");
      if (res.ok) router.refresh();
    });
  }

  return (
    <article className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-sweet/30 text-xs font-semibold text-brand-lea">
          {initials(match.candidateName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link href={`/candidates/${match.candidateId}`} className="font-semibold text-brand-lea hover:text-brand-eden">
                {match.candidateName}
              </Link>
              <div className="mt-0.5 truncate text-xs text-brand-grey">
                {[match.currentTitle, match.stage].filter(Boolean).join(" · ") || "No title on file"}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className={clsx("rounded-full px-2.5 py-0.5 text-[11px] font-semibold", readinessStyles[match.readiness])}>
                {match.readiness}
              </span>
              {match.minsTotal > 0 ? (
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-grey">
                  {match.minsMet} of {match.minsTotal} mins met
                </div>
              ) : null}
            </div>
          </div>

          <p className="mt-2 text-xs leading-5 text-brand-black/75">{match.summary}</p>

          {match.hardGaps.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {match.hardGaps.map((gap) => (
                <span
                  key={gap}
                  className="inline-flex items-center gap-1 rounded-full bg-value-customerFocus-light px-2 py-0.5 text-[10px] font-semibold text-value-customerFocus-dark"
                >
                  <AlertTriangle className="h-3 w-3" /> {gap}
                </span>
              ))}
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {match.subScores.map((sub) => (
              <div key={sub.category}>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] font-medium text-brand-grey">{sub.label}</span>
                  <span className="text-[10px] font-semibold text-brand-lea">{sub.score === null ? "—" : sub.score}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-brand-lea/10">
                  <div
                    className={clsx("h-1.5 rounded-full", barClass(sub.score))}
                    style={{ width: `${sub.score === null ? 0 : Math.max(4, sub.score)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea"
            aria-expanded={open}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? "Hide breakdown" : "Why this score"}
          </button>

          {open ? (
            <div className="mt-3 space-y-2 border-t border-brand-lea/10 pt-3">
              <FactorList factors={match.factors} />

              {canEdit && requirementId ? (
                <div className="mt-3 rounded-element bg-white/70 p-2.5 ring-1 ring-brand-lea/10">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-medium text-brand-grey">Was this a useful read?</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setFeedback("up")}
                        aria-pressed={verdict === "up"}
                        aria-label="Good fit"
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-element px-2 py-1 text-[11px] font-semibold transition",
                          verdict === "up"
                            ? "bg-value-teamwork-light text-value-teamwork-dark"
                            : "text-brand-grey hover:bg-brand-cloudDancer"
                        )}
                      >
                        <ThumbsUp className="h-3.5 w-3.5" /> Good fit
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setFeedback("down")}
                        aria-pressed={verdict === "down"}
                        aria-label="Off base"
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-element px-2 py-1 text-[11px] font-semibold transition",
                          verdict === "down"
                            ? "bg-value-customerFocus-light text-value-customerFocus-dark"
                            : "text-brand-grey hover:bg-brand-cloudDancer"
                        )}
                      >
                        <ThumbsDown className="h-3.5 w-3.5" /> Off base
                      </button>
                    </div>
                  </div>
                  {verdict ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        onBlur={saveReason}
                        placeholder="Why? (helps the system learn) — e.g. 'great hours, wrong base'"
                        className="min-w-0 flex-1 rounded-element border-[0.5px] border-brand-lea/20 px-2 py-1 text-[11px] outline-none focus:border-brand-gold"
                      />
                      <button
                        type="button"
                        onClick={saveReason}
                        disabled={pending}
                        className="rounded-element bg-brand-lea px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
                      >
                        Save
                      </button>
                    </div>
                  ) : null}
                  {notice ? <p className="mt-1.5 text-[10px] text-brand-grey">{notice}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function FactorList({ factors }: { factors: ScoredFactor[] }) {
  const grouped = factors.reduce<Record<string, ScoredFactor[]>>((acc, factor) => {
    (acc[factor.categoryLabel] ??= []).push(factor);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([category, items]) => (
        <div key={category}>
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey">{category}</div>
          <div className="space-y-1">
            {items.map((factor) => (
              <div key={factor.key} className="flex items-center gap-2 text-[11px]">
                <FactorIcon status={factor.status} />
                <span className="font-medium text-brand-lea">{factor.label}</span>
                {factor.requirementStatus === "hard" ? (
                  <span className="rounded-full bg-brand-lea/8 px-1.5 text-[9px] font-bold uppercase tracking-wide text-brand-eden">
                    hard
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-brand-grey">{factor.detail}</span>
                <span className="shrink-0 text-[10px] italic text-brand-grey/80">{factor.sourceLabel}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="flex items-center gap-1.5 pt-1 text-[10px] text-brand-grey">
        <ShieldCheck className="h-3 w-3 text-value-teamwork-dark" /> Age, name, gender and location are never used in
        scoring.
      </p>
    </div>
  );
}
