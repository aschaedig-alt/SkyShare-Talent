"use client";

import { useState, useTransition } from "react";
import {
  KEEP_ON_POSITION,
  POSITION_SKIP_LABELS,
  POSITION_SKIP_REASONS,
  type PositionDecisionValue
} from "@/lib/matching/position-skip";
import { setCandidatePositionSkip } from "@/app/pilot-requirements/scoring-actions";
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
  Minus,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  ShieldCheck,
  type LucideIcon
} from "lucide-react";
import { submitMatchFeedback } from "@/app/pilot-requirements/scoring-actions";
import type {
  PilotRequirementCandidateMatch,
  FactorStatus,
  ReadinessLabel,
  ScoredFactor
} from "@/lib/matching/pilot-requirement-matches";
import { SCAN_EXCLUSION_REASONS, SCAN_EXCLUSION_LABELS, type ScanExclusionReason } from "@/lib/candidates/scan-exclusion";
import { ScoreSplit } from "@/components/pilot-requirements/ScoreSplit";
import type { MatchVerdict } from "@/lib/matching/match-feedback";

const FIT_TAGS: Array<{ value: MatchVerdict; label: string; Icon: LucideIcon; on: string }> = [
  { value: "up", label: "Good fit", Icon: ThumbsUp, on: "bg-value-teamwork-light text-value-teamwork-dark" },
  { value: "neutral", label: "Maybe", Icon: Minus, on: "bg-value-leadership-light text-value-leadership-dark" },
  { value: "down", label: "Not a fit", Icon: ThumbsDown, on: "bg-value-customerFocus-light text-value-customerFocus-dark" },
  { value: "under", label: "Underqualified", Icon: TrendingDown, on: "bg-brand-cloudDancer text-brand-eden dark:bg-white/5" },
  { value: "over", label: "Overqualified", Icon: TrendingUp, on: "bg-brand-sweet/40 text-brand-eden dark:bg-white/10 dark:text-slate-300" }
];

export const readinessStyles: Record<ReadinessLabel, string> = {
  "Strong signal": "bg-value-teamwork-light text-value-teamwork-dark",
  "Worth a look": "bg-value-leadership-light text-value-leadership-dark",
  "Needs review": "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
};

const READINESS_TIERS = Object.keys(readinessStyles) as ReadinessLabel[];

