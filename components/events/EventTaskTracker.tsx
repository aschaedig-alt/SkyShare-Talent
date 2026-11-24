"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Upload } from "lucide-react";
import { Button, Input, Modal, Textarea } from "@/components/ui";
import { MeetingImportModal } from "@/components/events/MeetingImportModal";
import { TASK_STATUSES } from "@/lib/events/constants";
import { dayKeyOf, officeDayKey, zoneForValue } from "@/lib/dates/display";
import type { MeetingView, TaskView } from "@/lib/data/events";

// "What we need" — every to-do on an event, who owns it and where it stands.
// Grew from a checklist into a tracker on Nov 24 2026 for the Christmas party
// planning: status beyond done/not done, notes, a filter by person, and to-dos
// imported from uploaded meeting transcripts (MeetingImportModal).

const CARD = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const SELECT =
  "rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-xs text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";
const CHIP = "rounded border px-2.5 py-1 text-xs font-semibold transition";
const CHIP_ON = "border-brand-lea bg-brand-lea text-white ring-1 ring-brand-gold dark:border-brand-gold";
const CHIP_OFF =
  "border-brand-lea/15 text-brand-lea hover:shadow-glow dark:border-white/10 dark:text-slate-200";

const STATUS_TONE: Record<string, string> = {
  TODO: "border-brand-lea/20 text-brand-grey dark:border-white/15 dark:text-slate-300",
  IN_PROGRESS: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-400/30 dark:bg-sky-400/10 dark:text-sky-200",
  BLOCKED: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-200",
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200"
};

const UNASSIGNED = "__unassigned__";

async function send(url: string, body: unknown, method = "PATCH") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.ok;
}

function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: zoneForValue(iso), month: "short", day: "numeric" }).format(
    new Date(iso)
  );
}

/** A due date's calendar day. The column holds both midnight UTC (a date box)
 *  and midnight Mountain (an import); dayKeyOf reads each in its own zone. */
const dayOf = (iso: string | null) => dayKeyOf(iso);

