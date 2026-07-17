"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

/**
 * Active vs inactive for a job. "Active" means OPEN (you are hiring for it);
 * "Inactive" means RETIRED. Active jobs sort to the top of the list, so this is
 * how you keep the roles you are actually working from getting buried under the
 * closed ones.
 */
export function JobActiveToggle({ jobId, status, canEdit }: { jobId: string; status: string; canEdit?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const active = status === "OPEN";

  async function set(next: "OPEN" | "RETIRED") {
    if (busy || next === status) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiting-jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Could not change the job status.");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the job status.");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    return (
      <span
        className={clsx(
          "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold",
          active
            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300"
            : "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
        )}
      >
        {active ? "Active" : "Inactive"}
      </span>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-1.5">
      {/* Segmented Active | Inactive, so the current state is visible and one tap flips it. */}
      <div className="inline-flex overflow-hidden rounded border border-brand-lea/20 dark:border-white/15">
        <button
          onClick={() => void set("OPEN")}
          disabled={busy}
          className={clsx(
            "px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50",
            active
              ? "bg-emerald-600 text-white"
              : "bg-white text-brand-grey hover:bg-brand-cloudDancer/40 dark:bg-brand-panel dark:text-slate-400"
          )}
        >
          Active
        </button>
        <button
          onClick={() => void set("RETIRED")}
          disabled={busy}
          className={clsx(
            "px-2.5 py-1 text-[11px] font-semibold transition disabled:opacity-50",
            !active
              ? "bg-brand-lea text-white dark:bg-white/15"
              : "bg-white text-brand-grey hover:bg-brand-cloudDancer/40 dark:bg-brand-panel dark:text-slate-400"
          )}
        >
          Inactive
        </button>
      </div>
      {error && <span className="text-[11px] text-red-600 dark:text-red-300">{error}</span>}
    </div>
  );
}
