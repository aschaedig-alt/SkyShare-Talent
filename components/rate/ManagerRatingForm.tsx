"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { RATINGS, CORE_VALUE_NAMES, type RatingKey } from "@/lib/interviews/scorecard";
import { VALUE_DESCRIPTIONS } from "@/lib/compliments/constants";

// The hiring manager's 90-day rating, on the public no-login link (feedback
// cmwcq16o7). The same four core values and the same rubric as the in-app form
// (components/people/CheckinRatingModal.tsx) and the interview scorecard, so the
// two can be compared. Submits once; the page then says thank you and the link
// stops accepting answers.

type Ratings = Partial<Record<string, RatingKey>>;

export function ManagerRatingForm({ token, employeeName, managerName }: { token: string; employeeName: string; managerName: string | null }) {
  const [ratings, setRatings] = useState<Ratings>({});
  const [again, setAgain] = useState<boolean | null>(null);
  const [name, setName] = useState(managerName ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const pick = (value: string, key: RatingKey) => setRatings((cur) => ({ ...cur, [value]: cur[value] === key ? undefined : key }));
  const rated = CORE_VALUE_NAMES.filter((v) => ratings[v]).length;
  const nothing = rated === 0 && again === null;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rate/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ratings, wouldHireAgain: again, managerName: name, notes })
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !data.ok) throw new Error(data.message || "Could not send your rating. Please try again.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send your rating. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 rounded bg-white p-6 text-center shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">Thank you!</h2>
        <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">Your rating for {employeeName} has gone to HR. You can close this page.</p>
      </div>
    );
  }

  const choice = (active: boolean) =>
    clsx(
      "rounded border px-3 py-1.5 text-xs font-semibold transition hover:shadow-glow",
      active ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 bg-white text-brand-grey hover:text-brand-lea dark:border-white/10 dark:bg-transparent dark:text-slate-400"
    );

  return (
    <div className="mt-5 rounded bg-white p-5 text-left shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-sm text-brand-grey dark:text-slate-400">
        How is {employeeName} doing on SkyShare&apos;s four core values after their first 90 days? Pick one for each. These are the same values
        they were rated on at interview.
      </p>

      <div className="mt-4 space-y-3">
        {CORE_VALUE_NAMES.map((value) => (
          <div key={value} className="rounded border border-brand-gold/30 p-3 dark:border-brand-gold/20">
            <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">{value}</div>
            {VALUE_DESCRIPTIONS[value] ? <p className="text-xs text-brand-grey dark:text-slate-400">{VALUE_DESCRIPTIONS[value]}</p> : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {RATINGS.map((r) => (
                <button key={r.key} type="button" onClick={() => pick(value, r.key)} aria-pressed={ratings[value] === r.key} className={choice(ratings[value] === r.key)}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4">
        <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">Would you hire {employeeName} again?</span>
        <div className="mt-2 flex gap-1.5">
          <button type="button" onClick={() => setAgain(again === true ? null : true)} aria-pressed={again === true} className={choice(again === true)}>
            Yes
          </button>
          <button type="button" onClick={() => setAgain(again === false ? null : false)} aria-pressed={again === false} className={choice(again === false)}>
            No
          </button>
        </div>
      </div>

      <label className="mt-4 grid gap-1 text-sm font-semibold text-brand-lea dark:text-slate-100">
        Anything else HR should know? (optional)
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={4000}
          className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
        />
      </label>

      <label className="mt-3 grid gap-1 text-sm font-semibold text-brand-lea dark:text-slate-100">
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-normal outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
        />
      </label>

      {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
      <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
        <span className="mr-auto text-xs text-brand-grey dark:text-slate-400">
          {rated} of {CORE_VALUE_NAMES.length} values rated · you can send this once
        </span>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy || nothing}
          className="rounded bg-brand-lea px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
        >
          {busy ? "Sending…" : "Send rating"}
        </button>
      </div>
    </div>
  );
}