export function EventTaskTracker({
  eventId,
  tasks,
  setTasks,
  meetings,
  ownerSuggestions
}: {
  eventId: string;
  tasks: TaskView[];
  setTasks: React.Dispatch<React.SetStateAction<TaskView[]>>;
  meetings: MeetingView[];
  ownerSuggestions: string[];
}) {
  const router = useRouter();
  const ownerListId = `task-owners-${eventId}`;

  const [person, setPerson] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<"OPEN" | "ALL" | string>("OPEN");
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openNotes, setOpenNotes] = useState<Set<string>>(new Set());
  const [transcript, setTranscript] = useState<{ title: string; text: string } | null>(null);

  const [label, setLabel] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [busy, setBusy] = useState(false);

  const today = officeDayKey(new Date());

  // Who owns how much that is still open — the "who is responsible for what" view.
  const people = useMemo(() => {
    const counts = new Map<string, { open: number; total: number }>();
    for (const t of tasks) {
      const key = t.owner?.trim() || UNASSIGNED;
      const entry = counts.get(key) ?? { open: 0, total: 0 };
      entry.total += 1;
      if (t.status !== "DONE") entry.open += 1;
      counts.set(key, entry);
    }
    return [...counts.entries()].sort((a, b) => {
      if (a[0] === UNASSIGNED) return 1;
      if (b[0] === UNASSIGNED) return -1;
      return b[1].open - a[1].open || a[0].localeCompare(b[0]);
    });
  }, [tasks]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const t of tasks) counts[t.status] = (counts[t.status] ?? 0) + 1;
    return counts;
  }, [tasks]);

  const visible = useMemo(
    () =>
      tasks.filter((t) => {
        if (person === UNASSIGNED ? t.owner?.trim() : person && t.owner?.trim() !== person) return false;
        if (statusFilter === "OPEN") return t.status !== "DONE";
        if (statusFilter !== "ALL") return t.status === statusFilter;
        return true;
      }),
    [tasks, person, statusFilter]
  );

  async function patch(t: TaskView, change: Partial<TaskView>, body: Record<string, unknown>) {
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, ...change } : x)));
    const ok = await send(`/api/events/tasks/${t.id}`, body);
    if (!ok) {
      setError("That change did not save. Reload the page and try again.");
      setTasks((cur) => cur.map((x) => (x.id === t.id ? t : x)));
    }
  }

  function setStatus(t: TaskView, status: string) {
    void patch(t, { status, done: status === "DONE" }, { status });
  }

  async function remove(t: TaskView) {
    if (!window.confirm(`Remove "${t.label}"?`)) return;
    setTasks((cur) => cur.filter((x) => x.id !== t.id));
    await send(`/api/events/tasks/${t.id}`, null, "DELETE");
    router.refresh();
  }

  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    setError(null);
    const ok = await send(`/api/events/${eventId}/tasks`, { label, owner, dueAt: due }, "POST");
    setBusy(false);
    if (!ok) {
      setError("Unable to add that item.");
      return;
    }
    setLabel("");
    setOwner("");
    setDue("");
    router.refresh();
  }

  async function showTranscript(m: MeetingView) {
    const res = await fetch(`/api/events/meetings/${m.id}`);
    const data = (await res.json().catch(() => ({}))) as { transcript?: string };
    setTranscript({ title: m.title, text: data.transcript ?? "Could not load the transcript." });
  }

  async function undoImport(m: MeetingView) {
    if (
      !window.confirm(
        `Undo the "${m.title}" import? This removes the meeting and the ${m.taskCount} to-do${
          m.taskCount === 1 ? "" : "s"
        } that came from it, including any changes made to them since.`
      )
    )
      return;
    const ok = await send(`/api/events/meetings/${m.id}?withTasks=1`, null, "DELETE");
    if (!ok) setError("Could not undo that import.");
    router.refresh();
  }

  function toggleNotes(id: string) {
    setOpenNotes((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <section className={CARD}>
      <datalist id={ownerListId}>
        {ownerSuggestions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">What we need</h2>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            Every to-do for this event, who owns it and where it stands. Import a planning meeting&apos;s transcript to
            pull out who said they would do what.
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setImporting(true)}>
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Import from a meeting
        </Button>
      </div>

      {notice ? (
        <p className="mt-3 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-200">
          {notice}
        </p>
      ) : null}

      {/* By person */}
      {people.length > 0 ? (
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
            By person · open to-dos
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            <button className={`${CHIP} ${person === "" ? CHIP_ON : CHIP_OFF}`} onClick={() => setPerson("")}>
              Everyone
            </button>
            {people.map(([name, c]) => (
              <button
                key={name}
                className={`${CHIP} ${person === name ? CHIP_ON : CHIP_OFF}`}
                onClick={() => setPerson(person === name ? "" : name)}
              >
                {name === UNASSIGNED ? "Unassigned" : name} <span className="font-normal opacity-75">{c.open}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* By status */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {[
          { value: "OPEN", label: "Still open", count: tasks.length - (statusCounts.DONE ?? 0) },
          ...TASK_STATUSES.map((s) => ({ value: s.value as string, label: s.label, count: statusCounts[s.value] ?? 0 })),
          { value: "ALL", label: "All", count: tasks.length }
        ].map((s) => (
          <button
            key={s.value}
            className={`${CHIP} ${statusFilter === s.value ? CHIP_ON : CHIP_OFF}`}
            onClick={() => setStatusFilter(s.value)}
          >
            {s.label} <span className="font-normal opacity-75">{s.count}</span>
          </button>
        ))}
      </div>

      {/* The list. Cards, not a table, so it reads on a phone with no sideways scroll. */}
      <ul className="mt-3 divide-y divide-brand-lea/10 dark:divide-white/10">
        {visible.length === 0 ? (
          <li className="py-4 text-center text-xs text-brand-grey dark:text-slate-400">
            {tasks.length === 0 ? "Nothing on the list yet." : "Nothing matches these filters."}
          </li>
        ) : (
          visible.map((t) => {
            const overdue = t.status !== "DONE" && t.dueAt && dayOf(t.dueAt) < today;
            const notesOpen = openNotes.has(t.id);
            return (
              <li key={t.id} className="py-3">
                <div className="flex flex-wrap items-start gap-2">
                  <div className="min-w-0 flex-1 basis-60">
                    <p
                      className={`text-sm ${
                        t.status === "DONE"
                          ? "text-brand-grey line-through dark:text-slate-500"
                          : "font-medium text-brand-lea dark:text-slate-100"
                      }`}
                    >
                      {t.label}
                    </p>
                    <p className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">
                      {t.owner || "Unassigned"}
                      {t.dueAt ? ` · due ${fmtDay(t.dueAt)}` : ""}
                      {overdue ? <span className="font-semibold text-red-600 dark:text-red-400"> · overdue</span> : null}
                      {t.meetingTitle ? ` · from ${t.meetingTitle}` : ""}
                    </p>
                  </div>
                  <select
                    className={`${SELECT} ${STATUS_TONE[t.status] ?? ""}`}
                    value={t.status}
                    onChange={(e) => setStatus(t, e.target.value)}
                    aria-label="Status"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Input
                    key={`owner-${t.id}-${t.owner ?? ""}`}
                    list={ownerListId}
                    defaultValue={t.owner ?? ""}
                    placeholder="Owner"
                    className="w-full sm:w-48"
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next !== (t.owner ?? "")) void patch(t, { owner: next || null }, { owner: next });
                    }}
                  />
                  <Input
                    type="date"
                    value={dayOf(t.dueAt)}
                    className="w-auto"
                    onChange={(e) =>
                      void patch(t, { dueAt: e.target.value ? `${e.target.value}T00:00:00.000Z` : null }, { dueAt: e.target.value })
                    }
                    aria-label="Due date"
                  />
                  <button
                    className="text-[11px] font-semibold text-brand-eden hover:underline dark:text-brand-sweet"
                    onClick={() => toggleNotes(t.id)}
                  >
                    {notesOpen ? "Hide notes" : t.notes ? "Notes" : "Add a note"}
                  </button>
                  <button
                    className="ml-auto text-[11px] text-red-600 hover:underline dark:text-red-400"
                    onClick={() => remove(t)}
                  >
                    Remove
                  </button>
                </div>
                {t.notes && !notesOpen ? (
                  <p className="mt-1.5 whitespace-pre-wrap text-xs text-brand-grey dark:text-slate-400">{t.notes}</p>
                ) : null}
                {notesOpen ? (
                  <Textarea
                    key={`notes-${t.id}`}
                    className="mt-2 text-xs"
                    defaultValue={t.notes ?? ""}
                    placeholder="Where it stands, who to call, what it is waiting on…"
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next !== (t.notes ?? "")) void patch(t, { notes: next || null }, { notes: next });
                    }}
                  />
                ) : null}
              </li>
            );
          })
        )}
      </ul>

      {error ? <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="mt-3 space-y-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
        <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What is needed?" />
        <div className="flex flex-wrap gap-2">
          <Input
            list={ownerListId}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Owner"
            className="min-w-0 flex-1"
          />
          <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="w-auto" />
          <Button size="sm" onClick={add} disabled={busy || !label.trim()}>
            Add
          </Button>
        </div>
      </div>

      {/* Imported meetings */}
      {meetings.length > 0 ? (
        <div className="mt-4 border-t border-brand-lea/10 pt-3 dark:border-white/10">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
            Planning meetings
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {meetings.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-medium text-brand-lea dark:text-slate-100">{m.title}</span>
                <span className="text-brand-grey dark:text-slate-400">
                  {m.heldAt ? fmtDay(m.heldAt) : "no date"} · {m.taskCount} to-do{m.taskCount === 1 ? "" : "s"}
                </span>
                <button
                  className="inline-flex items-center gap-1 font-semibold text-brand-eden hover:underline dark:text-brand-sweet"
                  onClick={() => showTranscript(m)}
                >
                  <FileText className="h-3 w-3" /> Transcript
                </button>
                <button className="text-red-600 hover:underline dark:text-red-400" onClick={() => undoImport(m)}>
                  Undo import
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <MeetingImportModal
        open={importing}
        onClose={() => setImporting(false)}
        eventId={eventId}
        ownerListId={ownerListId}
        onSaved={(count) => {
          setNotice(`Saved ${count} to-do${count === 1 ? "" : "s"} from the meeting.`);
          router.refresh();
        }}
      />

      <Modal open={transcript !== null} onClose={() => setTranscript(null)} maxWidth="max-w-3xl" title="Transcript">
        <div className="p-5">
          <h2 className="pr-8 text-lg font-semibold text-brand-lea dark:text-slate-100">{transcript?.title}</h2>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-brand-lea dark:text-slate-200">
            {transcript?.text}
          </pre>
        </div>
      </Modal>
    </section>
  );
}
