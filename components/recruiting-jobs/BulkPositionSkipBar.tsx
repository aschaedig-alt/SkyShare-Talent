"use client";

import { useState, useTransition } from "react";
import { clsx } from "clsx";
import { CheckSquare, Undo2, X } from "lucide-react";
import {
  setCandidatePositionSkipBatch,
  undoCandidatePositionSkipBatch
} from "@/app/pilot-requirements/scoring-actions";
import {
  KEEP_ON_POSITION,
  POSITION_SKIP_LABELS,
  POSITION_SKIP_REASONS,
  type PositionDecisionValue,
  type PositionSkip
} from "@/lib/matching/position-skip";

/**
 * One decision, applied to everyone currently ticked.
 *
 * Screening a role is fifty cards deep and most of the calls are the same call.
 * The per-card dropdown in MatchCard stays exactly as it was for the one-off
 * judgements; this is the sweep — filter to "jet 0", select the lot, set them
 * aside as Not a fit with the note "no jet time", once.
 *
 * The note is the reason this bar carries a text field at all: the per-card
 * control never had one, so every set-aside until now recorded WHICH reason but
 * never WHY. On a sweep the why is the same sentence for everybody, which is
 * precisely when it is cheap enough to actually write down.
 *
 * No confirm dialog, on purpose. Removing clicks is the whole point, the people
 * affected stay on the page (set aside is a group, not a deletion), and the undo
 * below restores their exact prior decisions rather than merely clearing them.
 */
export function BulkPositionSkipBar({
  requirementId,
  candidateIds,
  onClear,
  onApplied
}: {
  requirementId: string;
  candidateIds: string[];
  onClear: () => void;
  /** Lets the panel move the affected cards without waiting for a refetch. */
  onApplied: (ids: string[], reason: PositionDecisionValue | null, note: string) => void;
}) {
  const [reason, setReason] = useState<PositionDecisionValue | "">("NOT_A_FIT");
  const [note, setNote] = useState("");
  const [pending, startApply] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // What the last apply overwrote, kept only long enough to offer the undo.
  const [undo, setUndo] = useState<{
    previous: Record<string, PositionSkip | null>;
    ids: string[];
    label: string;
  } | null>(null);

  const count = candidateIds.length;
  const decision: PositionDecisionValue | null = reason === "" ? null : reason;
  const verb =
    decision === null
      ? "Hand back to the engine"
      : decision === KEEP_ON_POSITION
        ? "Keep on this position"
        : `Set aside — ${POSITION_SKIP_LABELS[decision]}`;

  function apply() {
    setError(null);
    setUndo(null);
    const ids = [...candidateIds];
    startApply(async () => {
      const res = await setCandidatePositionSkipBatch({
        requirementId,
        candidateIds: ids,
        reason: decision,
        note: decision === null ? "" : note
      });
      if (!res.ok || !res.previous) {
        setError(res.error ?? "Could not apply that to the selection.");
        return;
      }
      setUndo({ previous: res.previous, ids, label: verb });
      onApplied(ids, decision, decision === null ? "" : note);
      onClear();
    });
  }

  function revert() {
    if (!undo) return;
    setError(null);
    const restoring = undo;
    startApply(async () => {
      const res = await undoCandidatePositionSkipBatch({
        requirementId,
        previous: restoring.previous
      });
      if (!res.ok) {
        setError(res.error ?? "Could not undo that.");
        return;
      }
      // Hand each id back its prior decision so the cards land where they were,
      // rather than all being cleared — some of them were already set aside for
      // a different reason before the sweep touched them.
      for (const id of restoring.ids) {
        const before = restoring.previous[id] ?? null;
        onApplied([id], before ? before.reason : null, before?.note ?? "");
      }
      setUndo(null);
    });
  }

  // Nothing ticked and nothing to undo — the bar has no reason to take up room.
  if (count === 0 && !undo) return null;

  return (
    <div className="mt-2 rounded border border-brand-lea/20 bg-brand-sweet/15 px-3 py-2 dark:border-white/15 dark:bg-white/10">
      {count > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand-lea dark:text-slate-100">
            <CheckSquare className="h-3.5 w-3.5 text-brand-gold" />
            {count} selected
          </span>

          <select
            value={reason}
            disabled={pending}
            onChange={(event) => setReason(event.target.value as PositionDecisionValue | "")}
            aria-label="What to do with the selected candidates"
            className="rounded-element border border-brand-lea/20 bg-white px-1.5 py-1 text-[11px] font-medium text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
          >
            {POSITION_SKIP_REASONS.map((entry) => (
              <option key={entry.key} value={entry.key}>
                Skip — {entry.label}
              </option>
            ))}
            <option value={KEEP_ON_POSITION}>Keep on this position</option>
            <option value="">Clear — back to the engine&apos;s call</option>
          </select>

          <input
            type="text"
            value={note}
            disabled={pending || decision === null}
            onChange={(event) => setNote(event.target.value.slice(0, 500))}
            placeholder={decision === null ? "No note — this clears the decision" : "Note, e.g. not a fit, no jet time"}
            aria-label="Note saved on every selected candidate"
            className="min-w-[16rem] flex-1 rounded-element border border-brand-lea/20 bg-white px-2 py-1 text-[11px] text-brand-lea outline-none transition placeholder:text-brand-grey/70 focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
          />

          <button
            type="button"
            onClick={apply}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-element bg-brand-lea px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-brand-eden hover:shadow-glow disabled:opacity-60"
          >
            {pending ? "Applying…" : `${verb} · ${count}`}
          </button>

          <button
            type="button"
            onClick={onClear}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-element border border-brand-lea/15 px-2 py-1 text-[11px] font-semibold text-brand-grey transition hover:border-brand-sweet hover:bg-brand-cloudDancer/60 disabled:opacity-60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        </div>
      ) : null}

      {undo ? (
        <div
          className={clsx(
            "flex flex-wrap items-center gap-2 text-[11px] text-brand-lea dark:text-slate-100",
            count > 0 && "mt-2 border-t border-brand-lea/10 pt-2 dark:border-white/10"
          )}
        >
          <span>
            <span className="font-semibold">{undo.ids.length}</span> updated — {undo.label}.
          </span>
          <button
            type="button"
            onClick={revert}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-element border border-brand-lea/20 bg-white px-2 py-1 text-[11px] font-semibold text-brand-eden transition hover:border-brand-gold hover:shadow-glow disabled:opacity-60 dark:border-white/15 dark:bg-brand-panel dark:text-slate-200"
          >
            <Undo2 className="h-3 w-3" /> Undo
          </button>
          <button
            type="button"
            onClick={() => setUndo(null)}
            disabled={pending}
            className="text-[11px] font-medium text-brand-grey underline-offset-2 transition hover:underline disabled:opacity-60 dark:text-slate-400"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? <p className="mt-1.5 text-[11px] text-value-customerFocus-dark">{error}</p> : null}
    </div>
  );
}
