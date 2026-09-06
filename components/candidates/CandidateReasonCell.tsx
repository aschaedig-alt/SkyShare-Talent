"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The disposition reason under a status, editable in place.
 *
 * This is the raw Paycom wording stored on CandidateApplication.status. It is
 * what dispositionGroup() reads to decide which reason group an application
 * falls into, so correcting the text here also corrects the grouping — which is
 * the reason it is editable at all rather than being a read-only import.
 *
 * Click to edit, Enter or blur to save, Escape to abandon. It updates
 * optimistically and PUTS THE OLD VALUE BACK if the save fails, so the row can
 * never show a reason the database does not have.
 *
 * Rendered read-only for anyone without candidates-edit; the server decides for
 * real, this only decides whether to offer the control.
 */
export function CandidateReasonCell({
  applicationId,
  candidateId,
  /** What to show when there is nothing stored — usually the grouped label. */
  placeholder,
  value,
  canEdit,
  className = ""
}: {
  applicationId: string;
  candidateId: string;
  placeholder: string;
  value: string | null;
  canEdit: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(value ?? "");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The row can be re-rendered with fresh server data under us (a router
  // refresh, a different page of results reusing this component). Without this
  // the cell would keep showing a stale local value.
  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  if (!canEdit) {
    return (
      <span className={className}>{text || placeholder}</span>
    );
  }

  async function commit() {
    const next = draft.trim();
    setEditing(false);
    if (next === text) return;

    const previous = text;
    setText(next); // optimistic
    setError(null);
    try {
      const res = await fetch(`/api/candidate-applications/${applicationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateId, statusText: next })
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message ?? "Could not save that reason.");
      }
      // The reason drives the grouping, and the grouping drives the segment
      // counts, so refresh rather than leaving the bar disagreeing with the row.
      router.refresh();
    } catch (e) {
      setText(previous);
      setDraft(previous);
      setError(e instanceof Error ? e.message : "Could not save that reason.");
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
          if (e.key === "Escape") {
            e.preventDefault();
            setDraft(text);
            setEditing(false);
          }
        }}
        maxLength={200}
        aria-label="Disposition reason"
        className="w-full rounded border border-brand-lea/20 bg-white px-1.5 py-0.5 text-xs text-brand-lea outline-none focus:border-transparent focus:shadow-[0_0_0_2px_rgba(234,170,0,0.5)] dark:border-white/20 dark:bg-brand-field dark:text-slate-100"
      />
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDraft(text);
          setEditing(true);
        }}
        title="Click to edit this reason"
        className={`w-full rounded px-1.5 py-0.5 text-left transition hover:bg-brand-gold/[0.12] ${
          text ? "" : "italic opacity-70"
        } ${className}`}
      >
        {text || placeholder}
      </button>
      {error && <span className="block px-1.5 text-[11px] text-brand-red dark:text-red-300">{error}</span>}
    </>
  );
}
