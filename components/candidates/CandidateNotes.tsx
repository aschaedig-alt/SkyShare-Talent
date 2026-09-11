"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2, Pencil, Lock } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import { RichTextEditor, RichTextView } from "@/components/richtext/RichTextEditor";
import { noteAttribution, noteBodyWithoutSignature } from "@/lib/notes/attribution";
import { formatMomentDateTimeLong } from "@/lib/dates/display";

type Note = {
  id: string;
  body: string;
  /** Formatted version. Older notes have only `body`, so both render. */
  bodyHtml?: string | null;
  /** Visible only to the HR team. Non-HR viewers never receive the row at all. */
  hrOnly?: boolean;
  source: string | null;
  author: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * A write-up that lives on the Interview record rather than on a note.
 *
 * These are read-only here. The Interviews tab owns editing them; this view
 * exists so a recruiter reading Notes can SEE them, which until now they could
 * not — 41 imported candidates have their only written record on an interview,
 * so the Notes tab showed an empty page for people who had been interviewed and
 * written up at length.
 */
export type InterviewWriteUp = {
  id: string;
  title: string;
  interviewer: string | null;
  notes: string | null;
  notesHtml?: string | null;
  outcome?: string | null;
  startDateTime: string;
};

function formatWhen(value: string) {
  return formatMomentDateTimeLong(value);
}

export function CandidateNotes({
  candidateId,
  initialNotes,
  people = [],
  interviewWriteUps = [],
  viewerIsHr = false
}: {
  candidateId: string;
  initialNotes: Note[];
  people?: Array<{ name: string; email: string; isHr?: boolean }>;
  interviewWriteUps?: InterviewWriteUp[];
  /** Whether the person reading this page is on the HR team. Controls only the
   *  CONTROLS — the notes themselves are already filtered server-side, so a false
   *  value here can hide a button but can never be the thing keeping a note private. */
  viewerIsHr?: boolean;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState<Note[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  // Whether the note being composed is private to HR. Resets after each send, so
  // private is never sticky — a note meant for everyone cannot inherit it silently.
  const [draftPrivate, setDraftPrivate] = useState(false);

  // One chronological feed of everything written about this candidate. Write-ups
  // with no actual text are dropped — an interview record exists for every
  // scheduled slot, and empty ones would bury the notes under blank cards.
  const feed = useMemo(() => {
    const entries = [
      ...notes.map((note) => ({ kind: "note" as const, at: note.createdAt, note })),
      ...interviewWriteUps
        .filter((w) => (w.notes ?? "").trim() || (w.notesHtml ?? "").trim())
        .map((writeUp) => ({ kind: "interview" as const, at: writeUp.startDateTime, writeUp }))
    ];
    return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [notes, interviewWriteUps]);

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

  // Anybody @-mentioned in this draft who is NOT on the HR team. The mention email
  // does not carry the note text, but it does say a note exists and links to the
  // profile — so a private note that mentions an outsider sends them somewhere to
  // find nothing. She is warned and left to decide, rather than the mention being
  // silently dropped (they would never know) or silently sent (it leaks).
  const mentionedOutsideHr = useMemo(() => {
    const byEmail = new Map(people.map((p) => [p.email.toLowerCase(), p] as const));
    const out: string[] = [];
    for (const m of draft.matchAll(/data-mention="([^"]+)"/g)) {
      const person = byEmail.get(m[1].toLowerCase());
      if (person && !person.isHr && !out.includes(person.name)) out.push(person.name);
    }
    return out;
  }, [draft, people]);

  async function add() {
    if (draftIsEmpty) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bodyHtml: draft, hrOnly: draftPrivate })
      });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(b.message ?? "Couldn't add note.");
      }
      const { note } = (await res.json()) as { note: Note };
      setNotes((cur) => [note, ...cur]);
      setDraft("");
      setDraftPrivate(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't add note.");
    } finally {
      setBusy(false);
    }
  }

  // Flip an existing note's privacy, both directions. She writes notes as she goes
  // and realizes afterwards that one should not be shared — without this, that
  // means deleting it and retyping it somewhere safe.
  async function togglePrivacy(note: Note) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/notes/${note.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // The body has to go too: the route rebuilds body/bodyHtml from what it is
        // sent and would otherwise blank the note out.
        body: JSON.stringify({ bodyHtml: note.bodyHtml ?? note.body, hrOnly: !note.hrOnly })
      });
      if (res.ok) {
        const { note: updated } = (await res.json()) as { note: Note };
        setNotes((cur) => cur.map((n) => (n.id === note.id ? updated : n)));
        router.refresh();
      } else {
        const b = (await res.json().catch(() => ({}))) as { message?: string };
        setError(b.message ?? "Couldn't change whether that note is private.");
      }
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
        {/* A div, NOT a label. A <label> with no htmlFor claims its first LABELABLE
            descendant as its control — which here was the editor's Bold button. So a
            click on the "Add a note" caption, or on the padding around the box, was
            forwarded to Bold: focus jumped to position 0 and bold switched on, in one
            gesture. That is the half of the 2026-09-02 report that reads "on a brand
            new opened text it made it bold". The caption keeps its accessible name via
            ariaLabel on the editor instead. */}
        <div className="flex-1">
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Add a note</span>
          <RichTextEditor
            value={draft}
            onChange={setDraft}
            people={people}
            ariaLabel="Add a note"
            placeholder="Record a note about this candidate. Paste keeps its formatting."
            minHeight={110}
          />
        </div>
        <div className="flex items-center gap-2 sm:flex-col sm:items-stretch">
          {viewerIsHr ? (
            <button
              type="button"
              onClick={() => setDraftPrivate((v) => !v)}
              aria-pressed={draftPrivate}
              title="Only the HR team will be able to see this note. Everyone else will not see that it exists."
              className={clsx(
                "inline-flex items-center justify-center gap-1.5 rounded border px-3 py-1.5 text-xs font-semibold transition",
                draftPrivate
                  ? "border-brand-gold bg-brand-lea text-white shadow-glow dark:border-brand-gold dark:bg-brand-lea"
                  : "border-brand-lea/20 text-brand-grey hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-400 dark:hover:bg-white/5"
              )}
            >
              <Lock className="h-3.5 w-3.5" />
              {draftPrivate ? "Private HR note" : "Make private"}
            </button>
          ) : null}
          <Button onClick={add} disabled={busy || draftIsEmpty}>
            <Send className="h-4 w-4" /> Add
          </Button>
        </div>
      </div>
      {draftPrivate ? (
        <p className="mt-2 text-xs font-medium text-brand-lea dark:text-brand-sweet">
          Only the HR team will see this note. To anybody else it will not be there at all — not greyed out, not
          counted.
          {mentionedOutsideHr.length ? (
            <>
              {" "}
              <span className="text-amber-700 dark:text-amber-300">
                You have mentioned {mentionedOutsideHr.join(", ")}. They are not on the HR team, so they will get an
                email saying they were mentioned and then find nothing on the profile.
              </span>
            </>
          ) : null}
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs font-medium text-red-700 dark:text-red-300">{error}</p> : null}

      {/* List — notes and interview write-ups together, newest first.
          Interleaved rather than kept in two sections: they are the same thing
          to the person reading (what was written about this candidate, and
          when), and splitting them is what let a write-up go unseen. */}
      <div className="mt-4 space-y-2">
        {feed.length === 0 ? (
          <p className="py-6 text-center text-sm text-brand-grey dark:text-slate-400">No notes yet. Add the first one above.</p>
        ) : (
          feed.map((entry) => {
            if (entry.kind === "interview") {
              const w = entry.writeUp;
              return (
                <div
                  key={`iv-${w.id}`}
                  className="rounded border border-brand-sweet/50 bg-brand-sweet/10 p-3 dark:border-brand-sweet/25 dark:bg-brand-sweet/5"
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-brand-lea px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Interview write-up
                    </span>
                    <span className="text-xs font-semibold text-brand-lea dark:text-slate-200">{w.title}</span>
                    {w.outcome ? (
                      <span className="text-[11px] text-brand-grey dark:text-slate-400">· {w.outcome}</span>
                    ) : null}
                  </div>
                  {w.notesHtml ? (
                    <RichTextView html={w.notesHtml} className="mt-2 leading-6 text-brand-black/80 dark:text-slate-300" />
                  ) : (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-brand-black/80 dark:text-slate-300">
                      {w.notes}
                    </p>
                  )}
                  <div className="mt-2 text-xs text-brand-grey dark:text-slate-400">
                    {w.interviewer?.trim() || "Interviewer not recorded"} · {formatWhen(w.startDateTime)} · edit on the
                    Interviews tab
                  </div>
                </div>
              );
            }

            const note = entry.note;
            // Who to credit, and the body to show. An imported note carries its
            // author as a trailing "— Name" line, so when that is what we are
            // crediting it has to come OUT of the body or the name renders twice.
            const attribution = noteAttribution(note);
            const shownBody = attribution.fromSignature ? noteBodyWithoutSignature(note.body) : note.body;

            return editingId === note.id ? (
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
              <div
                key={note.id}
                className={clsx(
                  "group rounded border p-3",
                  note.hrOnly
                    ? // Navy rail plus a warm ground, so a private note is unmistakable
                      // at a glance without shouting. Getting this wrong in the quiet
                      // direction is the real risk: somebody skim-reading the feed to
                      // paste something into an email must never mistake one of these
                      // for an ordinary note.
                      "border-brand-lea/25 border-l-4 border-l-brand-lea bg-brand-gold/10 dark:border-white/15 dark:border-l-brand-gold dark:bg-brand-gold/10"
                    : "border-brand-lea/10 bg-brand-cloudDancer/45 dark:border-white/10 dark:bg-white/5"
                )}
              >
                {note.hrOnly ? (
                  <p className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-lea dark:text-brand-gold">
                    <Lock className="h-3 w-3" /> Private · HR only
                  </p>
                ) : null}
                <div className="flex items-start justify-between gap-2">
                  {/* Formatted when we have it, plain text for older notes. */}
                  {note.bodyHtml ? (
                    <div className="min-w-0 flex-1">
                      <RichTextView html={note.bodyHtml} className="leading-6 text-brand-black/80 dark:text-slate-300" />
                    </div>
                  ) : (
                    <p className="min-w-0 flex-1 whitespace-pre-wrap text-sm leading-6 text-brand-black/80 dark:text-slate-300">{shownBody}</p>
                  )}
                  <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
                    {viewerIsHr ? (
                      <button
                        type="button"
                        onClick={() => togglePrivacy(note)}
                        disabled={busy}
                        aria-pressed={Boolean(note.hrOnly)}
                        aria-label={note.hrOnly ? "Make this note visible to everyone" : "Make this note private to HR"}
                        title={
                          note.hrOnly
                            ? "Make this visible to everyone who can see this candidate"
                            : "Make this private to the HR team"
                        }
                        className={clsx(
                          "rounded p-1 transition",
                          note.hrOnly
                            ? "text-brand-lea hover:bg-white dark:text-brand-gold dark:hover:bg-white/10"
                            : "text-brand-grey hover:bg-white hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100"
                        )}
                      >
                        <Lock className="h-4 w-4" />
                      </button>
                    ) : null}
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
                  {attribution.name} · {formatWhen(note.createdAt)}
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
