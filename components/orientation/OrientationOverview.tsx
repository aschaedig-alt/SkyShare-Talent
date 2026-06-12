"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type { SessionListItem } from "@/lib/data/orientation";

function fmt(iso: string) {
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}
function daysUntil(iso: string) {
  const d = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (d < 0) return `${Math.abs(d)}d ago`;
  if (d === 0) return "today";
  return `in ${d}d`;
}

function SessionCard({ s }: { s: SessionListItem }) {
  const soon = new Date(s.date).getTime() - Date.now() <= 7 * 86_400_000 && s.status !== "COMPLETE";
  return (
    <Link
      href={`/orientation/${s.id}`}
      className="block rounded-lg border border-brand-lea/10 bg-white p-4 shadow-panel transition hover:ring-2 hover:ring-brand-gold/30"
    >
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

export function OrientationOverview({ upcoming, past }: { upcoming: SessionListItem[]; past: SessionListItem[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
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

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="flex flex-wrap items-start justify-between gap-3 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">People</p>
          <h1 className="text-2xl font-semibold text-brand-lea">Orientation</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey">Plan each in-person orientation: attendees, prep checklist with owners, headcounts, and email templates.</p>
        </div>
        <button onClick={() => setAdding(true)} className="rounded bg-brand-lea px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-eden">
          + New session
        </button>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-brand-grey">Upcoming</h2>
        {upcoming.length === 0 ? (
          <p className="rounded bg-white p-6 text-center text-sm text-brand-grey shadow-panel ring-1 ring-brand-lea/10">No upcoming sessions. Create one to get started.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((s) => <SessionCard key={s.id} s={s} />)}
          </div>
        )}
      </section>

      {past.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.14em] text-brand-grey">Past</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {past.map((s) => <SessionCard key={s.id} s={s} />)}
          </div>
        </section>
      ) : null}

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
