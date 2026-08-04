"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import { Button } from "@/components/ui";
import type { AttendeeView, ConfirmStatus, PrepTaskView, SessionCandidate, SessionDetail, TravelStatus } from "@/lib/data/orientation";

import { formatUsd } from "@/lib/travel/constants";
import { OrientationEmailPanel } from "./OrientationEmailPanel";
import { OrientationCalendarPanel } from "./OrientationCalendarPanel";
import { formatDateLong, formatTime, formatTimeRange, zoneLabel, toMountainDateTimeParts, mountainWallClockToIso } from "@/lib/calendar/format";
import { formatCalendarDayShort, formatMomentDateShort } from "@/lib/dates/display";

function fmtShort(iso: string) {
  // Always Mountain Time, regardless of the viewer's / server's zone.
  return formatDateLong(iso);
}
function fmtTime(iso: string) {
  return `${formatTime(iso)} ${zoneLabel()}`;
}

/** "Tara Ward · Lead Cabin Attendant · starts Aug 3" — the start date is the
    thing you decide on, so it belongs in the option text, not hidden on a
    profile. Says so explicitly when there is no start date at all. */
function candidateLabel(c: SessionCandidate): string {
  const role = c.position ? ` · ${c.position}` : "";
  const start = c.startDate ? ` · starts ${formatCalendarDayShort(c.startDate)}` : " · no start date";
  // Naming the session they are already on is what makes this row actionable —
  // "already scheduled" alone leaves you having to go and look it up.
  const booked = c.scheduledOn ? ` · already on ${formatCalendarDayShort(c.scheduledOn)}` : "";
  return `${c.name}${role}${start}${booked}`;
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
  const [resched, setResched] = useState({ date: "", time: "", endTime: "" });
  const [savingDate, setSavingDate] = useState(false);
  const [reschedErr, setReschedErr] = useState<string | null>(null);

  // ---- lunch ----
  // The arrival TIME is edited on its own; the date is always the session's own
  // day, so there is no second date field to keep in step (or get wrong).
  const [lunch, setLunch] = useState({
    vendor: session.lunch.vendor ?? "",
    arrivalTime: session.lunch.arrivalAt ? toMountainDateTimeParts(session.lunch.arrivalAt).time : "",
    contactName: session.lunch.contactName ?? "",
    contactPhone: session.lunch.contactPhone ?? "",
    notes: session.lunch.notes ?? ""
  });
  const [lunchFile, setLunchFile] = useState({
    name: session.lunch.fileName,
    sizeBytes: session.lunch.fileSizeBytes
  });
  const [lunchSaved, setLunchSaved] = useState<string | null>(null);
  const [lunchErr, setLunchErr] = useState<string | null>(null);
  const [lunchBusy, setLunchBusy] = useState(false);

  async function saveLunch() {
    setLunchBusy(true);
    setLunchErr(null);
    const sessionDay = toMountainDateTimeParts(session.date).date;
    const ok = await patchJson(`/api/orientation/sessions/${session.id}`, {
      lunchVendor: lunch.vendor,
      lunchContactName: lunch.contactName,
      lunchContactPhone: lunch.contactPhone,
      lunchNotes: lunch.notes,
      // Anchored to the session's own day in Mountain, so a time typed here
      // means what it says on the day rather than in whatever zone the server
      // happens to run in.
      lunchArrivalAt: lunch.arrivalTime ? mountainWallClockToIso(sessionDay, lunch.arrivalTime) : null
    });
    setLunchBusy(false);
    if (ok) {
      setLunchSaved("Saved");
      setTimeout(() => setLunchSaved(null), 2000);
      router.refresh();
    } else {
      setLunchErr("Couldn't save the lunch details.");
    }
  }

  async function uploadLunchFile(file: File) {
    setLunchBusy(true);
    setLunchErr(null);
    const body = new FormData();
    body.append("files", file);
    const res = await fetch(`/api/orientation/sessions/${session.id}/lunch-file`, { method: "POST", body });
    setLunchBusy(false);
    if (res.ok) {
      setLunchFile({ name: file.name, sizeBytes: file.size });
      router.refresh();
    } else {
      const msg = (await res.json().catch(() => null)) as { message?: string } | null;
      setLunchErr(msg?.message ?? "Couldn't upload the confirmation.");
    }
  }

  async function removeLunchFile() {
    setLunchBusy(true);
    const res = await fetch(`/api/orientation/sessions/${session.id}/lunch-file`, { method: "DELETE" });
    setLunchBusy(false);
    if (res.ok) {
      setLunchFile({ name: null, sizeBytes: null });
      router.refresh();
    }
  }

  function openReschedule() {
    const start = toMountainDateTimeParts(session.date);
    setResched({ ...start, endTime: session.endsAt ? toMountainDateTimeParts(session.endsAt).time : "" });
    setReschedErr(null);
    setRescheduling(true);
  }
  async function saveReschedule() {
    const iso = mountainWallClockToIso(resched.date, resched.time);
    if (!iso) return;
    // The end time belongs to the NEW date, so it moves with the session.
    const endIso = resched.endTime ? mountainWallClockToIso(resched.date, resched.endTime) : null;
    if (endIso && new Date(endIso).getTime() <= new Date(iso).getTime()) {
      setReschedErr("The end time has to be after the start time.");
      return;
    }
    setSavingDate(true);
    setReschedErr(null);
    const ok = await patchJson(`/api/orientation/sessions/${session.id}`, { date: iso, endsAt: endIso });
    setSavingDate(false);
    if (ok) {
      setRescheduling(false);
      router.refresh();
    } else {
      setReschedErr("Couldn't save the new date.");
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
  /** Edit an item in place. Changing daysBefore re-sorts the list, because the
      list is ordered by it — that is how you move something up or down. */
  async function editPrep(id: string, patch: { label?: string; owner?: string | null; dueDaysBefore?: number | null }) {
    setPrep((cur) => cur.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    await patchJson(`/api/orientation/prep-tasks/${id}`, patch);
    router.refresh(); // re-sorts server-side when daysBefore changed
  }
  const [newPrep, setNewPrep] = useState({ label: "", owner: "", days: "" });
  async function addPrep() {
    if (!newPrep.label.trim()) return;
    setBusy(true);
    await patchJson(
      "/api/orientation/prep-tasks",
      {
        sessionId: session.id,
        label: newPrep.label,
        owner: newPrep.owner.trim() || undefined,
        dueDaysBefore: newPrep.days.trim() === "" ? undefined : Number(newPrep.days)
      },
      "POST"
    );
    setNewPrep({ label: "", owner: "", days: "" });
    setBusy(false);
    router.refresh();
  }

  // Promote THIS session's checklist to the standing list new sessions start
  // from. Curating happens on a real session (where you can see what you
  // actually do), then one click makes it stick — instead of deleting the same
  // aspirational items on every future orientation.
  const [defaultsMsg, setDefaultsMsg] = useState<string | null>(null);
  async function saveAsDefault() {
    if (!confirm(`Make this ${prep.length}-item checklist the default for FUTURE orientations?\n\nExisting sessions keep their own lists — this only changes what new ones start with.`)) return;
    setBusy(true);
    setDefaultsMsg(null);
    const ok = await patchJson(
      "/api/orientation/prep-defaults",
      { tasks: prep.map((p) => ({ label: p.label, owner: p.owner, dueDaysBefore: p.dueDaysBefore })) },
      "POST"
    );
    setBusy(false);
    setDefaultsMsg(ok ? "Saved — new sessions will start from this list." : "Couldn't save the default checklist.");
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
  // Suggested = people who still need placing ANYWHERE. "Scheduled" = already
  // booked on another upcoming session, so they are handled and only need to
  // appear if you are deliberately moving them. "Later" = starts after this
  // session, so they normally belong to the next orientation but stay one click
  // away. Everyone else (no start date, already attended, past onboarding) is
  // still listed. Scheduled is checked FIRST so a person cannot fall into two
  // groups.
  const suggestedCands = session.candidates.filter((c) => c.suggested);
  const scheduledCands = session.candidates.filter((c) => !c.suggested && c.scheduledOn);
  const laterCands = session.candidates.filter((c) => !c.suggested && !c.scheduledOn && c.startsAfter);
  const otherCands = session.candidates.filter((c) => !c.suggested && !c.scheduledOn && !c.startsAfter);
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
              {session.endsAt ? formatTimeRange(session.date, session.endsAt) : fmtTime(session.date)} · {session.location ?? "—"}
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
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Start (MT)</span>
              <input type="time" value={resched.time} onChange={(e) => setResched({ ...resched, time: e.target.value })} className="mt-1 block rounded border border-brand-lea/20 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100" />
            </label>
            <label className="block">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">End (MT)</span>
              <input type="time" value={resched.endTime} onChange={(e) => setResched({ ...resched, endTime: e.target.value })} className="mt-1 block rounded border border-brand-lea/20 px-3 py-2 text-sm text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100" />
            </label>
            <Button onClick={saveReschedule} disabled={savingDate || !resched.date}>
              {savingDate ? "Saving…" : "Save new date"}
            </Button>
            {reschedErr ? <span className="text-xs font-semibold text-red-700 dark:text-red-300">{reschedErr}</span> : <span className="text-xs text-brand-grey dark:text-slate-400">Attendees keep their spots; this only moves the session date/time.</span>}
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
              <PrepRow key={t.id} t={t} onToggle={togglePrep} onRemove={removePrep} onEdit={editPrep} />
            ))}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <input value={newPrep.label} onChange={(e) => setNewPrep({ ...newPrep, label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addPrep()} placeholder="Add a prep task" className="flex-1 rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500" />
            <input value={newPrep.owner} onChange={(e) => setNewPrep({ ...newPrep, owner: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addPrep()} placeholder="Owner" aria-label="Owner for the new task" className="w-24 rounded border border-brand-lea/15 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500" />
            <input value={newPrep.days} onChange={(e) => setNewPrep({ ...newPrep, days: e.target.value.replace(/[^0-9]/g, "") })} onKeyDown={(e) => e.key === "Enter" && addPrep()} placeholder="days" aria-label="Days before orientation for the new task" title="Days before orientation — also sets where it lands in the list" className="w-16 rounded border border-brand-lea/15 px-2 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500" />
            <button onClick={addPrep} disabled={busy} className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-100 dark:bg-white/5">Add</button>
          </div>
          {/* Curate here, then promote — so the next orientation starts right. */}
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <button onClick={saveAsDefault} disabled={busy || prep.length === 0} className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
              Save as default for new sessions
            </button>
            {defaultsMsg ? (
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{defaultsMsg}</span>
            ) : (
              <span className="text-xs text-brand-grey dark:text-slate-400">Ordered by days before. Editing a task here changes only this session until you save it as the default.</span>
            )}
          </div>

          {/* Lunch — sits under the prep checklist because "Order lunch (use
              headcount)" is a task there, and ticking it recorded nothing. */}
          <div className="mt-4 border-t border-brand-lea/10 pt-4 dark:border-white/10">
            <h3 className="text-sm font-semibold text-brand-lea dark:text-slate-100">Lunch</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Ordering from</span>
                <input
                  value={lunch.vendor}
                  onChange={(e) => setLunch({ ...lunch, vendor: e.target.value })}
                  placeholder="Restaurant or caterer"
                  className="mt-1 block w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Expected arrival (MT)</span>
                <input
                  type="time"
                  value={lunch.arrivalTime}
                  onChange={(e) => setLunch({ ...lunch, arrivalTime: e.target.value })}
                  className="mt-1 block w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm text-brand-lea dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Contact</span>
                <input
                  value={lunch.contactName}
                  onChange={(e) => setLunch({ ...lunch, contactName: e.target.value })}
                  placeholder="Who to ask for"
                  className="mt-1 block w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Contact phone</span>
                <input
                  value={lunch.contactPhone}
                  onChange={(e) => setLunch({ ...lunch, contactPhone: e.target.value })}
                  placeholder="Phone"
                  className="mt-1 block w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
                />
              </label>
            </div>
            <label className="mt-3 block">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">Notes</span>
              <textarea
                value={lunch.notes}
                onChange={(e) => setLunch({ ...lunch, notes: e.target.value })}
                rows={2}
                placeholder="Dietary requirements, where it gets dropped off, anything worth knowing on the day"
                className="mt-1 block w-full rounded border border-brand-lea/15 px-3 py-1.5 text-sm dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100 dark:placeholder:text-slate-500"
              />
            </label>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                onClick={saveLunch}
                disabled={lunchBusy}
                className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 disabled:opacity-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
              >
                {lunchBusy ? "Saving…" : "Save lunch details"}
              </button>
              {lunchFile.name ? (
                <>
                  <a
                    href={`/api/orientation/sessions/${session.id}/lunch-file`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-eden transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:text-slate-300"
                  >
                    {lunchFile.name}
                  </a>
                  <button
                    onClick={removeLunchFile}
                    disabled={lunchBusy}
                    className="rounded px-2 py-1.5 text-xs font-semibold text-brand-grey transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-red-500/10 dark:hover:text-red-300"
                  >
                    Remove
                  </button>
                </>
              ) : (
                <label className="cursor-pointer rounded border border-brand-lea/20 px-3 py-1.5 text-xs font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100">
                  Upload confirmation
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadLunchFile(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              {lunchSaved ? <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">{lunchSaved}</span> : null}
              {lunchErr ? <span className="text-xs font-semibold text-red-700 dark:text-red-300">{lunchErr}</span> : null}
            </div>
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
                            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-semibold transition hover:bg-brand-gold/10",
                            a.travel.status === "BOOKED"
                              ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300"
                              : "border-brand-gold/40 bg-brand-gold/15 text-brand-lea dark:text-slate-100"
                          )}
                        >
                          {a.travel.status === "BOOKED" ? "Booked" : "Needed"}
                          {a.travel.total > 0 ? ` · ${formatUsd(a.travel.total)}` : ""}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-1">
                          <select value={a.travelStatus} onChange={(e) => setTravel(a, e.target.value as TravelStatus)} className={clsx("rounded border px-1 py-0.5 text-[11px] font-semibold", a.travelStatus === "ARRANGED" ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-300" : a.travelStatus === "NEEDED" ? "border-brand-gold/40 bg-brand-gold/15 text-brand-lea dark:text-slate-100" : "border-brand-lea/15 bg-white text-brand-grey dark:border-white/10 dark:bg-brand-panel dark:text-slate-400")}>
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
                              <option key={o.id} value={o.id}>→ {formatMomentDateShort(o.date)}</option>
                            ))}
                          </select>
                        ) : null}
                        <button onClick={() => removeAttendee(a.id)} className="text-[11px] text-red-600 dark:text-red-400 hover:underline">remove</button>
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
              {/* Four groups, but nobody is hidden — who attends is a judgment
                  call, so a late starter, someone with no start date, or someone
                  already booked elsewhere can still be added on purpose. The
                  start date is shown because that is what the decision turns on. */}
              {suggestedCands.length > 0 ? (
                <optgroup label="Suggested · not yet scheduled anywhere">
                  {suggestedCands.map((c) => <option key={c.id} value={c.id}>{candidateLabel(c)}</option>)}
                </optgroup>
              ) : null}
              {scheduledCands.length > 0 ? (
                <optgroup label="Already scheduled · on another session">
                  {scheduledCands.map((c) => <option key={c.id} value={c.id}>{candidateLabel(c)}</option>)}
                </optgroup>
              ) : null}
              {laterCands.length > 0 ? (
                <optgroup label="Starts after this session · normally the next orientation">
                  {laterCands.map((c) => <option key={c.id} value={c.id}>{candidateLabel(c)}</option>)}
                </optgroup>
              ) : null}
              {otherCands.length > 0 ? (
                <optgroup label="Everyone else">
                  {otherCands.map((c) => <option key={c.id} value={c.id}>{candidateLabel(c)}</option>)}
                </optgroup>
              ) : null}
            </select>
            <button onClick={addAttendee} disabled={busy || !addId} className="rounded bg-brand-lea px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-eden disabled:opacity-50">Add</button>
          </div>
        </section>
      </div>

      {/* The calendar invite comes BEFORE the email panel on purpose: the invitation
          template tells the new hire a calendar invite went to their company email,
          so the event has to exist first or the email is ahead of reality. */}
      <OrientationCalendarPanel sessionId={session.id} />

      {/* Sending + who's had what. Replaces the old tick-only tracker: the app can
          now send the team's real Front templates, so the five slots the app had
          invented (invitation / confirm_request / … ) are gone. */}
      {attendees.length > 0 ? (
        <OrientationEmailPanel
          sessionId={session.id}
          attendees={attendees.map((a) => ({
            id: a.id,
            name: a.name,
            sentTemplateKeys: a.sentTemplateKeys,
            sends: a.sends
          }))}
          onToggle={(attendeeId, key) => {
            const a = attendees.find((x) => x.id === attendeeId);
            // Returned, not fired and forgotten: the panel refetches the summary
            // and the reminder health off the back of this, and both read the row
            // this PATCH is still writing.
            return a ? toggleEmail(a, key) : Promise.resolve();
          }}
          onSent={(attendeeId, key) => {
            // A real send ticks the box server-side; mirror it locally so the
            // grid updates without a full reload. The provisional send record
            // matters as much as the tick — without it the mark would flash as
            // "ticked by hand" until the refresh lands, which is the opposite of
            // what just happened.
            setAttendees((cur) =>
              cur.map((x) =>
                x.id === attendeeId
                  ? {
                      ...x,
                      sentTemplateKeys: x.sentTemplateKeys.includes(key) ? x.sentTemplateKeys : [...x.sentTemplateKeys, key],
                      sends: { ...x.sends, [key]: x.sends[key] ?? { sentAt: new Date().toISOString(), to: "" } }
                    }
                  : x
              )
            );
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Flag({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center justify-center rounded p-0.5 transition hover:bg-brand-gold/10" title={on ? "Ready — click to unset" : "Not ready"}>
      {on ? <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><svg width="11" height="11" viewBox="0 0 12 12"><path d="M2.5 6.5 L5 9 L9.5 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg></span> : <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/30" />}
    </button>
  );
}

function PrepRow({
  t,
  onToggle,
  onRemove,
  onEdit
}: {
  t: PrepTaskView;
  onToggle: (id: string, done: boolean) => void;
  onRemove: (id: string) => void;
  onEdit: (id: string, patch: { owner?: string | null; dueDaysBefore?: number | null }) => void;
}) {
  // Local copies so typing doesn't fight the parent's re-render; committed on blur.
  const [days, setDays] = useState(t.dueDaysBefore == null ? "" : String(t.dueDaysBefore));
  const [owner, setOwner] = useState(t.owner ?? "");

  return (
    <div className="group flex items-center gap-2 border-b border-brand-lea/5 py-1.5 dark:border-white/10">
      <button onClick={() => onToggle(t.id, !t.done)} aria-label={t.done ? "Mark not done" : "Mark done"} className="shrink-0">
        {/* The tick's two colours were SVG presentation attributes, which no dark:
            class can reach — so they stayed at the light-mode hexes and glared on
            the dark page. Tailwind fill- and stroke- utilities emit the identical
            values (fill-emerald-100 is #d1fae5, stroke-emerald-600 is #059669), so
            light mode is unchanged and dark mode now has a variant. */}
        {t.done ? <span><svg width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" className="fill-emerald-100 dark:fill-emerald-500/20" /><path d="M5 8.5 L7 10.5 L11 6" fill="none" className="stroke-emerald-600 dark:stroke-emerald-300" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span> : <span className="inline-block h-4 w-4 rounded-full border-2 border-brand-grey/40" />}
      </button>
      <span className={clsx("flex-1 text-[12.5px]", t.done ? "text-brand-grey line-through dark:text-slate-400" : "text-brand-black dark:text-slate-100")}>{t.label}</span>

      {/* Owner and days-before are editable in place. Days-before is also the
          sort key, so changing it is how you move an item up or down the list. */}
      <input
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
        onBlur={() => { if ((t.owner ?? "") !== owner) onEdit(t.id, { owner: owner.trim() || null }); }}
        placeholder="owner"
        aria-label={`Owner for ${t.label}`}
        className="w-20 rounded bg-brand-cloudDancer/70 px-2 py-0.5 text-[10px] text-brand-grey placeholder:text-brand-grey/50 dark:bg-white/5 dark:text-slate-400"
      />
      <span className="flex items-center gap-0.5 text-[10px] text-brand-grey dark:text-slate-400">
        <input
          value={days}
          onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ""))}
          onBlur={() => {
            const next = days.trim() === "" ? null : Number(days);
            if (next !== t.dueDaysBefore) onEdit(t.id, { dueDaysBefore: next });
          }}
          placeholder="—"
          aria-label={`Days before orientation for ${t.label}`}
          title="Days before orientation. This also sets the order — bigger numbers come first."
          className="w-8 rounded bg-brand-cloudDancer/70 px-1 py-0.5 text-center text-[10px] dark:bg-white/5"
        />
        d before
      </span>
      <button
        onClick={() => onRemove(t.id)}
        title="Remove this task from this session"
        aria-label={`Remove ${t.label}`}
        className="rounded px-1 text-[13px] leading-none text-red-600 opacity-40 transition hover:bg-red-50 hover:opacity-100 dark:text-red-400 dark:hover:bg-red-500/15"
      >
        ×
      </button>
    </div>
  );
}
