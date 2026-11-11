"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { Modal } from "@/components/ui/Modal";
import { RATINGS, CORE_VALUE_NAMES, type RatingKey } from "@/lib/interviews/scorecard";
import { VALUE_DESCRIPTIONS } from "@/lib/compliments/constants";
import type { CheckinRatingView, CheckinRatings } from "@/lib/onboarding/checkin-rating";

// The 90-day check-in rating, entered by HR from the hiring manager's answers
// (Quality of Hire, Dec 10 2026). The four core values on the interview
// scorecard's own scale, so the two can be compared, plus "would you hire again?".

export function CheckinRatingModal({
  open,
  name,
  newHireId,
  initial,
  onClose,
  onSaved,
  onSkip
}: {
  open: boolean;
  name: string;
  newHireId: string;
  initial: CheckinRatingView | null;
  onClose: () => void;
  onSaved: (rating: CheckinRatingView) => void;
  /** Offered when the form opened from ticking "90-day" done: tick it without a rating. */
  onSkip?: () => void;
}) {
  const [ratings, setRatings] = useState<CheckinRatings>(initial?.ratings ?? {});
  const [again, setAgain] = useState<boolean | null>(initial?.wouldHireAgain ?? null);
  const [manager, setManager] = useState(initial?.managerName ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = (value: string, key: RatingKey) => setRatings((cur) => ({ ...cur, [value]: cur[value] === key ? undefined : key }));
  const nothing = !Object.values(ratings).some(Boolean) && again === null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/checkin-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newHireId, ratings, wouldHireAgain: again, managerName: manager, notes })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; rating?: CheckinRatingView };
      if (!res.ok || !data.rating) throw new Error(data.message || "Could not save the rating.");
      onSaved(data.rating);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the rating.");
    } finally {
      setBusy(false);
    }
  }

  const choice = (active: boolean) =>
    clsx(
      "rounded border px-2.5 py-0.5 text-[11px] font-semibold transition hover:shadow-glow",
      active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
    );

  return (
    <Modal open={open} onClose={onClose} busy={busy} maxWidth="max-w-lg" title={`90-day check-in rating for ${name}`}>
      <div className="p-5 text-left">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">90-day check-in: {name}</h2>
        <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
          Enter the hiring manager&apos;s answers. The same four values are rated at the interview, so this shows how well the interview predicted.
        </p>

        <label className="mt-3 grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Hiring manager
          <input
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            placeholder="Who gave these answers"
            className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
          />
        </label>

        <div className="mt-3 space-y-2">
          {CORE_VALUE_NAMES.map((value) => (
            <div key={value} className="rounded border border-brand-gold/30 p-2.5 dark:border-brand-gold/20">
              <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{value}</div>
              {VALUE_DESCRIPTIONS[value] ? <p className="text-[11px] text-brand-grey dark:text-slate-400">{VALUE_DESCRIPTIONS[value]}</p> : null}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {RATINGS.map((r) => (
                  <button key={r.key} type="button" onClick={() => pick(value, r.key)} className={choice(ratings[value] === r.key)}>
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3">
          <span className="text-xs font-semibold text-brand-lea dark:text-slate-100">Would you hire this person again?</span>
          <div className="mt-1.5 flex gap-1.5">
            <button type="button" onClick={() => setAgain(again === true ? null : true)} className={choice(again === true)}>
              Yes
            </button>
            <button type="button" onClick={() => setAgain(again === false ? null : false)} className={choice(again === false)}>
              No
            </button>
          </div>
        </div>

        <label className="mt-3 grid gap-1 text-xs font-semibold text-brand-lea dark:text-slate-100">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
          />
        </label>

        {error ? <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          {onSkip ? (
            <button type="button" onClick={onSkip} disabled={busy} className="mr-auto rounded px-3 py-2 text-xs font-semibold text-brand-grey transition hover:text-brand-lea disabled:opacity-50 dark:text-slate-400">
              Mark done without a rating
            </button>
          ) : null}
          <button type="button" onClick={onClose} disabled={busy} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy || nothing}
            className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
          >
            {busy ? "Saving…" : onSkip ? "Save and mark done" : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
