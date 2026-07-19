"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { CalendarRange, MapPin, Package, Users } from "lucide-react";
import { Badge, Button, EmptyState, Input, Modal } from "@/components/ui";
import { EVENT_TYPES, eventStatusLabel, eventTypeLabel } from "@/lib/events/constants";
import type { EventListItem, PersonRef } from "@/lib/data/events";

type EventsOverviewProps = {
  upcoming: EventListItem[];
  past: EventListItem[];
  reorderCount: number;
  roster: PersonRef[];
};

const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const LABEL = "text-xs font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400";

function statusTone(status: string) {
  if (status === "CONFIRMED") return "success" as const;
  if (status === "COMPLETE") return "info" as const;
  if (status === "CANCELED") return "danger" as const;
  return "neutral" as const;
}

function dateRange(startsAt: string, endsAt: string | null) {
  const start = new Date(startsAt);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (!endsAt) return start.toLocaleDateString(undefined, opts);
  const end = new Date(endsAt);
  if (start.toDateString() === end.toDateString()) return start.toLocaleDateString(undefined, opts);
  const sameYear = start.getFullYear() === end.getFullYear();
  const startText = start.toLocaleDateString(undefined, sameYear ? { month: "short", day: "numeric" } : opts);
  return `${startText} – ${end.toLocaleDateString(undefined, opts)}`;
}

function place(e: EventListItem) {
  const parts = [e.venue, [e.city, e.state].filter(Boolean).join(", ")].filter(Boolean);
  return parts.join(" · ") || null;
}

function EventCard({ event }: { event: EventListItem }) {
  return (
    <Link
      href={`/events/${event.id}`}
      className="block rounded border border-brand-lea/10 bg-white p-4 shadow-panel transition-shadow hover:shadow-glow dark:border-white/10 dark:bg-brand-panel"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">{event.name}</p>
          <p className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">{eventTypeLabel(event.type)}</p>
        </div>
        <Badge tone={statusTone(event.status)}>{eventStatusLabel(event.status)}</Badge>
      </div>

      <div className="mt-3 space-y-1 text-xs text-brand-grey dark:text-slate-400">
        <p className="flex items-center gap-1.5">
          <CalendarRange className="h-3.5 w-3.5 shrink-0" />
          {dateRange(event.startsAt, event.endsAt)}
        </p>
        {place(event) ? (
          <p className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{place(event)}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-2 py-0.5 text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
          <Users className="h-3 w-3" />
          <span className="font-semibold">
            {event.confirmedCount}/{event.attendeeCount}
          </span>
          <span className="text-brand-grey dark:text-slate-400">going</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-2 py-0.5 text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
          <Package className="h-3 w-3" />
          <span className="font-semibold">{event.supplyCount}</span>
          <span className="text-brand-grey dark:text-slate-400">supplies</span>
        </span>
        {event.openTaskCount > 0 ? (
          <span className="rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
            {event.openTaskCount} to do
          </span>
        ) : null}
      </div>
      {event.ownerName ? (
        <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">Owner: {event.ownerName}</p>
      ) : null}
    </Link>
  );
}

export function EventsOverview({ upcoming, past, reorderCount, roster }: EventsOverviewProps) {
  const router = useRouter();
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<string>("CAREER_FAIR");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [venue, setVenue] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [ownerId, setOwnerId] = useState("");

  const list = view === "upcoming" ? upcoming : past;

  async function create() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, type, startsAt, endsAt, venue, city, state, ownerId })
      });
      const payload = (await res.json()) as { id?: string; message?: string };
      if (!res.ok || !payload.id) {
        throw new Error(payload?.message ?? "Unable to create the event.");
      }
      router.push(`/events/${payload.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create the event.");
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Recruiting</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Events &amp; Outreach</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
            Career fairs, school visits, and community events: who is going, what we are bringing, what still needs
            doing, and when to reorder the swag.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {reorderCount > 0 ? (
            <Link
              href="/events/supplies"
              className="rounded border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 transition hover:shadow-glow dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300"
            >
              {reorderCount} to reorder
            </Link>
          ) : null}
          <Button onClick={() => setAdding(true)}>+ New event</Button>
        </div>
      </section>

      <div className="border-b border-brand-lea/10 dark:border-white/10">
        <nav className="flex gap-6">
          {([
            ["upcoming", `Upcoming (${upcoming.length})`],
            ["past", `Past (${past.length})`]
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={clsx(
                "border-b-2 px-1 py-3 text-sm font-semibold transition hover:shadow-glow",
                view === key
                  ? "border-brand-lea text-brand-lea dark:border-slate-100 dark:text-slate-100"
                  : "border-transparent text-brand-grey hover:text-brand-lea dark:text-slate-400 dark:hover:text-slate-100"
              )}
            >
              {label}
            </button>
          ))}
        </nav>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<CalendarRange className="h-6 w-6" />}
          title={view === "upcoming" ? "No events on the calendar" : "No past events yet"}
          description={
            view === "upcoming"
              ? "Add the next career fair or school visit to start tracking who is going and what to bring."
              : "Events move here once they are complete or the date has passed."
          }
          action={view === "upcoming" ? <Button size="sm" onClick={() => setAdding(true)}>+ New event</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} busy={saving} maxWidth="max-w-lg">
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">New event</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Name and start date are all you need — the rest can be filled in later.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL}>Event name</span>
            <Input
              className="mt-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="UVU Aviation Career Fair"
            />
          </label>
          <label className="block">
            <span className={LABEL}>Type</span>
            <select className={`mt-1 ${FIELD}`} value={type} onChange={(e) => setType(e.target.value)}>
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Owner</span>
            <select className={`mt-1 ${FIELD}`} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">Unassigned</option>
              {roster.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={LABEL}>Starts</span>
            <Input className="mt-1" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>Ends (optional)</span>
            <Input className="mt-1" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL}>Venue</span>
            <Input className="mt-1" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="UVU Sorensen Center" />
          </label>
          <label className="block">
            <span className={LABEL}>City</span>
            <Input className="mt-1" value={city} onChange={(e) => setCity(e.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>State</span>
            <Input className="mt-1" value={state} onChange={(e) => setState(e.target.value)} placeholder="UT" />
          </label>
        </div>
        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setAdding(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={create} disabled={saving || !name.trim() || !startsAt}>
            {saving ? "Creating…" : "Create event"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
