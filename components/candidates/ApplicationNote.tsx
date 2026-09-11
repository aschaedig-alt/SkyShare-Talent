"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { MessageSquarePlus } from "lucide-react";

/**
 * A free note about ONE application.
 *
 * Asked for on 2026-09-11, from the applications panel: "if I want to add a note
 * to someone I am giving a different status to, give me the option to put a note
 * in... in case there is something I need to explain."
 *
 * It sits beside the status controls because that is when it gets written — the
 * explanation for a status somebody else will read later and wonder about.
 *
 * COLLAPSED WHEN EMPTY, which is the other half of what she asked for ("maybe it
 * doesn't take up space"). An application with no note shows one small link; an
 * application WITH a note always shows it, because a note nobody can see is
 * worse than no note. So the space is only spent where there is something to read.
 *
 * DISTINCT FROM THE OTHER THREE TEXTS on this row, and deliberately so:
 *   - the disposition reason is Paycom's own wording, edited through the picker;
 *   - `disposition` is the coded outcome the bucket ladder reads;
 *   - a CandidateNote is about the PERSON, across every job they applied to.
 * This one is about this application, and it is the only one typed freely.
 */
export function ApplicationNote({
  applicationId,
  candidateId,
  value,
  canEdit
}: {
  applicationId: string;
  candidateId: string;
  value: string | null;
  canEdit: boolean;
}) {
  const [note, setNote] = useState(value ?? "");
  const [draft, setDraft] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const next = draft.trim();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidate-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, statusNote: next })
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? "Could not save that note.");
      }
      setNote(next);
      setEditing(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save that note.");
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit) {
    if (!note) return null;
    return (
      <p className="mt-1.5 border-t border-brand-lea/10 pt-1.5 text-[11px] leading-snug text-brand-grey dark:border-white/10 dark:text-slate-400">
        <span className="font-semibold">Note: </span>
        {note}
      </p>
    );
  }

  if (editing) {
    return (
      <div className="mt-1.5 border-t border-brand-lea/10 pt-1.5 dark:border-white/10">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          maxLength={500}
          autoFocus
          placeholder="Why this status, or anything worth explaining."
          aria-label="Note about this application"
          className="w-full rounded border border-brand-lea/20 bg-white px-2 py-1.5 text-[11.5px] leading-snug text-brand-lea outline-none transition focus:border-brand-gold focus:shadow-glow dark:border-white/15 dark:bg-brand-field dark:text-slate-100"
        />
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="rounded bg-brand-lea px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white transition hover:shadow-glow disabled:opacity-50 dark:bg-brand-eden"
          >
            {busy ? "Saving..." : "Save note"}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(note);
              setEditing(false);
              setError(null);
            }}
            disabled={busy}
            className="text-[10px] font-semibold uppercase tracking-wide text-brand-grey transition hover:text-brand-lea dark:text-slate-400 dark:hover:text-slate-100"
          >
            Cancel
          </button>
          <span className="ml-auto text-[10px] tabular-nums text-brand-grey/70 dark:text-slate-500">{draft.length}/500</span>
        </div>
        {error ? <p className="mt-1 text-[10.5px] font-medium text-red-700 dark:text-red-300">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={clsx("mt-1.5", note && "border-t border-brand-lea/10 pt-1.5 dark:border-white/10")}>
      {note ? (
        <p className="text-[11px] leading-snug text-brand-grey dark:text-slate-400">
          <span className="font-semibold">Note: </span>
          {note}{" "}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="font-semibold text-brand-eden underline underline-offset-2 transition hover:text-brand-lea dark:text-brand-sweet dark:hover:text-white"
          >
            edit
          </button>
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-brand-grey transition hover:text-brand-lea dark:text-slate-400 dark:hover:text-slate-100"
        >
          <MessageSquarePlus className="h-3 w-3" />
          Add a note
        </button>
      )}
    </div>
  );
}
