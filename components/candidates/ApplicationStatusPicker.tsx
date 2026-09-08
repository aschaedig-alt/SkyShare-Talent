"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { HOUSE_WORDINGS, WORDING_TO_STAGE } from "@/lib/candidates/disposition-vocabulary";

/**
 * Set an application's outcome, and its reason, from the candidate's own page.
 *
 * Asked for on 2026-09-08: "if i could mark the status from this view as hired,
 * rejected, saved for later it would be helpful", then refined the same evening:
 * "rejected should have a larger list. saved for later a small list. hired no list."
 *
 * So the reason list is SCOPED BY THE OUTCOME rather than being one flat list of
 * 26. That is the same rule as his earlier one about the candidates list — a hired
 * person needs no disposition, because "they took the job" is not a reason anybody
 * needs told.
 *
 * DERIVED FROM WORDING_TO_STAGE, not from a new list. That map already answers
 * "which stage does this wording imply", written when the vocabulary was tidied, and
 * it happens to divide exactly the way he described:
 *
 *   Hired            1 wording   -> no reason list at all
 *   Saved For Later  2 wordings  -> a small list
 *   Rejected        11 wordings  -> the larger one
 *
 * so nothing here decides which reasons belong to which outcome. Add a wording to
 * the map and it appears under its outcome with nothing else to change. Order comes
 * from HOUSE_WORDINGS, which is the order the vocabulary was written in rather than
 * alphabetical — also his ask, and the reason that list is no longer sorted.
 *
 * The OTHER outcomes are real and are not thrown away. An application can hold a
 * Withdrew, Offer, Knocked Out or New wording; those get no button, because he asked
 * for three, but the control still names the outcome and offers its siblings so it
 * can always represent what is actually stored.
 *
 * NO NEW ENDPOINT. PATCH /api/candidate-applications/[id] already does this and is
 * what the candidates list uses: it checks candidates:write, refuses a row whose
 * candidateId does not match, and logs the OLD wording, because this overwrites text
 * imported from Paycom with no other route back.
 */

/** The three he asked for, in his order. */
const OUTCOMES = ["Hired", "Rejected", "Saved For Later"] as const;

/** wording -> outcome, and the reverse, both straight off the shared map. */
function outcomeOf(wording: string): string | null {
  return WORDING_TO_STAGE[wording] ?? null;
}

/** The reasons that belong to one outcome, in the vocabulary's own order. The
 *  outcome's own name is not offered as a reason for itself — picking "Rejected"
 *  and then choosing "Rejected" says nothing. */
function reasonsFor(outcome: string): string[] {
  return HOUSE_WORDINGS.filter((w) => outcomeOf(w) === outcome && w !== outcome);
}

type Props = {
  applicationId: string;
  candidateId: string;
  /** Current stored wording, or null when nothing is recorded. */
  value: string | null;
  canEdit: boolean;
};

export function ApplicationStatusPicker({ applicationId, candidateId, value, canEdit }: Props) {
  const [current, setCurrent] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const outcome = current ? outcomeOf(current) : null;
  const reasons = outcome ? reasonsFor(outcome) : [];
  // A wording the map has never met — keep showing it rather than pretending the
  // row is empty.
  const unknown = Boolean(current) && outcome === null;

  if (!canEdit) {
    return current ? <span className="text-xs text-brand-grey dark:text-slate-400">{current}</span> : null;
  }

  async function save(next: string) {
    const previous = current;
    if (next === previous) return;
    setCurrent(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, statusText: next })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(data?.message ?? "Could not save that.");
      }
    } catch (e) {
      // Put it back. A control still showing a value the server rejected is worse
      // than one that fails visibly.
      setCurrent(previous);
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {OUTCOMES.map((o) => {
          const active = outcome === o;
          return (
            <button
              key={o}
              onClick={() => void save(o)}
              disabled={busy}
              aria-pressed={active}
              className={clsx(
                "rounded border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50",
                active
                  ? "border-brand-gold bg-brand-lea text-white dark:bg-brand-sweet dark:text-brand-lea"
                  : "border-brand-lea/20 text-brand-grey hover:border-brand-gold hover:text-brand-lea dark:border-white/10 dark:text-slate-400 dark:hover:text-slate-100"
              )}
            >
              {o}
            </button>
          );
        })}

        {/* An outcome outside his three — Withdrew, Offer, Knocked Out, New. Shown
            so the control never misrepresents the row, but not offered as a button. */}
        {outcome && !OUTCOMES.includes(outcome as (typeof OUTCOMES)[number]) ? (
          <span className="rounded border border-brand-lea/20 bg-brand-cloudDancer/60 px-2 py-1 text-[11px] font-semibold text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
            {outcome}
          </span>
        ) : null}

        {current ? (
          <button
            onClick={() => void save("")}
            disabled={busy}
            className="rounded px-1.5 py-1 text-[11px] font-semibold text-brand-grey underline decoration-dotted hover:text-red-700 disabled:opacity-50 dark:text-slate-400 dark:hover:text-red-300"
            title="Clear the status on this application"
          >
            Clear
          </button>
        ) : null}

        {busy ? <span className="text-[11px] text-brand-grey dark:text-slate-400">Saving&hellip;</span> : null}
      </div>

      {/* THE REASON, and only when the outcome has any. Hired has none by design. */}
      {reasons.length > 0 ? (
        <label className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] text-brand-grey dark:text-slate-400">
          <span>Reason</span>
          <select
            value={reasons.includes(current) ? current : ""}
            onChange={(e) => void save(e.target.value || outcome || "")}
            disabled={busy}
            className="rounded border border-brand-lea/15 bg-white px-1.5 py-1 text-[11px] text-brand-black disabled:opacity-50 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
          >
            <option value="">Not specified</option>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {unknown ? (
        <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
          Currently reads <span className="font-semibold text-brand-lea dark:text-slate-100">{current}</span>, which is
          not one of the house wordings. Pick an outcome above to replace it.
        </p>
      ) : null}

      {error ? <p className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-300">{error}</p> : null}
    </div>
  );
}
