"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { ChevronDown, ChevronRight, Lightbulb, MessageSquare, Plus, Upload } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import { ACTIVITY_STATUSES, activityStatusLabel } from "@/lib/events/constants";
import type { ActivityView } from "@/lib/data/events";
import { MeetingImportModal } from "@/components/events/MeetingImportModal";

// ACTIVITIES - what people will do at a company event (Aimee, Nov 25 2026). The
// scavenger hunt is one activity; there are others, and "room for people to
// contribute": anyone who can see events can suggest one (it starts as an Idea)
// and leave a note on any of them. Deciding - status, who runs it, removing -
// needs events:write. Meeting transcripts can propose activities too.

const CARD = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const LABEL = "text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400";

// Planned and Ready first, then ideas, dropped last.
const ORDER: Record<string, number> = { READY: 0, PLANNED: 1, IDEA: 2, DROPPED: 3 };

function fmt(iso: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(iso));
}

async function send(url: string, body: unknown, method = "POST") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === null ? undefined : JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as { message?: string };
  return { ok: res.ok, message: data.message };
}

export function EventActivities({
  eventId,
  activities,
  canWrite,
  ownerSuggestions,
  huntAdmin
}: {
  eventId: string;
  activities: ActivityView[];
  canWrite: boolean;
  ownerSuggestions: string[];
  /** The scavenger hunt's admin screen, rendered on the server, shown inside the hunt activity. */
  huntAdmin: ReactNode;
}) {
  const router = useRouter();
  const ownerListId = `activity-owners-${eventId}`;
  const [suggesting, setSuggesting] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [importing, setImporting] = useState(false);
  const [openHunt, setOpenHunt] = useState(false);
  const [showDropped, setShowDropped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasHunt = activities.some((a) => a.kind === "SCAVENGER_HUNT");
  const sorted = [...activities].sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
  const live = sorted.filter((a) => a.status !== "DROPPED");
  const dropped = sorted.filter((a) => a.status === "DROPPED");

  async function add(body: Record<string, unknown>, done: string) {
    setBusy(true);
    setError(null);
    const result = await send(`/api/events/${eventId}/activities`, body);
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not add that.");
      return false;
    }
    setNotice(done);
    router.refresh();
    return true;
  }

  async function suggest() {
    const ok = await add({ name, description }, canWrite ? "Added." : "Thanks - your idea is on the list.");
    if (ok) {
      setName("");
      setDescription("");
      setSuggesting(false);
    }
  }

  return (
    <section className="space-y-3">
      <datalist id={ownerListId}>
        {ownerSuggestions.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      <div className={CARD}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Activities</h2>
            <p className="mt-0.5 text-sm text-brand-grey dark:text-slate-400">
              What people will do at the party. Anyone can suggest one or add a note.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => setSuggesting((v) => !v)}>
              <Lightbulb className="mr-1.5 h-3.5 w-3.5" />
              Suggest an activity
            </Button>
            {canWrite ? (
              <Button size="sm" variant="secondary" onClick={() => setImporting(true)}>
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                Import from a meeting
              </Button>
            ) : null}
            {canWrite && !hasHunt ? (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  void add(
                    {
                      name: "Scavenger hunt",
                      description: "“Where's the Executive?” QR hunt: guests scan hidden pictures with their phones.",
                      kind: "SCAVENGER_HUNT",
                      status: "PLANNED"
                    },
                    "Scavenger hunt added."
                  )
                }
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Scavenger hunt
              </Button>
            ) : null}
          </div>
        </div>

        {suggesting ? (
          <div className="mt-3 grid gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <label className="block">
              <span className={LABEL}>Activity</span>
              <Input className="mt-1" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ugly sweater contest" />
            </label>
            <label className="block">
              <span className={LABEL}>What is it? (optional)</span>
              <Textarea
                className="mt-1"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Prizes for the best three, judged by the exec team"
              />
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setSuggesting(false)} disabled={busy}>
                Cancel
              </Button>
              <Button size="sm" onClick={suggest} disabled={busy || !name.trim()}>
                {busy ? "Adding…" : canWrite ? "Add activity" : "Send suggestion"}
              </Button>
            </div>
          </div>
        ) : null}

        {notice ? <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-400">{notice}</p> : null}
        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
      </div>

      {live.length === 0 ? (
        <p className={clsx(CARD, "text-sm text-brand-grey dark:text-slate-400")}>
          No activities yet. Suggest one, or import a planning meeting and let the reader find them.
        </p>
      ) : (
        live.map((a) => (
          <ActivityCard
            key={a.id}
            activity={a}
            canWrite={canWrite}
            ownerListId={ownerListId}
            hunt={a.kind === "SCAVENGER_HUNT" ? { open: openHunt, toggle: () => setOpenHunt((v) => !v), admin: huntAdmin } : null}
          />
        ))
      )}

      {dropped.length ? (
        <div>
          <button
            type="button"
            onClick={() => setShowDropped((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400"
            aria-expanded={showDropped}
          >
            {showDropped ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            Dropped ({dropped.length})
          </button>
          {showDropped ? (
            <div className="mt-2 space-y-3">
              {dropped.map((a) => (
                <ActivityCard key={a.id} activity={a} canWrite={canWrite} ownerListId={ownerListId} hunt={null} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {canWrite ? (
        <MeetingImportModal
          open={importing}
          onClose={() => setImporting(false)}
          eventId={eventId}
          ownerListId={ownerListId}
          withActivities
          onSaved={(tasks, acts) => {
            setNotice(
              `Saved ${acts} activit${acts === 1 ? "y" : "ies"} and ${tasks} to-do${tasks === 1 ? "" : "s"} (see To-dos) from the meeting.`
            );
            router.refresh();
          }}
        />
      ) : null}
    </section>
  );
}

function ActivityCard({
  activity: a,
  canWrite,
  ownerListId,
  hunt
}: {
  activity: ActivityView;
  canWrite: boolean;
  ownerListId: string;
  hunt: { open: boolean; toggle: () => void; admin: ReactNode } | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(a.status);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setError(null);
    const result = await send(`/api/events/activities/${a.id}`, body, "PATCH");
    if (!result.ok) setError(result.message ?? "Could not save.");
    router.refresh();
  }

  async function addNote() {
    setBusy(true);
    setError(null);
    const result = await send(`/api/events/activities/${a.id}/comments`, { body: note });
    setBusy(false);
    if (!result.ok) {
      setError(result.message ?? "Could not save that note.");
      return;
    }
    setNote("");
    router.refresh();
  }

  async function remove() {
    if (!window.confirm(`Remove "${a.name}" and its notes?${hunt ? " The hunt itself and its QR codes are not touched." : ""}`)) return;
    const result = await send(`/api/events/activities/${a.id}`, null, "DELETE");
    if (!result.ok) setError(result.message ?? "Could not remove it.");
    router.refresh();
  }

  const origin = a.meetingTitle ? `From the meeting "${a.meetingTitle}"` : a.suggestedBy ? `Suggested by ${a.suggestedBy}` : null;

  return (
    <article className={clsx(CARD, status === "DROPPED" && "opacity-70")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-brand-lea dark:text-slate-100">{a.name}</h3>
          {origin ? (
            <p className="text-xs text-brand-grey dark:text-slate-400">
              {origin} · {fmt(a.createdAt)}
            </p>
          ) : null}
        </div>
        {canWrite ? (
          // Selected = navy with a gold ring, the app's selected state.
          <div role="radiogroup" aria-label="Status" className="flex flex-wrap gap-1">
            {ACTIVITY_STATUSES.map((s) => {
              const on = status === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    setStatus(s.value);
                    void patch({ status: s.value });
                  }}
                  className={clsx(
                    "rounded px-2.5 py-1 text-xs font-semibold transition hover:shadow-glow",
                    on
                      ? "bg-brand-lea text-white ring-1 ring-brand-gold"
                      : "bg-brand-cloudDancer/60 text-brand-lea dark:bg-white/10 dark:text-slate-200"
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : (
          <span className="rounded bg-brand-cloudDancer/60 px-2.5 py-1 text-xs font-semibold text-brand-lea dark:bg-white/10 dark:text-slate-200">
            {activityStatusLabel(status)}
          </span>
        )}
      </div>

      {a.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-brand-lea dark:text-slate-200">{a.description}</p> : null}

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {canWrite ? (
          <label className="block w-full sm:w-64">
            <span className={LABEL}>Runs it</span>
            <Input
              className="mt-1"
              list={ownerListId}
              defaultValue={a.owner ?? ""}
              placeholder="Nobody yet"
              onBlur={(e) => {
                if (e.target.value.trim() !== (a.owner ?? "")) void patch({ owner: e.target.value });
              }}
            />
          </label>
        ) : a.owner ? (
          <p className="text-sm text-brand-grey dark:text-slate-400">Runs it: {a.owner}</p>
        ) : null}
        {hunt ? (
          <Button size="sm" variant="secondary" onClick={hunt.toggle} aria-expanded={hunt.open}>
            {hunt.open ? "Hide the hunt" : "Manage the hunt"}
          </Button>
        ) : null}
        {canWrite ? (
          <button type="button" onClick={remove} className="ml-auto text-xs text-red-600 hover:underline dark:text-red-400">
            Remove
          </button>
        ) : null}
      </div>

      {hunt?.open ? (
        <div className="mt-4 border-t border-brand-lea/10 pt-4 dark:border-white/10">
          {hunt.admin ?? <p className="text-sm text-brand-grey dark:text-slate-400">Only people who can edit events can run the hunt.</p>}
        </div>
      ) : null}

      {/* Notes: anyone who can see events can leave one. */}
      <div className="mt-4 border-t border-brand-lea/10 pt-3 dark:border-white/10">
        <p className={clsx(LABEL, "flex items-center gap-1")}>
          <MessageSquare className="h-3 w-3" /> Notes {a.comments.length ? `(${a.comments.length})` : ""}
        </p>
        {a.comments.length ? (
          <ul className="mt-2 space-y-2">
            {a.comments.map((c) => (
              <li key={c.id} className="rounded bg-brand-cloudDancer/40 px-3 py-2 text-sm dark:bg-white/5">
                <p className="whitespace-pre-wrap text-brand-lea dark:text-slate-200">{c.body}</p>
                <p className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">
                  {c.author ?? "Someone"} · {fmt(c.createdAt)}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-2">
          <Input
            className="min-w-0 flex-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a note or an idea…"
            aria-label={`Add a note to ${a.name}`}
            onKeyDown={(e) => {
              if (e.key === "Enter" && note.trim() && !busy) void addNote();
            }}
          />
          <Button size="sm" variant="secondary" onClick={addNote} disabled={busy || !note.trim()}>
            Add note
          </Button>
        </div>
      </div>

      {error ? <p className="mt-2 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
    </article>
  );
}
