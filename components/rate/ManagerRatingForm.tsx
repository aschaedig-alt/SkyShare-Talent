"use client";

import { useState } from "react";
import { CheckinScaleForm, type CheckinFormResult } from "@/components/people/CheckinScaleForm";
import { RATED_CHECKINS, emptyAnswers, ratedCheckin } from "@/lib/onboarding/checkin-rating";

// The hiring manager's check-in rating (90-day, 6-month or 12-month) on the public no-login link (feedback
// cmwcq16o7). The form body is shared with HR's in-app dialog
// (components/people/CheckinScaleForm.tsx), so both store the same 1-10 answers.
// Submits once; the page then says thank you and the link stops accepting answers.

export function ManagerRatingForm({ token, dayMark, employeeName, managerName }: { token: string; dayMark: number; employeeName: string; managerName: string | null }) {
  const checkin = ratedCheckin(dayMark) ?? RATED_CHECKINS[0];
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(r: CheckinFormResult) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rate/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: r.answers, managerName: r.managerName, notes: r.notes })
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

  return (
    <div className="mt-5 rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 sm:p-5 dark:bg-brand-panel dark:ring-white/10">
      <p className="mb-3 text-sm text-brand-grey dark:text-slate-400">
        A few quick questions about {employeeName}&apos;s {checkin.period.replace(/^their /, "")}. The four values are the same ones they were rated on at interview. You can send this once.
      </p>
      <CheckinScaleForm
        employeeName={employeeName}
        at={checkin.at}
        initial={emptyAnswers()}
        initialManagerName={managerName ?? ""}
        initialNotes=""
        nameLabel="Your name"
        busy={busy}
        error={error}
        submitLabel="Send rating"
        onSubmit={(r) => void submit(r)}
      />
    </div>
  );
}
