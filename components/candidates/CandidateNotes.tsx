"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, Pencil } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import { RichTextEditor, RichTextView } from "@/components/richtext/RichTextEditor";

type Note = {
  id: string;
  body: string;
  /** Formatted version. Older notes have only `body`, so both render. */
  bodyHtml?: string | null;
  source: string | null;
  author: string | null;
  createdAt: string;
  updatedAt: string;
};

function formatWhen(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(
    new Date(value)
  );
}

export function CandidateNotes({
  candidateId,
  initialNotes,
  people = []
}: {
  candidateId: string;
  initialNotes: Note[];
  people?: Array<{ name: string; email: string }>;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  function isBlank(html: string) {
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;
  }

  function startEdit(note: Note) {
    setEditingId(note.id);
    setEditDraft(note.bodyHtml ?? note.body);
  }

  async function saveEdit(noteId: string) {
    if (isBlank(editDraft)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyHtml: editDraft })
      });
      if (res.ok) {
        const { note } = (await res.json()) as { note: Note };
        setNotes((cur) => cur.map((n) => (n.id === noteId ? note : n)));
        setEditingId(null);
        router.refresh();
      } else {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        setError(b.message ?? "Couldn't save the change.");
      }
    } finally {
      setBusy(false);
    }
  }

  // An empty editor still holds markup ("<br>", "<p></p>"), so emptiness is
  // judged on the text inside rather than on the HTML string.
  const draftIsEmpty = draft.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length === 0;

  async function add() {
    if (draftIsEmpty) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyHtml: draft })
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? "Couldn't add note.");
      }
      const { note } = (await res.json()) as { note: Note };
      setNotes((cur) => [note, ...cur]);
      setDraft("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't add note.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(noteId: string) {
    // Two-click confirm on the button itself (arm, then confirm) replaces a
    // native confirm() dialog, matching the pattern used elsewhere in the app.
    setBusy(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes/${noteId}`, { method: "DELETE" });
      if (res.ok) {
        setNotes((cur) => cur.filter((n) => n.id !== noteId));
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      {/* Composer */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="flex-1">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Add a note</span>
          <RichTextEditor
            value={draft}
            onChange={setDraft}
            people={people}
            placeholder="Record a note about this candidate. Paste keeps its formatting."
            minHeight={110}
          />
        </label>
        <Button onClick={add} disabled={busy || draftIsEmpty}>
          <Send className="h-4 w-4" /> Add
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{error}</p> : null}

      {/* List */}
      <div className="mt-4 space-y-2">
        {notes.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-grey dark:text-slate-400">No notes yet. Add the first one above.</p>
        ) : (
          notes.map((note) =>
            editingId === note.id ? (
              <div key={note.id} className="rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
                <RichTextEditor value={editDraft} onChange={setEditDraft} people={people} minHeight={100} />
                <div className="mt-2 flex items-center gap-2">
                  <Button onClick={() => saveEdit(note.id)} disabled={busy || isBlank(editDraft)}>Save</Button>
                  <button
                    onClick={() => setEditingId(null)}
                    disabled={busy}
                    className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div key={note.id} className="group rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-start justify-between gap-2">
                  {/* Formatted when we have it, plain text for older notes. */}
                  {note.bodyHtml ? (
                    <div className="min-w-0 flex-1">
                      <RichTextView html={note.bodyHtml} className="leading-6 text-brand-black/80 dark:text-slate-300" />
                    </div>
                  ) : (
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 text-brand-black/80 dark:text-slate-300">{note.body}</p>
                  )}
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => startEdit(note)}
                      aria-label="Edit note"
                      className="rounded p-1 text-brand-grey transition hover:bg-white hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => (confirmingDeleteId === note.id ? remove(note.id) : setConfirmingDeleteId(note.id))}
                      onBlur={() => setConfirmingDeleteId((cur) => (cur === note.id ? null : cur))}
                      disabled={busy}
                      aria-label={confirmingDeleteId === note.id ? "Confirm delete note" : "Delete note"}
                      className={clsx(
                        "rounded p-1 transition",
                        confirmingDeleteId === note.id
                          ? "bg-red-600 text-white"
                          : "text-brand-grey hover:bg-white hover:text-red-600 dark:text-slate-400 dark:hover:bg-white/10"
                      )}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </span>
                </div>
                <div className="mt-2 text-xs text-brand-grey dark:text-slate-400">
                  {note.author ?? note.source ?? "Unknown"} · {formatWhen(note.createdAt)}
                </div>
              </div>
            )
          )
        )}
      </div>
    </section>
  );
}