export function barClass(score: number | null): string {
  if (score === null) return "bg-brand-lea/10";
  if (score >= 70) return "bg-value-teamwork";
  if (score >= 40) return "bg-value-leadership";
  return "bg-value-customerFocus";
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatScanTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "just now";
  }
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
      return <CircleHelp className="h-3.5 w-3.5 text-brand-grey dark:text-slate-400" aria-hidden />;
  }
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
          <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{category}</div>
          <div className="space-y-1">
            {items.map((factor) => (
              <div key={factor.key} className="flex items-center gap-2 text-[11px]">
                <FactorIcon status={factor.status} />
                <span className="font-medium text-brand-lea dark:text-slate-100">{factor.label}</span>
                {factor.requirementStatus === "hard" ? (
                  <span className="rounded bg-brand-lea/8 px-1.5 text-[9px] font-bold uppercase tracking-wide text-brand-eden dark:bg-white/10 dark:text-[#8fb3d6]">
                    hard
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-brand-grey dark:text-slate-400">{factor.detail}</span>
                <span className="shrink-0 text-[10px] italic text-brand-grey/80 dark:text-slate-400">{factor.sourceLabel}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="flex items-center gap-1.5 pt-1 text-[10px] text-brand-grey dark:text-slate-400">
        <ShieldCheck className="h-3 w-3 text-value-teamwork-dark" /> Age, name, gender and location are never used in
        scoring.
      </p>
    </div>
  );
}

export function MatchCard({
  match,
  requirementId,
  canEdit,
  applied = false,
  onMoveTier,
  moving = false,
  onExclude,
  excluding = false,
  onSelectName,
  selected = false,
  onViewRoles
}: {
  match: PilotRequirementCandidateMatch;
  requirementId: string | null;
  canEdit: boolean;
  applied?: boolean;
  onMoveTier?: (tier: ReadinessLabel) => void;
  moving?: boolean;
  onExclude?: (reason: ScanExclusionReason | null, note: string) => void;
  excluding?: boolean;
  onSelectName?: (candidateId: string) => void;
  selected?: boolean;
  onViewRoles?: (candidateId: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [verdict, setVerdict] = useState<MatchVerdict | null>(match.feedback?.verdict ?? null);
  const [reason, setReason] = useState(match.feedback?.reason ?? "");
  const [notice, setNotice] = useState<string | null>(null);
  const [exReason, setExReason] = useState<ScanExclusionReason | "">(match.excludedReason ?? "");
  const [exNote, setExNote] = useState(match.excludedNote ?? "");
  const [skipReason, setSkipReason] = useState<PositionDecisionValue | "">(match.positionSkip?.reason ?? "");
  const [skipPending, startSkip] = useTransition();

  // Set aside on THIS position only — distinct from the scan-eligibility control
  // below, which bars the candidate from every position at once.
  function changePositionSkip(next: PositionDecisionValue | "") {
    if (!requirementId || !canEdit) return;
    setSkipReason(next);
    setNotice(null);
    startSkip(async () => {
      const res = await setCandidatePositionSkip({
        requirementId,
        candidateId: match.candidateId,
        reason: next === "" ? null : next
      });
      if (res.ok) {
        setNotice(
          next === ""
            ? "Back to the engine's call."
            : next === KEEP_ON_POSITION
              ? "Kept on this position."
              : "Set aside on this position."
        );
        router.refresh();
      } else {
        setNotice(res.error ?? "Could not save.");
      }
    });
  }

  function changeExclusion(next: ScanExclusionReason | "") {
    setExReason(next);
    onExclude?.(next === "" ? null : next, next === "" ? "" : exNote);
  }

  function setFeedback(next: MatchVerdict | null) {
    if (!requirementId || !canEdit) return;
    setNotice(null);
    const resolved = next === verdict ? null : next; // tap active thumb to clear
    setVerdict(resolved);
    startTransition(async () => {
      const res = await submitMatchFeedback({
        requirementId,
        candidateId: match.candidateId,
        verdict: resolved,
        reason: resolved ? reason : ""
      });
      if (res.ok) {
        setNotice(resolved ? "Saved — thanks." : "Cleared.");
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
    <article
      className={clsx(
        "rounded border bg-brand-cloudDancer/40 p-3 transition dark:bg-white/5",
        selected ? "border-brand-gold ring-1 ring-brand-gold/40" : "border-brand-lea/10 dark:border-white/10"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-sweet/30 text-xs font-semibold text-brand-lea dark:text-slate-100">
          {initials(match.candidateName)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                {onSelectName ? (
                  <button
                    type="button"
                    onClick={() => onSelectName(match.candidateId)}
                    className="text-left font-semibold text-brand-lea transition hover:text-brand-eden dark:text-slate-100"
                  >
                    {match.candidateName}
                  </button>
                ) : (
                  <Link href={`/candidates/${match.candidateId}`} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                    {match.candidateName}
                  </Link>
                )}
                {applied ? (
                  <span className="rounded bg-value-innovation-light px-1.5 py-0.5 text-[9px] font-bold uppercase text-value-innovation-dark">
                    applied
                  </span>
                ) : null}
                {match.fromArchive ? (
                  <span
                    className="rounded bg-brand-sweet/40 px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-eden dark:bg-white/10 dark:text-slate-300"
                    title="A historical record from the earlier applicant archive, not a live pipeline candidate"
                  >
                    archive
                  </span>
                ) : null}
                {match.excludedReason ? (
                  <span
                    className="rounded bg-brand-cloudDancer px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-grey dark:bg-white/5 dark:text-slate-400"
                    title={match.excludedNote ?? undefined}
                  >
                    Skipped · {SCAN_EXCLUSION_LABELS[match.excludedReason]}
                  </span>
                ) : null}
              </div>
              <div className="mt-0.5 truncate text-xs text-brand-grey dark:text-slate-400">
                {[match.currentTitle, match.stage].filter(Boolean).join(" · ") || "No title on file"}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <span className={clsx("rounded px-2.5 py-0.5 text-[11px] font-semibold", readinessStyles[match.readiness])}>
                {match.readiness}
              </span>
              {match.overridden ? (
                <div className="mt-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-value-leadership-dark dark:text-amber-300">
                  Moved by you
                </div>
              ) : match.minsTotal > 0 ? (
                <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">
                  {match.minsMet} of {match.minsTotal} mins met
                </div>
              ) : null}
              {onMoveTier && canEdit ? (
                <div className="mt-1.5 flex items-center justify-end gap-1">
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">Move to</span>
                  <select
                    value={match.readiness}
                    disabled={moving}
                    onChange={(event) => onMoveTier(event.target.value as ReadinessLabel)}
                    aria-label={`Move ${match.candidateName} to another group`}
                    className="rounded-element border border-brand-lea/20 bg-white px-1 py-0.5 text-[10px] font-medium text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                  >
                    {READINESS_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {tier}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>

          <div className="mt-2">
            <ScoreSplit qualified={match.qualified} bonus={match.bonus} gated={match.gated} unverified={match.unverified} size="sm" />
          </div>

          <p className="mt-2 text-xs leading-5 text-brand-black/75 dark:text-slate-300">{match.summary}</p>

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

          {match.setAsideReason ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-element bg-value-leadership-light px-2 py-1 text-[10px] font-semibold text-value-leadership-dark">
              <TrendingUp className="h-3 w-3 shrink-0" />
              <span className="min-w-0">
                Set aside on this position — {POSITION_SKIP_LABELS[match.setAsideReason]}
                {match.positionSkip
                  ? match.positionSkip.note
                    ? ` · ${match.positionSkip.note}`
                    : ""
                  : " · automatic: total time is 2×+ the minimum for this SIC seat"}
              </span>
              {requirementId && canEdit ? (
                <button
                  type="button"
                  onClick={() => changePositionSkip(KEEP_ON_POSITION)}
                  disabled={skipPending}
                  className="rounded-element bg-brand-lea px-2 py-0.5 text-[10px] font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60"
                >
                  Keep on this position
                </button>
              ) : null}
            </div>
          ) : match.overqualified && skipReason === KEEP_ON_POSITION ? (
            <div className="mt-2 inline-flex items-center gap-1 rounded-element bg-brand-cloudDancer px-2 py-1 text-[10px] font-semibold text-brand-grey dark:bg-white/5 dark:text-slate-400">
              <TrendingUp className="h-3 w-3" /> Overqualified for this seat — kept on the board by you
            </div>
          ) : null}

          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-3">
            {match.subScores.map((sub) => (
              <div key={sub.category}>
                <div className="flex items-center justify-between gap-1">
                  <span className="min-w-0 truncate text-[10px] font-medium text-brand-grey dark:text-slate-400">{sub.label}</span>
                  <span className="text-[10px] font-semibold text-brand-lea dark:text-slate-100">{sub.score === null ? "—" : sub.score}</span>
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

          {requirementId && canEdit ? (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-element border border-brand-lea/10 bg-brand-cloudDancer/30 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                This position only
              </span>
              <select
                value={skipReason}
                disabled={skipPending}
                onChange={(event) => changePositionSkip(event.target.value as PositionDecisionValue | "")}
                aria-label={`Skip ${match.candidateName} on this position`}
                className="rounded-element border border-brand-lea/20 bg-white px-1.5 py-0.5 text-[11px] font-medium text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              >
                <option value="">Engine&apos;s call</option>
                <option value={KEEP_ON_POSITION}>Keep on this position</option>
                {POSITION_SKIP_REASONS.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    Skip — {entry.label}
                  </option>
                ))}
              </select>
              <span className="text-[10px] text-brand-grey dark:text-slate-400">
                Stays in the system and on every other position
              </span>
            </div>
          ) : null}

          {onExclude && canEdit ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-element border border-brand-lea/10 bg-brand-cloudDancer/30 px-2.5 py-1.5 dark:border-white/10 dark:bg-white/5">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                Every position
              </span>
              <select
                value={exReason}
                disabled={excluding}
                onChange={(event) => changeExclusion(event.target.value as ScanExclusionReason | "")}
                aria-label={`Scan eligibility for ${match.candidateName}`}
                className="rounded-element border border-brand-lea/20 bg-white px-1.5 py-0.5 text-[11px] font-medium text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
              >
                <option value="">In the pool</option>
                {SCAN_EXCLUSION_REASONS.map((entry) => (
                  <option key={entry.key} value={entry.key}>
                    Skip — {entry.label}
                  </option>
                ))}
              </select>
              {exReason === "OTHER" ? (
                <input
                  value={exNote}
                  disabled={excluding}
                  onChange={(event) => setExNote(event.target.value)}
                  onBlur={() => onExclude("OTHER", exNote)}
                  placeholder="Reason note"
                  className="min-w-0 flex-1 rounded-element border border-brand-lea/20 px-2 py-0.5 text-[11px] outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                />
              ) : null}
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-slate-100"
            aria-expanded={open}
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {open ? "Hide breakdown" : "Why this score"}
          </button>

          {onViewRoles ? (
            <button
              type="button"
              onClick={() => onViewRoles(match.candidateId)}
              className="mt-3 ml-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-slate-100"
            >
              View roles <ArrowRight className="h-3.5 w-3.5" />
            </button>
          ) : null}

          {open ? (
            <div className="mt-3 space-y-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
              <FactorList factors={match.factors} />

              {canEdit && requirementId ? (
                <div className="mt-3 rounded-element bg-white/70 p-2.5 ring-1 ring-brand-lea/10 dark:bg-white/5 dark:ring-white/10">
                  <span className="text-[11px] font-medium text-brand-grey dark:text-slate-400">Tag the fit</span>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {FIT_TAGS.map((tag) => (
                      <button
                        key={tag.value}
                        type="button"
                        disabled={pending}
                        onClick={() => setFeedback(tag.value)}
                        aria-pressed={verdict === tag.value}
                        aria-label={tag.label}
                        className={clsx(
                          "inline-flex items-center gap-1 rounded-element px-2 py-1 text-[11px] font-semibold transition hover:shadow-glow",
                          verdict === tag.value ? tag.on : "text-brand-grey hover:bg-brand-cloudDancer dark:text-slate-400 dark:bg-white/5"
                        )}
                      >
                        <tag.Icon className="h-3.5 w-3.5" /> {tag.label}
                      </button>
                    ))}
                  </div>
                  {verdict ? (
                    <div className="mt-2 flex gap-2">
                      <input
                        value={reason}
                        onChange={(event) => setReason(event.target.value)}
                        onBlur={saveReason}
                        placeholder="Why? (helps the system learn) — e.g. 'great hours, wrong base'"
                        className="min-w-0 flex-1 rounded-element border-[0.5px] border-brand-lea/20 px-2 py-1 text-[11px] outline-none focus:border-brand-gold dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
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
                  {notice ? <p className="mt-1.5 text-[10px] text-brand-grey dark:text-slate-400">{notice}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
