"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Star, Pencil, Trash2 } from "lucide-react";
import { RichTextEditor, RichTextView } from "@/components/richtext/RichTextEditor";
import { INTERVIEW_OUTCOMES, INTERVIEW_TYPES, interviewOutcomeTone, interviewOutcomeLabel } from "@/lib/interviews/constants";
import { formatCalendarDayShort } from "@/lib/dates/display";
import { EmptyState } from "@/components/ui";

/**
 * Record an interview that already happened, with the notes pasted in.
 *
 * Interviews are still run in Paycom, so this is a place to put the write-up
 * afterwards — which is also what makes a candidate show up under "recent
 * interviews". The DATE is the interview's own date, not today, because that is
 * what the 30/60/90 windows count from.
 */

export type InterviewView = {
  id: string;
  title: string;
  startDateTime: string;
  interviewer: string | null;
  interviewerEmail: string | null;
  status: string;
  notes: string | null;
  notesHtml: string | null;
  outcome: string | null;
  rating: number | null;
  nextStep: string | null;
};

const label = "text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400";
const field =
  "mt-1 block w-full rounded border border-brand-lea/20 px-3 py-1.5 text-sm text-brand-lea outline-none focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";

function todayInputValue(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function InterviewWriteUp({
  candidateId,
  interviews,
  people,
  me,
  canEdit,
  // A hiring manager scoped to a hand-picked set of candidates, allowed to record
  // write-ups on THOSE candidates only. They do not hold candidates:write, so
  // canEdit is false for them and every other control on this profile stays shut;
  // this prop opens the interview write-up and nothing else. The server enforces
  // the same rule independently — see canAnnotateCandidate in
  // lib/auth/candidate-scope.ts — so this only decides what is worth rendering.
  canAnnotate = false
}: {
  candidateId: string;
  interviews: InterviewView[];
  people: Array<{ name: string; email: string }>;
  me: { name: string; email: string } | null;
  canEdit: boolean;
  canAnnotate?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    interviewedAt: todayInputValue(),
    interviewerEmail: me?.email ?? people[0]?.email ?? "",
    interviewType: "RECRUITER_SCREEN",
    outcome: "",
    rating: 0,
    nextStep: "",
    notesHtml: ""
  });

  // The write-up is long-form typing that exists nowhere else yet, so every exit
  // from this function has to clear `busy` and say what happened. A rejected
  // fetch (offline, DNS, the dev server restarting) used to skip the setBusy(false)
  // below it entirely: the button stayed on "Saving…" and disabled forever, with
  // no error, and the notes were only recoverable by not touching the page.
  async function save() {
    setBusy(true);
    setError(null);
    const chosen = people.find((p) => p.email === form.interviewerEmail);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/interviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Midday avoids a date typed here landing on the previous day once the
          // browser's timezone offset is applied.
          interviewedAt: `${form.interviewedAt}T12:00:00`,
          interviewerEmail: form.interviewerEmail,
          interviewerName: chosen?.name ?? "",
          interviewType: form.interviewType,
          title: INTERVIEW_TYPES.find((t) => t.value === form.interviewType)?.label ?? "Interview",
          outcome: form.outcome || null,
          rating: form.rating || null,
          nextStep: form.nextStep || null,
          notesHtml: form.notesHtml
        })
      });
      if (res.ok) {
        setOpen(false);
        // Only cleared once the server has it — on any failure the typed notes
        // stay in the form so the same click can be retried.
        setForm({ ...form, notesHtml: "", outcome: "", rating: 0, nextStep: "" });
        router.refresh();
      } else {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "Could not save the interview. Your notes are still here — try again.");
      }
    } catch {
      setError("Could not reach the server. Your notes are still here — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const logged = [...interviews].sort(
    (a, b) => new Date(b.startDateTime).getTime() - new Date(a.startDateTime).getTime()
  );

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Interviews</h2>
        {(canEdit || canAnnotate) && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden"
          >
            {open ? "Cancel" : "Log an interview"}
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className={label}>Date interviewed</span>
              <input
                type="date"
                value={form.interviewedAt}
                onChange={(e) => setForm({ ...form, interviewedAt: e.target.value })}
                className={field}
              />
            </label>
            <label className="block">
              <span className={label}>Interviewer</span>
              <select
                value={form.interviewerEmail}
                onChange={(e) => setForm({ ...form, interviewerEmail: e.target.value })}
                className={field}
              >
                {people.map((p) => (
                  <option key={p.email} value={p.email}>{p.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={label}>Type</span>
              <select
                value={form.interviewType}
                onChange={(e) => setForm({ ...form, interviewType: e.target.value })}
                className={field}
              >
                {INTERVIEW_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3">
            <span className={label}>Notes — paste straight from Paycom</span>
            <div className="mt-1">
              <RichTextEditor
                value={form.notesHtml}
                onChange={(html) => setForm({ ...form, notesHtml: html })}
                people={people}
                placeholder="Paste the interview notes here. Formatting is kept."
                minHeight={200}
              />
            </div>
          </div>

          <label className="mt-3 block">
            <span className={label}>Next step</span>
            <input
              value={form.nextStep}
              onChange={(e) => setForm({ ...form, nextStep: e.target.value })}
              placeholder="Schedule with hiring manager, waiting on references, …"
              className={field}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div>
              <span className={label}>Outcome</span>
              <div className="mt-1 flex gap-1.5">
                {INTERVIEW_OUTCOMES.map((o) => (
                  <button
                    key={o.value}
                    onClick={() => setForm({ ...form, outcome: form.outcome === o.value ? "" : o.value })}
                    className={clsx(
                      "rounded border px-2.5 py-1 text-xs font-semibold transition",
                      form.outcome === o.value
                        ? "border-brand-lea bg-brand-lea text-white"
                        : "border-brand-lea/20 text-brand-grey hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-300"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className={label}>Rating</span>
              <div className="mt-1 flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setForm({ ...form, rating: form.rating === n ? 0 : n })}
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    className="p-0.5 transition hover:scale-110"
                  >
                    <Star
                      className={clsx(
                        "h-5 w-5",
                        n <= form.rating ? "fill-brand-gold text-brand-gold" : "text-brand-lea/25 dark:text-white/25"
                      )}
                    />
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={save}
              disabled={busy}
              className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save interview"}
            </button>
            {error && <span className="text-xs font-semibold text-red-700 dark:text-red-300">{error}</span>}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {logged.length > 0 ? (
          logged.map((i) => (
            <LoggedInterview
              key={i.id}
              candidateId={candidateId}
              interview={i}
              people={people}
              // An annotator may edit only the write-ups attributed to them, which
              // is exactly what the API allows. Showing the pencil on somebody
              // else's row would offer an action guaranteed to come back 403.
              canEdit={canEdit || (canAnnotate && Boolean(me?.email) && i.interviewerEmail === me?.email)}
            />
          ))
        ) : (
          <EmptyState title="No interviews logged yet" description="Log one to paste your write-up and put this candidate on the Recent interviews list." bare />
        )}
      </div>
    </section>
  );
}

function todayInputValueFrom(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function LoggedInterview({
  candidateId,
  interview,
  people,
  canEdit
}: {
  candidateId: string;
  interview: InterviewView;
  people: Array<{ name: string; email: string }>;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => ({
    interviewedAt: todayInputValueFrom(interview.startDateTime),
    interviewerEmail: interview.interviewerEmail ?? people[0]?.email ?? "",
    outcome: interview.outcome ?? "",
    rating: interview.rating ?? 0,
    nextStep: interview.nextStep ?? "",
    notesHtml: interview.notesHtml ?? interview.notes ?? ""
  }));

  // Same rule as the new-interview form above: an edit holds re-typed notes, so
  // busy always clears and a failure always says so. Staying in edit mode on
  // failure is deliberate — leaving it would discard the draft.
  async function save() {
    setBusy(true);
    setError(null);
    const chosen = people.find((p) => p.email === draft.interviewerEmail);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/interviews/${interview.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          interviewedAt: `${draft.interviewedAt}T12:00:00`,
          interviewerEmail: draft.interviewerEmail,
          interviewerName: chosen?.name ?? "",
          outcome: draft.outcome || null,
          rating: draft.rating || null,
          nextStep: draft.nextStep || null,
          notesHtml: draft.notesHtml
        })
      });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else {
        const payload = (await res.json().catch(() => null)) as { message?: string } | null;
        setError(payload?.message ?? "Could not save the changes. Your edits are still here — try again.");
      }
    } catch {
      setError("Could not reach the server. Your edits are still here — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/interviews/${interview.id}`, { method: "DELETE" });
      if (res.ok) router.refresh();
      else setError("Could not delete this interview.");
    } catch {
      setError("Could not reach the server to delete this interview.");
    } finally {
      setBusy(false);
    }
  }

  if (editing) {
    return (
      <div className="rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={label}>Date interviewed</span>
            <input type="date" value={draft.interviewedAt} onChange={(e) => setDraft({ ...draft, interviewedAt: e.target.value })} className={field} />
          </label>
          <label className="block">
            <span className={label}>Interviewer</span>
            <select value={draft.interviewerEmail} onChange={(e) => setDraft({ ...draft, interviewerEmail: e.target.value })} className={field}>
              {people.map((p) => <option key={p.email} value={p.email}>{p.name}</option>)}
            </select>
          </label>
          <div>
            <span className={label}>Rating</span>
            <div className="mt-1 flex items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setDraft({ ...draft, rating: draft.rating === n ? 0 : n })} aria-label={`${n} star${n === 1 ? "" : "s"}`} className="p-0.5">
                  <Star className={clsx("h-5 w-5", n <= draft.rating ? "fill-brand-gold text-brand-gold" : "text-brand-lea/25 dark:text-white/25")} />
                </button>
              ))}
            </div>
          </div>
        </div>
        <label className="mt-3 block">
          <span className={label}>Next step</span>
          <input
            value={draft.nextStep}
            onChange={(e) => setDraft({ ...draft, nextStep: e.target.value })}
            placeholder="Schedule with hiring manager, waiting on references, …"
            className={field}
          />
        </label>
        <div className="mt-3">
          <RichTextEditor value={draft.notesHtml} onChange={(html) => setDraft({ ...draft, notesHtml: html })} people={people} minHeight={160} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            {INTERVIEW_OUTCOMES.map((o) => (
              <button
                key={o.value}
                onClick={() => setDraft({ ...draft, outcome: draft.outcome === o.value ? "" : o.value })}
                className={clsx(
                  "rounded border px-2.5 py-1 text-xs font-semibold transition",
                  draft.outcome === o.value ? "border-brand-lea bg-brand-lea text-white" : "border-brand-lea/20 text-brand-grey hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-300"
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <button onClick={save} disabled={busy} className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50">
            {busy ? "Saving…" : "Save changes"}
          </button>
          <button onClick={() => setEditing(false)} disabled={busy} className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-300">
            Cancel
          </button>
          {error && <span className="text-xs font-semibold text-red-700 dark:text-red-300">{error}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="group rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-brand-lea dark:text-slate-100">{interview.title}</span>
        <span className="text-xs text-brand-grey dark:text-slate-400">
          {formatCalendarDayShort(interview.startDateTime)}
          {interview.interviewer ? ` · ${interview.interviewer}` : ""}
        </span>
        {interview.outcome && (
          <span className={clsx("rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", interviewOutcomeTone(interview.outcome))}>
            {interviewOutcomeLabel(interview.outcome)}
          </span>
        )}
        {interview.rating ? (
          <span className="inline-flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star key={n} className={clsx("h-3 w-3", n <= (interview.rating ?? 0) ? "fill-brand-gold text-brand-gold" : "text-brand-lea/20 dark:text-white/20")} />
            ))}
          </span>
        ) : null}
        {canEdit && (
          <span className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
            <button onClick={() => setEditing(true)} aria-label="Edit this interview" className="rounded p-1 text-brand-grey transition hover:bg-white hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => (confirmingDelete ? remove() : setConfirmingDelete(true))}
              onBlur={() => setConfirmingDelete(false)}
              disabled={busy}
              aria-label={confirmingDelete ? "Confirm delete" : "Delete this interview"}
              className={clsx(
                "rounded p-1 transition",
                confirmingDelete ? "bg-red-600 text-white" : "text-brand-grey hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
              )}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </span>
        )}
      </div>
      {interview.nextStep && (
        <div className="mt-2 text-xs text-brand-lea dark:text-slate-200">
          <span className="rounded bg-brand-gold/15 px-2 py-1 font-medium">Next: {interview.nextStep}</span>
        </div>
      )}
      {interview.notesHtml ? (
        <div className="mt-2 rounded border border-brand-lea/10 bg-white/70 p-2.5 dark:border-white/10 dark:bg-white/5">
          <RichTextView html={interview.notesHtml} />
        </div>
      ) : interview.notes?.trim() ? (
        <p className="mt-2 whitespace-pre-wrap rounded border border-brand-lea/10 bg-white/70 p-2 text-xs text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-200">
          {interview.notes.trim()}
        </p>
      ) : null}
      {error && !editing && <p className="mt-1 text-xs font-semibold text-red-700 dark:text-red-300">{error}</p>}
    </div>
  );
}
