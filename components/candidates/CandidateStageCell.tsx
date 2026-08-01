"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { stageOptionsFor } from "@/lib/candidates/stages";

// Change a candidate's stage from the LIST, without opening their profile.
//
// Moving somebody along the pipeline is the most routine thing on this page and
// it used to cost a round trip into the profile, into edit mode, and back — so
// in practice stages went stale. This is a select that writes on change.
//
// It updates optimistically and PUTS THE OLD VALUE BACK if the save fails, so
// the row can never show a stage the database does not have. Everything here
// goes through the same PATCH /api/candidates/[id] the profile uses, which
// already enforces the candidates-edit permission — this control is only
// rendered for someone who has it, but the server is what decides.

export function CandidateStageCell({
  candidateId,
  candidateName,
  stage,
  pillClass,
  canEdit
}: {
  candidateId: string;
  candidateName: string;
  stage: string | null;
  /** The colour classes the read-only pill uses, so both look the same. */
  pillClass: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(stage ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) {
    return <span className={`inline-block rounded border px-2.5 py-1 text-xs font-semibold ${pillClass}`}>{stage ?? "No stage"}</span>;
  }

  async function change(next: string) {
    const previous = value;
    if (next === previous) return;
    setValue(next);
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Could not update the stage.");
      }
      // Refresh so the stat tiles and any stage filter agree with the row.
      router.refresh();
    } catch (e) {
      setValue(previous); // never leave the row claiming something that did not save
      setError(e instanceof Error ? e.message : "Could not update the stage.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-w-0">
      <select
        value={value}
        disabled={saving}
        onChange={(e) => void change(e.target.value)}
        aria-label={`Stage for ${candidateName}`}
        title={`Change ${candidateName}'s stage`}
        className={`w-full max-w-[170px] cursor-pointer rounded border px-2 py-1 text-xs font-semibold outline-none transition focus:ring-2 focus:ring-brand-gold/50 disabled:opacity-60 ${pillClass}`}
      >
        <option value="">No stage</option>
        {stageOptionsFor(stage).map((group) => (
          <optgroup key={group.group} label={group.group}>
            {group.values.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      {saving ? <div className="mt-1 text-[10px] text-brand-grey dark:text-slate-400">Saving…</div> : null}
      {error ? <div className="mt-1 text-[10px] font-medium text-red-600 dark:text-red-400">{error}</div> : null}
    </div>
  );
}
