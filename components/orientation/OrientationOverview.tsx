"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type { Cohort, CalendarDay, SessionListItem } from "@/lib/data/orientation";

function fmt(iso: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}
function daysUntil(iso: string) {
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return "today";
  return `in ${d}d`;
}
const pad = (n: number) => String(n).padStart(2, "0");

function SessionCard({ s }: { s: SessionListItem }) {
  const soon = new Date(s.date).getTime() - Date.now() <= 7 * 86_400_000 && s.status !== "COMPLETE";
  return (
    <Link href={`/orientation/${s.id}`} className="block rounded-lg border border-brand-lea/10 bg-white p-4 shadow-panel transition hover:ring-2 hover:ring-brand-gold/30">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold text-brand-lea">{fmt(s.date)}</span>
        <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-semibold", s.status === "COMPLETE" ? "bg-emerald-50 text-emerald-800" : soon ? "bg-brand-gold/15 text-brand-lea" : "bg-brand-cloudDancer text-brand-grey")}>
          {s.status === "COMPLETE" ? "Complete" : daysUntil(s.date)}
        </span>
      </div>
      <div className="mt-1 text-xs text-brand-grey">{s.location ?? "—"}</div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-brand-grey">
        <span>{s.attendeeCount} attendees</span>
        <span>prep {s.prepDone}/{s.prepTotal}</span>
      </div>
      {(s.notConfirmed > 0 || s.travelPending > 0) && s.status !== "COMPLETE" ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {s.notConfirmed > 0 ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">{s.notConfirmed} not confirmed</span> : null}
          {s.travelPending > 0 ? <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[11px] font-semibold text-brand-lea">{s.travelPending} travel pending</span> : null}
        </div>
      ) : null}
    </Link>
  );
}

function MiniMonth({ year, month, markers }: { year: number; month: number; markers: Map<string, CalendarDay> }) {
  const startDow = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  const monthName = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month, 1)));
  return (
    <div className="rounded-lg border border-brand-lea/10 bg-white p-3 shadow-panel">
      <div className="mb-2 text-sm font-semibold text-brand-lea">{monthName}</div>
      <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-brand-grey">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = `${year}-${pad(month + 1)}-${pad(d)}`;
          const m = markers.get(key);
          const content = (
            <div className={clsx("flex h-7 flex-col items-center justify-center rounded", m ? "bg-brand-gold/15" : "")}>
              <span className={clsx("text-[11px]", m ? "font-semibold text-brand-lea" : "text-brand-black")}>{d}</span>
              {m ? (
                <span className="flex items-center gap-0.5">
                  {m.hireCount > 0 ? <span className="text-[8px] font-bold text-brand-lea">{m.hireCount}</span> : null}
                  {m.sessionId ? <span className="h-1 w-1 rounded-full bg-emerald-500" /> : null}
                </span>
              ) : null}
            </div>
          );
          return m?.sessionId ? <Link key={i} href={`/orientation/${m.sessionId}`}>{content}</Link> : <div key={i}>{content}</div>;
        })}
      </div>
    </div>
  );
}

