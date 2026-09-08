"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { HOUSE_WORDINGS } from "@/lib/candidates/disposition-vocabulary";

/**
 * Set an application's status from the candidate's own "Applied to" list.
 *
 * Asked for directly on 2026-09-08: "if i could mark the status from this view
 * as hired, rejected, saved for later it would be helpful." Before this, the only
 * way to close an application out was the reason cell on the candidates LIST, or a
 * script — so somebody looking at the person in front of them had to go elsewhere
 * to record what had just happened.
 *
 * NO NEW ENDPOINT. PATCH /api/candidate-applications/[id] already does exactly
 * this and is what the list's reason cell uses: it checks the candidates:write
 * permission, refuses a row whose candidateId does not match, and logs the OLD
 * wording because this overwrites text imported from Paycom with no other route
 * back. This is the same call from a second place.
 *
 * THREE QUICK BUTTONS AND A FULL LIST, and the list is not padding. The three he
 * named cover almost every case, but an application already reads something like
 * "Does Not Meet Mins" — a control offering only three options could not represent
 * what is already stored, so it would show a value it could not put back. The
 * select carries the whole house vocabulary plus whatever this row currently holds,
 * even if that wording is not in the list.
 *
 * Optimistic, with the old value restored on failure. The stored wording is also
 * what decides the reason GROUP, so changing it here changes how this application
 * is counted on the segments — which is the point.
 */

const QUICK = ["Hired", "Rejected", "Saved For Later"] as const;

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
      // Put it back. A control that keeps showing a value the server rejected is
      // worse than one that fails visibly.
      setCurrent(previous);
      setError(e instanceof Error ? e.message : "Could not save that.");
    } finally {
      setBusy(false);
    }
  }

  // The stored wording is offered even when it is not a house wording, so the
  // select can always show what is actually on the row.
  const options = HOUSE_WORDINGS.includes(current) || !current ? HOUSE_WORDINGS : [current, ...HOUSE_WORDINGS];

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {QUICK.map((q) => (
          <button
            key={q}
            onClick={() => void save(q)}
            disabled={busy}
            aria-pressed={current === q}
            className={clsx(
              "rounded border px-2 py-1 text-[11px] font-semibold transition disabled:opacity-50",
              current === q
                ? "border-brand-gold bg-brand-lea text-white dark:bg-brand-sweet dark:text-brand-lea"
                : "border-brand-lea/20 text-brand-grey hover:border-brand-gold hover:text-brand-lea dark:border-white/10 dark:text-slate-400 dark:hover:text-slate-100"
            )}
          >
            {q}
          </button>
        ))}

        <label className="ml-1 flex items-center gap-1 text-[11px] text-brand-grey dark:text-slate-400">
          <span className="sr-only">Status for this application</span>
          <select
            value={current}
            onChange={(e) => void save(e.target.value)}
            disabled={busy}
            className="rounded border border-brand-lea/15 bg-white px-1.5 py-1 text-[11px] text-brand-black disabled:opacity-50 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
          >
            <option value="">No reason recorded</option>
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>

        {busy ? <span className="text-[11px] text-brand-grey dark:text-slate-400">Saving&hellip;</span> : null}
      </div>

      {error ? (
        <p className="mt-1 text-[11px] font-semibold text-red-700 dark:text-red-300">{error}</p>
      ) : null}
    </div>
  );
}
