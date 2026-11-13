"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { RichNoteField } from "@/components/richtext/RichNoteField";
import { CheckinScaleForm, type CheckinFormResult } from "@/components/people/CheckinScaleForm";
import { RATED_CHECKINS, answersFromView, ratedCheckin, type CheckinRatingView, type CheckinTickResult } from "@/lib/onboarding/checkin-rating";

// A check-in rating (90-day, 6-month or 12-month), entered by HR from the hiring
// manager's answers (Quality of Hire). The SAME form the manager gets on the no-login
// link (components/people/CheckinScaleForm.tsx): the four core values on the 1-10
// scale, how well they have learned the role, and "would you hire again?". Each
// score is also stored as its interview word, so the two can be compared.

export function CheckinRatingModal({
  open,
  name,
  newHireId,
  dayMark = 90,
  initial,
  onClose,
  onSaved,
  onSkip
}: {
  open: boolean;
  name: string;
  newHireId: string;
  /** Which check-in: 90 (the default), 180 or 365. */
  dayMark?: number;
  initial: CheckinRatingView | null;
  onClose: () => void;
  /** Saving also ticks that check-in done on the server; `tick` says what it did. */
  onSaved: (rating: CheckinRatingView, tick: CheckinTickResult) => void;
  /** Offered when the form opened from ticking the check-in done: tick it without a rating. */
  onSkip?: () => void;
}) {
  const checkin = ratedCheckin(dayMark) ?? RATED_CHECKINS[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // A rating saved before the 1-10 form has only interview words; it opens with the
  // scores blank so it is re-rated on the new scale rather than guessed into it.
  const legacy = Boolean(initial && !initial.scale);

  async function save(r: CheckinFormResult) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding/checkin-ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newHireId, dayMark: checkin.dayMark, answers: r.answers, managerName: r.managerName, notes: r.notes })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string; rating?: CheckinRatingView } & Partial<CheckinTickResult>;
      if (!res.ok || !data.rating) throw new Error(data.message || "Could not save the rating.");
      onSaved(data.rating, { checkinDone: Boolean(data.checkinDone), archived: Boolean(data.archived) });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the rating.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} busy={busy} maxWidth="max-w-xl" title={`${checkin.title} rating for ${name}`}>
      <div className="p-5 text-left">
        <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">{checkin.title}: {name}</h2>
        <p className="mb-3 mt-1 text-xs text-brand-grey dark:text-slate-400">
          Enter the hiring manager&apos;s answers. This is the same form the manager gets by email. Each score also counts as an interview word
          (1–3 Does Not Meet, 4–5 Can Develop, 6–7 Meets, 8–10 Exceeds), so it can be compared with the interview. Saving also marks the {checkin.short} check-in done.
        </p>
        {legacy ? (
          <p className="mb-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            This rating was saved before the 1–10 form, so the scores start blank. Saving replaces it.
          </p>
        ) : null}
        <CheckinScaleForm
          employeeName={name}
          at={checkin.at}
          initial={answersFromView(initial)}
          initialManagerName={initial?.managerName ?? ""}
          initialNotes={initial?.notes ?? ""}
          nameLabel="Hiring manager"
          namePlaceholder="Who gave these answers"
          renderNotes={(value, onChange) => (
            <RichNoteField
              label="Notes (optional)"
              labelClassName="text-xs font-semibold text-brand-lea dark:text-slate-100"
              value={value}
              onChange={onChange}
              minHeight={60}
            />
          )}
          busy={busy}
          error={error}
          submitLabel="Save and mark done"
          footerStart={
            <>
              {onSkip ? (
                <button type="button" onClick={onSkip} disabled={busy} className="mr-auto rounded px-3 py-2 text-xs font-semibold text-brand-grey transition hover:text-brand-lea disabled:opacity-50 dark:text-slate-400">
                  Mark done without a rating
                </button>
              ) : null}
              <button type="button" onClick={onClose} disabled={busy} className="rounded px-3 py-2 text-sm font-semibold text-brand-grey transition hover:text-brand-lea dark:text-slate-400">
                Cancel
              </button>
            </>
          }
          onSubmit={(r) => void save(r)}
        />
      </div>
    </Modal>
  );
}
