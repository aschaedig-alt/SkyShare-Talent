"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Records Paycom's requisition number (e.g. 3296) against a job.
 *
 * Paycom's "Offer Accepted" emails quote this number and the person's Paycom id,
 * and those are the only EXACT keys those emails give us — our own jobReqId holds
 * Jazz codes (AMA.1) which will never match one, and matching on names is what
 * created duplicate people in the first place. So this is the field the inbound
 * Paycom automation will match on. Nothing reads it yet; it is here so the number
 * can be captured now rather than back-filled across 107 jobs later.
 */
export function PaycomReqField({
  jobId,
  paycomReqId,
  canEdit
}: {
  jobId: string;
  paycomReqId: string | null;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(paycomReqId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiting-jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paycomReqId: value })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Could not save the requisition number.");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the requisition number.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
        Paycom req: <span className="font-semibold text-brand-lea dark:text-slate-200">{paycomReqId || "not set"}</span>
        {canEdit && (
          <button
            onClick={() => setEditing(true)}
            className="ml-1.5 rounded font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-brand-sweet"
          >
            {paycomReqId ? "change" : "add"}
          </button>
        )}
      </p>
    );
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      <span className="text-[11px] text-brand-grey dark:text-slate-400">Paycom req</span>
      <input
        value={value}
        inputMode="numeric"
        placeholder="e.g. 3296"
        onChange={(e) => setValue(e.target.value)}
        className="w-24 rounded border border-brand-lea/20 px-1.5 py-0.5 text-[11px] outline-none focus:border-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
      />
      <button
        onClick={() => void save()}
        disabled={busy}
        className="rounded bg-brand-lea px-2 py-0.5 text-[11px] font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save"}
      </button>
      <button
        onClick={() => {
          setValue(paycomReqId ?? "");
          setEditing(false);
          setError(null);
        }}
        disabled={busy}
        className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/40 disabled:opacity-50 dark:text-slate-400"
      >
        Cancel
      </button>
      {error && <span className="text-[11px] text-red-600 dark:text-red-300">{error}</span>}
    </div>
  );
}
