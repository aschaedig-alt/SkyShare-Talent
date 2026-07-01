"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { Button, Textarea } from "@/components/ui";

type Note = {
  id: string;
  body: string;
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

export function CandidateNotes({ candidateId, initialNotes }: { candidateId: string; initialNotes: Note[] }) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const text = draft.trim();
    if (!text) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text })
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
    if (!window.confirm("Delete this note?")) return;
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
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            placeholder="Record a note about this candidate…"
          />
        </label>
        <Button onClick={add} disabled={busy || !draft.trim()}>
          <Send className="h-4 w-4" /> Add
        </Button>
      </div>
      {error ? <p className="mt-2 text-xs font-medium text-red-700">{error}</p> : null}

      {/* List */}
      <div className="mt-4 space-y-2">
        {notes.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-grey dark:text-slate-400">No notes yet. Add the first one above.</p>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="group rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm leading-6 text-brand-black/80 dark:text-slate-300">{note.body}</p>
                <button
                  type="button"
                  onClick={() => remove(note.id)}
                  disabled={busy}
                  aria-label="Delete note"
                  className="shrink-0 rounded p-1 text-brand-grey/0 transition group-hover:text-brand-grey hover:!text-red-600 dark:text-slate-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 text-xs text-brand-grey dark:text-slate-400">
                {note.author ?? note.source ?? "Unknown"} · {formatWhen(note.createdAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
