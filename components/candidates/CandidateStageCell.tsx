"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { stageOptionsFor, type CandidateStage } from "@/lib/candidates/stages";

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
  canEdit,
  stageList
}: {
  candidateId: string;
  candidateName: string;
  stage: string | null;
  /** The colour classes the read-only pill uses, so both look the same. */
  pillClass: string;
  canEdit: boolean;
  /** The live vocabulary, edited at /candidates/manage. */
  stageList?: CandidateStage[];
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
        /* Carries the value, because at this width the longest stage truncates
           and hover is then the only way to read it in full. */
        title={value ? `${value} — click to change` : `Set ${candidateName}'s stage`}
        /* A FIXED width, not w-full, and sized to the SECOND-longest label.
           Stretching to the cell made this the widest thing in the row for no
           reason. Measured at 11px in the page's own font: "Prescreen Complete"
           is 108px and every other stage is 83px or less, so that one label was
           charging all twelve rows 25px of width. It is on 8 candidates out of
           497 with a stage set, it ellipsizes rather than disappearing, the open
           dropdown shows it in full, and the title above carries it — so the
           trade is 8 rows hovering against every row being narrower.
           Fixed also means the box does not resize as the word changes, which is
           what makes a column of these scannable. If "Prescreen Complete" is
           ever renamed to something shorter this can go tighter again. */
        className={`w-[116px] max-w-full cursor-pointer truncate rounded border px-1.5 py-1 text-[11px] font-semibold outline-none transition focus:ring-2 focus:ring-brand-gold/50 disabled:opacity-60 ${pillClass}`}
      >
        <option value="">No stage</option>
        {stageOptionsFor(stage, stageList).map((group) => (
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
