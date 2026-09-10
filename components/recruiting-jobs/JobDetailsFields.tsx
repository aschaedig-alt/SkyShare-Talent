"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

/**
 * Department and location on a job, editable in place.
 *
 * The create form ("+ New job") has always taken department, city and state. Once
 * the job existed there was no way to change any of them, so a location that came
 * in wrong from an import was permanent — and most of these rows came from an
 * import. Asked for on 2026-09-10, in his words: "we also need to be able to
 * manually add it or edit it."
 *
 * Same shape as JobTitleField deliberately: read-only line, pencil to edit, Save
 * and Cancel. The server handles these three on their own branch, because every
 * other path through that endpoint treats the call as a classification change.
 */
export function JobDetailsFields({
  jobId,
  department,
  city,
  state,
  canEdit
}: {
  jobId: string;
  department: string | null;
  city: string | null;
  state: string | null;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [dept, setDept] = useState(department ?? "");
  const [town, setTown] = useState(city ?? "");
  const [region, setRegion] = useState(state ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = [department, [city, state].filter(Boolean).join(", ")].filter(Boolean).join(" - ");

  function cancel() {
    setDept(department ?? "");
    setTown(city ?? "");
    setRegion(state ?? "");
    setError(null);
    setEditing(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/recruiting-jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ department: dept, city: town, state: region })
      });
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) throw new Error(data.message ?? "Could not save those details.");
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save those details.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-sm text-brand-grey dark:text-slate-400">
        <span>{label || "No department or location recorded"}</span>
        {canEdit ? (
          <button
            onClick={() => setEditing(true)}
            aria-label="Edit department and location"
            title="Edit department and location"
            className="shrink-0 rounded p-0.5 text-brand-grey transition hover:bg-brand-cloudDancer/70 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
          >
            <Pencil className="h-3 w-3" />
          </button>
        ) : null}
      </p>
    );
  }

  const input = (v: string, set: (s: string) => void, placeholder: string, aria: string, wide?: boolean) => (
    <input
      value={v}
      onChange={(e) => set(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") void save();
        if (e.key === "Escape") cancel();
      }}
      disabled={busy}
      placeholder={placeholder}
      aria-label={aria}
      className={`${wide ? "w-40" : "w-16"} rounded border border-brand-lea/20 px-2 py-1 text-sm text-brand-lea disabled:opacity-50 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100`}
    />
  );

  return (
    <div className="mt-1">
      <div className="flex flex-wrap items-center gap-2">
        {input(dept, setDept, "Department", "Department", true)}
        {input(town, setTown, "City", "City", true)}
        {input(region, setRegion, "State", "State")}
        <button
          onClick={() => void save()}
          disabled={busy}
          className="rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50 dark:bg-brand-sweet dark:text-brand-lea"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          onClick={cancel}
          disabled={busy}
          className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 disabled:opacity-50 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
        >
          Cancel
        </button>
      </div>
      {error ? (
        <p className="mt-1 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
        Leave a box empty to clear it. Location is shown on the job list and the candidate match.
      </p>
    </div>
  );
}
