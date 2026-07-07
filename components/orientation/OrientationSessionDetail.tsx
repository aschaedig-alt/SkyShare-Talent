"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import type { AttendeeView, ConfirmStatus, PrepTaskView, SessionDetail, TravelStatus } from "@/lib/data/orientation";
import type { EmailTemplateDef } from "@/lib/orientation/defaults";
import { formatUsd } from "@/lib/travel/constants";
import { formatDateLong, formatTime, zoneLabel, toMountainDateTimeParts, mountainWallClockToIso } from "@/lib/calendar/format";

function fmtShort(iso: string) {
  // Always Mountain Time, regardless of the viewer's / server's zone.
  return formatDateLong(iso);
}
function fmtTime(iso: string) {
  return `${formatTime(iso)} ${zoneLabel()}`;
}

async function patchJson(url: string, body: unknown, method = "PATCH") {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return res.ok;
}

export function OrientationSessionDetail({ session }: { session: SessionDetail }) {
  const router = useRouter();
  const [attendees, setAttendees] = useState(session.attendees);
  const [prep, setPrep] = useState(session.prepTasks);
  const [busy, setBusy] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [resched, setResched] = useState({ date: "", time: "" });
  const [savingDate, setSavingDate] = useState(false);

  function openReschedule() {
    setResched(toMountainDateTimeParts(session.date));
    setRescheduling(true);
  }
  async function saveReschedule() {
    const iso = mountainWallClockToIso(resched.date, resched.time);
    if (!iso) return;
    setSavingDate(true);
    const ok = await patchJson(`/api/orientation/sessions/${session.id}`, { date: iso });
    setSavingDate(false);
    if (ok) {
      setRescheduling(false);
      router.refresh();
    }
  }

  const headDone = prep.filter((p) => p.done).length;
  const headcount = {
    total: attendees.length,
    outOfTown: attendees.filter((a) => a.travelStatus !== "NA").length,
    pilots: attendees.filter((a) => a.isPilot).length,
    confirmed: attendees.filter((a) => a.confirmed === "CONFIRMED").length
  };
  // Live travel roll-up from each attendee's real trips.
  const travelRollup = {
    traveling: attendees.filter((a) => a.travel.tripCount > 0 || a.travelStatus !== "NA").length,
    booked: attendees.filter((a) => a.travel.status === "BOOKED").length,
    totalCost: attendees.reduce((sum, a) => sum + a.travel.total, 0)
  };

  // ---- prep ----
  async function togglePrep(id: string, done: boolean) {
    setPrep((cur) => cur.map((p) => (p.id === id ? { ...p, done } : p)));
    await patchJson(`/api/orientation/prep-tasks/${id}`, { done });
  }
  async function removePrep(id: string) {
    setPrep((cur) => cur.filter((p) => p.id !== id));
    await patchJson(`/api/orientation/prep-tasks/${id}`, null, "DELETE");
  }
  const [newPrep, setNewPrep] = useState("");
  async function addPrep() {
    if (!newPrep.trim()) return;
    setBusy(true);
    await patchJson("/api/orientation/prep-tasks", { sessionId: session.id, label: newPrep }, "POST");
    setNewPrep("");
    setBusy(false);
    router.refresh();
  }

  // ---- attendees ----
  function updateAttendee(id: string, patch: Partial<AttendeeView>) {
    setAttendees((cur) => cur.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }
  async function setConfirm(a: AttendeeView, v: ConfirmStatus) {
    updateAttendee(a.id, { confirmed: v });
    await patchJson(`/api/orientation/attendees/${a.id}`, { confirmed: v });
  }
  async function setTravel(a: AttendeeView, v: TravelStatus) {
    updateAttendee(a.id, { travelStatus: v });
    await patchJson(`/api/orientation/attendees/${a.id}`, { travelStatus: v });
  }
  async function toggleFlag(a: AttendeeView, field: "ipadReady" | "cardReady" | "swagReady") {
    const v = !a[field];
    updateAttendee(a.id, { [field]: v } as Partial<AttendeeView>);
    await patchJson(`/api/orientation/attendees/${a.id}`, { [field]: v });
  }
  async function removeAttendee(id: string) {
    setAttendees((cur) => cur.filter((a) => a.id !== id));
    await patchJson(`/api/orientation/attendees/${id}`, null, "DELETE");
    router.refresh();
  }
  async function moveAttendee(id: string, toSessionId: string) {
    if (!toSessionId) return;
    setAttendees((cur) => cur.filter((a) => a.id !== id));
    await fetch(`/api/orientation/attendees/${id}/move`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toSessionId }) });
    router.refresh();
  }
  // One-click: move to the next scheduled orientation, or — if none yet — drop
  // them to the waiting list so they resurface to be added once one is created.
  async function moveToNext(a: AttendeeView) {
    if (session.nextSessionId) {
      await moveAttendee(a.id, session.nextSessionId);
    } else {
      await removeAttendee(a.id);
      setNotice(`No upcoming orientation yet — ${a.name} is on the waiting list (People → Orientation) and will show under Suggested when you create the next session.`);
      setTimeout(() => setNotice(null), 8000);
    }
  }
  const [notice, setNotice] = useState<string | null>(null);
  const [addId, setAddId] = useState("");
  async function addAttendee() {
    if (!addId) return;
    setBusy(true);
    await patchJson(`/api/orientation/sessions/${session.id}/attendees`, { newHireId: addId }, "POST");
    setAddId("");
    setBusy(false);
    router.refresh();
  }

  async function markComplete() {
    if (!confirm("Mark this orientation complete? This ticks 'Attended orientation' for all attendees.")) return;
    setBusy(true);
    await patchJson(`/api/orientation/sessions/${session.id}`, { status: "COMPLETE" });
    router.refresh();
  }

  // ---- email send tracker ----
  async function toggleEmail(a: AttendeeView, key: string) {
    const sent = a.sentTemplateKeys.includes(key);
    const next = sent ? a.sentTemplateKeys.filter((k) => k !== key) : [...a.sentTemplateKeys, key];
    updateAttendee(a.id, { sentTemplateKeys: next });
    await patchJson(`/api/orientation/attendees/${a.id}`, sent ? { markUnsent: key } : { markSent: key });
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <Link href="/orientation" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400">← Orientation</Link>

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Orientation · {fmtShort(session.date)}</h1>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              {fmtTime(session.date)} · {session.location ?? "—"}
              {session.address ? ` · ${session.address}` : ""}
              {session.address ? <> · <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(session.address)}`} target="_blank" rel="noreferrer" className="text-brand-lea underline dark:text-slate-100">Map</a></> : null}
              {session.meetLink ? <> · <a href={session.meetLink} target="_blank" rel="noreferrer" className="text-brand-lea underline dark:text-slate-100">Meet link</a></> : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => (rescheduling ? setRescheduling(false) : openReschedule())} className="rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">
              {rescheduling ? "Cancel" : "Reschedule"}
            </button>
            {session.status === "COMPLETE" ? (
              <span className="rounded bg-emerald-50 dark:bg-emerald-500/15 px-3 py-1 text-sm font-semibold text-emerald-800 dark:text-emerald-300">Complete</span>
            ) : (
              <Button onClick={markComplete} disabled={busy}>Mark complete</Button>
            )}
          </div>
        </div>

        {rescheduling ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 rounded border border-brand-lea/15 bg-brand-cloudDancer/40 p-3 dark:border-white/10 dark:bg-white/5">
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">New date</span>
              <input type="date" value={resched.date} onChange={(e) => setResched({ ...resched, date: e.target.value })} className="mt-1 block rounded border border-brand-lea/20 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100" />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Time (MT)</span>
              <input type="time" value={resched.time} onChange={(e) => setResched({ ...resched, time: e.target.value })} className="mt-1 block rounded border border-brand-lea/20 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100" />
            </label>
            <Button onClick={saveReschedule} disabled={savingDate || !resched.date}>
              {savingDate ? "Saving…" : "Save new date"}
            </Button>
            <span className="text-xs text-brand-grey dark:text-slate-400">Attendees keep their spots; this only moves the session date/time.</span>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            ["Attendees", headcount.total],
            ["Confirmed", `${headcount.confirmed}/${headcount.total}`],
            ["Out-of-town · travel", headcount.outOfTown],
            ["Travel booked", `${travelRollup.booked}/${travelRollup.traveling}`],
            ["Travel spend", formatUsd(travelRollup.totalCost)],
            ["Pilots · iPads", headcount.pilots],
            ["Prep", `${headDone}/${prep.length}`]
          ].map(([label, val]) => (
            <span key={String(label)} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-1 text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
              <span className="font-semibold">{val}</span> <span className="text-brand-grey dark:text-slate-400">{label}</span>
            </span>
          ))}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        {/* Prep checklist */}
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Prep checklist</h2>
          <div className="mt-3 space-y-1">
            {prep.map((t) => (
              <PrepRow key={t.id} t={t} onToggle={togglePrep} onRemove={removePrep} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <input value={newPrep} onChange={(e) => setNewPrep(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPrep()} placeholder="Add a prep task" className="flex-1 rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10" />
            <button onClick={addPrep} disabled={busy} className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">Add</button>
          </div>
        </section>

        {/* Attendees */}
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Attendees</h2>
          {notice ? (
            <p className="mt-2 rounded border border-brand-gold/30 bg-brand-gold/10 px-3 py-2 text-xs text-brand-lea dark:text-slate-100">{notice}</p>
          ) : null}
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                  <th className="py-2 pr-2">Name</th>
                  <th className="px-1 py-2">Confirm</th>
                  <th className="px-1 py-2">Travel</th>
                  <th className="px-1 py-2 text-center">iPad</th>
                  <th className="px-1 py-2 text-center">Card</th>
                  <th className="px-1 py-2 text-center">Swag</th>
                  <th className="px-1 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {attendees.length === 0 ? (
                  <tr><td colSpan={7} className="py-4 text-center text-brand-grey dark:text-slate-400">No attendees yet. Add from the list below.</td></tr>
                ) : attendees.map((a) => (
                  <tr key={a.id} className="border-t border-brand-lea/10 dark:border-white/10">
                    <td className="py-2 pr-2">
                      <div className="font-medium text-brand-lea dark:text-slate-100">
                        {a.name}
                        {a.isPilot ? <span className="ml-1 rounded bg-sky-50 dark:bg-sky-500/15 px-1 text-[9px] font-semibold text-sky-700 dark:text-sky-300">pilot</span> : null}
                        {a.rescheduleCount > 0 ? <span className="ml-1 rounded bg-brand-gold/15 px-1 text-[9px] font-semibold text-brand-lea dark:text-slate-100" title="Times moved to a later orientation">moved {a.rescheduleCount}×</span> : null}
                      </div>
                      <div className="text-[10px] text-brand-grey dark:text-slate-400">{a.position ?? "—"}</div>
                    </td>
                    <td className="px-1 py-2">
                      <select value={a.confirmed} onChange={(e) => setConfirm(a, e.target.value as ConfirmStatus)} className={clsx("rounded border px-1 py-0.5 text-[11px] font-semibold", a.confirmed === "CONFIRMED" ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" : a.confirmed === "TENTATIVE" ? "border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300" : a.confirmed === "DECLINED" ? "border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/15 text-red-700 dark:text-red-300" : "border-brand-lea/15 bg-white text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400")}>
                        <option value="PENDING">Pending</option>
                        <option value="TENTATIVE">Tentative</option>
                        <option value="CONFIRMED">Confirmed</option>
                        <option value="DECLINED">Declined</option>
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      {a.travel.tripCount > 0 ? (
                        <Link
                          href={`/people/${a.newHireId}`}
                          title={`${a.travel.tripCount} trip${a.travel.tripCount === 1 ? "" : "s"} — view / edit travel`}
                          className={clsx(
                            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold transition hover:shadow-glow",
                            a.travel.status === "BOOKED"
                              ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                              : "border-brand-gold/40 bg-brand-gold/15 text-brand-lea"
                          )}
                        >
                          {a.travel.status === "BOOKED" ? "Booked" : "Needed"}
                          {a.travel.total > 0 ? ` · ${formatUsd(a.travel.total)}` : ""}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select value={a.travelStatus} onChange={(e) => setTravel(a, e.target.value as TravelStatus)} className={clsx("rounded border px-1 py-0.5 text-[11px] font-semibold", a.travelStatus === "ARRANGED" ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" : a.travelStatus === "NEEDED" ? "border-brand-gold/40 bg-brand-gold/15 text-brand-lea" : "border-brand-lea/15 bg-white text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400")}>
                            <option value="NA">Local</option>
                            <option value="NEEDED">Needed</option>
                            <option value="ARRANGED">Arranged</option>
                          </select>
                          <Link href={`/people/${a.newHireId}`} className="text-[10px] font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400" title="Add travel for this hire">
                            +add
                          </Link>
                        </div>
                      )}
                    </td>
                    <td className="px-1 py-2 text-center">{a.isPilot ? <Flag on={a.ipadReady} onClick={() => toggleFlag(a, "ipadReady")} /> : <span className="text-brand-grey/40">—</span>}</td>
                    <td className="px-1 py-2 text-center"><Flag on={a.cardReady} onClick={() => toggleFlag(a, "cardReady")} /></td>
                    <td className="px-1 py-2 text-center"><Flag on={a.swagReady} onClick={() => toggleFlag(a, "swagReady")} /></td>
                    <td className="px-1 py-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => moveToNext(a)}
                          title={session.nextSessionId ? "Move to the next scheduled orientation" : "No next orientation yet — moves them to the waiting list"}
                          className="inline-flex items-center gap-0.5 whitespace-nowrap rounded border border-brand-lea/15 bg-white px-1.5 py-0.5 text-[11px] font-semibold text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
                        >
                          Move to next →
                        </button>
                        {session.otherSessions.length > 0 ? (
                          <select
                            value=""
                            onChange={(e) => moveAttendee(a.id, e.target.value)}
                            title="Move to a specific orientation"
                            className="rounded border border-brand-lea/15 bg-white px-1 py-0.5 text-[11px] text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
                          >
                            <option value="">Move to…</option>
                            {session.otherSessions.map((o) => (
                              <option key={o.id} value={o.id}>→ {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(o.date))}</option>
                            ))}
                          </select>
                        ) : null}
                        <button onClick={() => removeAttendee(a.id)} className="text-[11px] text-red-600 hover:underline">remove</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <select value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1 rounded border border-brand-lea/15 px-2 py-1.5 text-sm text-brand-lea dark:border-white/10 dark:text-slate-100">
              <option value="">Add attendee…</option>
              {session.candidates.filter((c) => c.suggested).length > 0 ? (
                <optgroup label="Suggested · in pre-onboarding, not yet attended">
                  {session.candidates.filter((c) => c.suggested).map((c) => <option key={c.id} value={c.id}>{c.name}{c.position ? ` · ${c.position}` : ""}</option>)}
                </optgroup>
              ) : null}
              <optgroup label="All employees">
                {session.candidates.filter((c) => !c.suggested).map((c) => <option key={c.id} value={c.id}>{c.name}{c.position ? ` · ${c.position}` : ""}</option>)}
              </optgroup>
            </select>
            <button onClick={addAttendee} disabled={busy || !addId} className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50">Add</button>
          </div>
        </section>
      </div>

      {/* Email send tracker */}
      {attendees.length > 0 ? (
        <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Who&apos;s been emailed</h2>
          <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">Check a box when you send that email (via Front) so you can see who has what. Live sending is coming later.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                  <th className="py-2 pr-3">Attendee</th>
                  {session.templates.map((t) => <th key={t.key} className="px-2 py-2 text-center" style={{ minWidth: 70 }}>{t.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {attendees.map((a) => (
                  <tr key={a.id} className="border-t border-brand-lea/10 dark:border-white/10">
                    <td className="py-2 pr-3 font-medium text-brand-lea dark:text-slate-100">{a.name}</td>
                    {session.templates.map((t) => {
                      const sent = a.sentTemplateKeys.includes(t.key);
                      return (
                        <td key={t.key} className="px-2 py-2 text-center">
                          <button onClick={() => toggleEmail(a, t.key)} aria-label={sent ? "Mark as not sent" : "Mark as sent"} className="inline-flex items-center justify-center transition hover:shadow-glow">
                            {sent ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> : <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/30" />}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <EmailTemplates templates={session.templates} session={session} />
    </div>
  );
}

function Flag({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center justify-center transition hover:shadow-glow" title={on ? "Ready — click to unset" : "Not ready"}>
      {on ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> : <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/30" />}
    </button>
  );
}

function PrepRow({ t, onToggle, onRemove }: { t: PrepTaskView; onToggle: (id: string, done: boolean) => void; onRemove: (id: string) => void }) {
  return (
    <div className="group flex items-center gap-2 border-b border-brand-lea/5 py-1.5 dark:border-white/10">
      <button onClick={() => onToggle(t.id, !t.done)} aria-label={t.done ? "Mark not done" : "Mark done"} className="shrink-0">
        {t.done ? <span className="text-emerald-600"><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#d1fae5" /><path d="M5 8.5 L7 10.5 L11 6" fill="none" stroke="#059669" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span> : <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/40" />}
      </button>
      <span className={clsx("flex-1 text-[12.5px]", t.done ? "text-brand-grey line-through dark:text-slate-400" : "text-brand-black")}>{t.label}</span>
      {t.owner ? <span className="rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[10px] text-brand-grey dark:bg-white/5 dark:text-slate-400">{t.owner}</span> : null}
      {t.dueDaysBefore != null && !t.done ? <span className="text-[10px] text-brand-grey dark:text-slate-400">{t.dueDaysBefore}d before</span> : null}
      <button onClick={() => onRemove(t.id)} className="text-[11px] text-red-600 opacity-0 transition group-hover:opacity-100">×</button>
    </div>
  );
}

function fillPlaceholders(text: string, session: SessionDetail) {
  return text
    .replace(/\{\{date\}\}/g, fmtShort(session.date))
    .replace(/\{\{time\}\}/g, fmtTime(session.date))
    .replace(/\{\{location\}\}/g, session.location ?? "")
    .replace(/\{\{address\}\}/g, session.address ?? "")
    .replace(/\{\{meetLink\}\}/g, session.meetLink ?? "");
}

function EmailTemplates({ templates, session }: { templates: EmailTemplateDef[]; session: SessionDetail }) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", subject: "", body: "" });

  async function save(key: string, name: string, subject: string, body: string) {
    setBusy(true);
    await patchJson("/api/orientation/templates", { key, name, subject, body });
    setBusy(false);
    router.refresh();
  }
  async function remove(key: string) {
    setBusy(true);
    await patchJson(`/api/orientation/templates?key=${encodeURIComponent(key)}`, null, "DELETE");
    setBusy(false);
    router.refresh();
  }
  async function add() {
    if (!draft.name.trim()) return;
    setBusy(true);
    await patchJson("/api/orientation/templates", draft, "POST");
    setDraft({ name: "", subject: "", body: "" });
    setAdding(false);
    setBusy(false);
    router.refresh();
  }
  function copy(t: EmailTemplateDef) {
    const text = `Subject: ${fillPlaceholders(t.subject, session)}\n\n${fillPlaceholders(t.body, session)}`;
    navigator.clipboard?.writeText(text);
    setCopied(t.key);
    setTimeout(() => setCopied((c) => (c === t.key ? null : c)), 1500);
  }

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Email templates</h2>
        <button onClick={() => setAdding((a) => !a)} className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">{adding ? "Cancel" : "+ Add template"}</button>
      </div>
      <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">Placeholders: {"{{name}} {{date}} {{time}} {{location}} {{address}} {{meetLink}}"}. Copy fills the session details; replace {"{{name}}"} per person.</p>

      {adding ? (
        <div className="mt-3 space-y-2 rounded border border-brand-lea/10 p-3 dark:border-white/10">
          <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Template name" className="w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10" />
          <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="Subject" className="w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10" />
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder="Body" rows={4} className="w-full rounded border border-brand-lea/15 px-3 py-2 text-sm dark:border-white/10" />
          <button onClick={add} disabled={busy} className="rounded bg-brand-lea px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-60">Add template</button>
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {templates.map((t) => (
          <div key={t.key} className="rounded border border-brand-lea/10 dark:border-white/10">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <button onClick={() => setOpenKey((k) => (k === t.key ? null : t.key))} className="flex items-center gap-2 text-left text-sm font-medium text-brand-lea transition hover:shadow-glow dark:text-slate-100">
                <span className="text-brand-grey dark:text-slate-400">{openKey === t.key ? "▾" : "▸"}</span> {t.name}
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => copy(t)} className="text-xs font-semibold text-brand-lea hover:underline dark:text-slate-100">{copied === t.key ? "Copied!" : "Copy"}</button>
                <button onClick={() => remove(t.key)} className="text-xs text-red-600 hover:underline">Remove</button>
              </div>
            </div>
            {openKey === t.key ? <TemplateEditor t={t} onSave={save} busy={busy} /> : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function TemplateEditor({ t, onSave, busy }: { t: EmailTemplateDef; onSave: (key: string, name: string, subject: string, body: string) => void; busy: boolean }) {
  const [name, setName] = useState(t.name);
  const [subject, setSubject] = useState(t.subject);
  const [body, setBody] = useState(t.body);
  const dirty = name !== t.name || subject !== t.subject || body !== t.body;
  return (
    <div className="space-y-2 border-t border-brand-lea/10 px-3 py-3 dark:border-white/10">
      <input value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10" />
      <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full rounded border border-brand-lea/15 px-3 py-2 font-mono text-xs dark:border-white/10" />
      <button onClick={() => onSave(t.key, name, subject, body)} disabled={busy || !dirty} className="rounded bg-brand-lea px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-40">Save</button>
    </div>
  );
}
