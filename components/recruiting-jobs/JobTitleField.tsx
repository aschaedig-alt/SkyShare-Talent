"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";

/**
 * Rename a job.
 *
 * Asked for on 2026-09-08, in his words: "i need to be able to edit the existing
 * job names and it would fix this issue." The issue was real — job titles arrived
 * from imports and could not be touched, which is the whole reason the hired-
 * candidate backfill needed a worksheet: a NewHire position read "560XL Captain"
 * where the job was titled "Citation 560XL Captain", and 41 of 47 people matched
 * no job by title. Being able to fix the title fixes the cause instead of the
 * symptom.
 *
 * TWO THINGS THIS SURFACES THAT THE API DECIDES, not this component:
 *
 * A CLASH IS REFUSED, not resolved. Renaming onto a name another job already uses
 * would create the duplicate state the merge tooling exists to clear up, and would
 * hide a real job behind another one — so the server returns 409 and this shows
 * what it said. Same rule the tag rename follows.
 *
 * The 409 also carries the id of the job holding the name, and the refusal now
 * links to the two of them on the duplicates page. Telling somebody to merge and
 * giving them no way to do it was the actual complaint on 2026-09-09: the scan
 * would not show that pair, so the instruction was a dead end.
 *
 * A RENAME DOES NOT RE-CLASSIFY. isPilotRole, the seat and the aircraft list were
 * derived from the original title and may have been corrected by hand since, so
 * the server leaves them alone rather than overwriting somebody's correction. When
 * the new title implies something different it says so, and that warning is shown
 * here with a pointer to the classification control directly below — which is the
 * thing that actually changes them.
 */
export function JobTitleField({
  jobId,
  title,
  canEdit
}: {
  jobId: string;
  title: string;
  canEdit?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clashJobId, setClashJobId] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  function cancel() {
    setValue(title);
    setEditing(false);
    setError(null);
    setClashJobId(null);
  }

  async function save() {
    const next = value.trim();
    if (!next || next === title) {
      cancel();
      return;
    }
    setBusy(true);
    setError(null);
    setClashJobId(null);
    setWarning(null);
    try {
      const res = await fetch(`/api/recruiting-jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next })
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        clashJobId?: string;
        classificationLooksStale?: boolean;
        suggested?: { isPilotRole?: boolean; pilotSeat?: string | null };
      };
      if (!res.ok) {
        // A 409 is the clash. Keep the other job's id so the message can offer the
        // merge it tells you to do.
        if (data.clashJobId) setClashJobId(data.clashJobId);
        throw new Error(data.message ?? "Could not rename that job.");
      }
      if (data.classificationLooksStale) {
        const seat = data.suggested?.pilotSeat;
        setWarning(
          data.suggested?.isPilotRole
            ? `This title now reads as a pilot role${seat ? ` (${seat})` : ""}. The classification below was left as it was — change it there if it should follow.`
            : "This title no longer reads as a pilot role. The classification below was left as it was — change it there if it should follow."
        );
      }
      setEditing(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not rename that job.");
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div>
        <div className="flex items-start gap-2">
          <h2 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{title}</h2>
          {canEdit ? (
            <button
              onClick={() => {
                setValue(title);
                setEditing(true);
              }}
              aria-label={`Rename ${title}`}
              title="Rename this job"
              className="mt-1 shrink-0 rounded p-1 text-brand-grey transition hover:bg-brand-cloudDancer/70 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5 dark:hover:text-slate-100"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
        {warning ? (
          <p className="mt-1 rounded border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
            {warning}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") cancel();
          }}
          autoFocus
          disabled={busy}
          aria-label="Job title"
          className="min-w-0 flex-1 rounded border border-brand-lea/20 px-2 py-1 text-xl font-semibold text-brand-lea disabled:opacity-50 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
        />
        <button
          onClick={() => void save()}
          disabled={busy || !value.trim()}
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
        <div className="mt-1 rounded border border-red-300 bg-red-50 px-2 py-1.5 text-xs font-semibold text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
          <p>{error}</p>
          {clashJobId ? (
            <Link
              href={`/jobs/duplicates?pair=${jobId},${clashJobId}`}
              className="mt-1 inline-block rounded border border-red-300 bg-white px-2 py-1 font-semibold text-red-800 underline underline-offset-2 transition hover:bg-brand-gold/20 hover:text-brand-lea dark:border-red-500/40 dark:bg-white/5 dark:text-red-200 dark:hover:bg-brand-gold/20"
            >
              Merge these two jobs
            </Link>
          ) : null}
        </div>
      ) : null}
      <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
        Renames it everywhere at once. Candidates already linked keep their link.
      </p>
    </div>
  );
}