function CohortCard({ c, onCreate, onAddMissing, busy }: { c: Cohort; onCreate: (c: Cohort) => void; onAddMissing: (c: Cohort) => void; busy: boolean }) {
  return (
    <div className="rounded-lg border border-brand-lea/10 bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-base font-semibold text-brand-lea">{fmtDay(c.dateISO)}</span>
        <span className="text-xs text-brand-grey">{c.hires.length} {c.hires.length === 1 ? "hire" : "hires"} · {daysUntil(c.dateISO)}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {c.hires.map((h) => (
          <span key={h.id} className={clsx("rounded-full px-2 py-0.5 text-[11px]", h.isAttendee ? "bg-emerald-50 text-emerald-800" : "bg-brand-cloudDancer text-brand-grey")}>
            {h.name}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {c.sessionId ? (
          <>
            <Link href={`/orientation/${c.sessionId}`} className="rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden">Open session</Link>
            {c.missingHireIds.length > 0 ? (
              <button onClick={() => onAddMissing(c)} disabled={busy} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50">
                Add {c.missingHireIds.length} to session
              </button>
            ) : (
              <span className="text-xs text-emerald-700">All linked to the session</span>
            )}
          </>
        ) : (
          <button onClick={() => onCreate(c)} disabled={busy} className="rounded bg-brand-lea px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">
            Create session + add all {c.hires.length}
          </button>
        )}
      </div>
    </div>
  );
}

export function OrientationOverview({
  upcoming,
  past,
  cohorts,
  calendar
}: {
  upcoming: SessionListItem[];
  past: SessionListItem[];
  cohorts: Cohort[];
  calendar: CalendarDay[];
}) {
  const router = useRouter();
  const [view, setView] = useState<"sessions" | "cohorts">("sessions");
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ date: "", time: "09:00", location: "SkyShare HQ, Salt Lake City", address: "", meetLink: "" });

  async function create() {
    if (!form.date) {
      setError("Pick a date.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const iso = new Date(`${form.date}T${form.time || "09:00"}:00`).toISOString();
      const res = await fetch("/api/orientation/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: iso, location: form.location, address: form.address, meetLink: form.meetLink })
      });
      const p = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (!res.ok || !p?.id) throw new Error(p?.message ?? "Unable to create session.");
      router.push(`/orientation/${p.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to create session.");
      setSaving(false);
    }
  }

  async function createFromCohort(c: Cohort) {
    setBusy(true);
    try {
      const res = await fetch("/api/orientation/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: c.dateISO, attendeeHireIds: c.hires.map((h) => h.id) })
      });
      const p = (await res.json().catch(() => null)) as { id?: string } | null;
      if (p?.id) router.push(`/orientation/${p.id}`);
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  async function addMissing(c: Cohort) {
    if (!c.sessionId) return;
    setBusy(true);
    for (const newHireId of c.missingHireIds) {
      await fetch(`/api/orientation/sessions/${c.sessionId}/attendees`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newHireId })
      });
    }
    setBusy(false);
    router.refresh();
  }

  // Months to render in the calendar (current month through the latest marker, capped at 4).
  const monthsSet = new Set<string>();
  const now = new Date();
  monthsSet.add(`${now.getUTCFullYear()}-${now.getUTCMonth()}`);
  for (const c of calendar) {
    const d = new Date(c.dateISO);
    monthsSet.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}`);
  }
  const months = [...monthsSet]
    .map((s) => s.split("-").map(Number) as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .slice(0, 4);
  const markerMap = new Map(calendar.map((c) => [c.dateISO.slice(0, 10), c]));

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
          <h1 className="text-2xl font-semibold text-brand-lea">Orientation</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey">Plan each in-person orientation: attendees, prep checklist with owners, headcounts, and email templates.</p>
        </div>
        <button onClick={() => setAdding(true)} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden">+ New session</button>
      </section>

      <div className="border-b border-brand-lea/10">
        <nav className="flex gap-6">
          {([["sessions", "Sessions"], ["cohorts", "Cohorts & calendar"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setView(key)} className={clsx("border-b-2 px-1 py-3 text-sm font-semibold transition", view === key ? "border-brand-lea text-brand-lea" : "border-transparent text-brand-grey hover:text-brand-lea")}>
              {label}
              {key === "cohorts" && cohorts.length > 0 ? <span className="ml-1.5 text-brand-grey">· {cohorts.length}</span> : null}
            </button>
          ))}
        </nav>
      </div>

      {view === "sessions" ? (
        <>
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-brand-grey">Upcoming</h2>
            {upcoming.length === 0 ? (
              <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10">No upcoming sessions. Create one, or use the Cohorts tab to spin one up from pre-onboarding orientation dates.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{upcoming.map((s) => <SessionCard key={s.id} s={s} />)}</div>
            )}
          </section>
          {past.length > 0 ? (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-brand-grey">Past</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{past.map((s) => <SessionCard key={s.id} s={s} />)}</div>
            </section>
          ) : null}
        </>
      ) : (
        <>
          <section>
            <div className="mb-2 flex items-center gap-3">
              <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-brand-grey">Calendar</h2>
              <span className="flex items-center gap-1 text-[11px] text-brand-grey"><span className="inline-block h-2 w-2 rounded bg-brand-gold/40" /> orientation date</span>
              <span className="flex items-center gap-1 text-[11px] text-brand-grey"><span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" /> session</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {months.map(([y, m]) => <MiniMonth key={`${y}-${m}`} year={y} month={m} markers={markerMap} />)}
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-brand-grey">Cohorts by orientation date</h2>
            {cohorts.length === 0 ? (
              <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10">No active hires have an orientation date set yet. Set one on a hire in Pre-onboarding and they&apos;ll group here.</p>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {cohorts.map((c) => <CohortCard key={c.dateISO} c={c} onCreate={createFromCohort} onAddMissing={addMissing} busy={busy} />)}
              </div>
            )}
          </section>
        </>
      )}

      {adding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !saving && setAdding(false)} />
          <div className="relative w-full max-w-md rounded bg-white p-5 shadow-2xl">
            <h2 className="text-lg font-semibold text-brand-lea">New orientation session</h2>
            <div className="mt-4 space-y-3">
              <div className="flex gap-3">
                <label className="flex-1 text-xs font-semibold uppercase tracking-wide text-brand-grey">
                  Date
                  <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="mt-1 w-full rounded border border-brand-lea/15 px-3 py-2 text-sm text-brand-lea" />
                </label>
                <label className="w-28 text-xs font-semibold uppercase tracking-wide text-brand-grey">
                  Time
                  <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="mt-1 w-full rounded border border-brand-lea/15 px-3 py-2 text-sm text-brand-lea" />
                </label>
              </div>
              <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Location" className="w-full rounded border border-brand-lea/15 px-3 py-2 text-sm" />
              <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Address" className="w-full rounded border border-brand-lea/15 px-3 py-2 text-sm" />
              <input value={form.meetLink} onChange={(e) => setForm({ ...form, meetLink: e.target.value })} placeholder="Google Meet link" className="w-full rounded border border-brand-lea/15 px-3 py-2 text-sm" />
              {error ? <p className="text-sm font-medium text-red-700">{error}</p> : null}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setAdding(false)} disabled={saving} className="rounded border border-brand-lea/20 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60">Cancel</button>
              <button onClick={create} disabled={saving} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">{saving ? "Creating..." : "Create session"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
