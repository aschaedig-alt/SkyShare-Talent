"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { Badge, Button, Input } from "@/components/ui";
import {
  ATTENDEE_STATUSES,
  EVENT_STATUSES,
  eventStatusLabel,
  eventTypeLabel
} from "@/lib/events/constants";
import type { AttendeeView, EventDetail, SupplyLineView, TaskView } from "@/lib/data/events";

const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-[#0f2033] dark:text-slate-100";
const SELECT_SM =
  "rounded border border-brand-lea/15 bg-white px-2 py-1 text-xs text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";
const CARD = "rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const H2 = "text-base font-semibold text-brand-lea dark:text-slate-100";
const REMOVE = "text-[11px] text-red-600 hover:underline dark:text-red-400";

async function send(url: string, body: unknown, method = "PATCH") {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  return res.ok;
}

function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" }) {
  return new Date(iso).toLocaleDateString(undefined, opts);
}

function statusTone(status: string) {
  if (status === "CONFIRMED") return "success" as const;
  if (status === "COMPLETE") return "info" as const;
  if (status === "CANCELED") return "danger" as const;
  return "neutral" as const;
}

export function EventDetailWorkspace({ event }: { event: EventDetail }) {
  const router = useRouter();

  const [status, setStatus] = useState(event.status);
  const [attendees, setAttendees] = useState<AttendeeView[]>(event.attendees);
  const [supplies, setSupplies] = useState<SupplyLineView[]>(event.supplies);
  const [tasks, setTasks] = useState<TaskView[]>(event.tasks);

  const [personId, setPersonId] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [supplyId, setSupplyId] = useState("");
  const [supplyLabel, setSupplyLabel] = useState("");
  const [supplyQty, setSupplyQty] = useState("1");
  const [taskLabel, setTaskLabel] = useState("");
  const [taskOwner, setTaskOwner] = useState("");
  const [taskDue, setTaskDue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Recomputed from live state so the header numbers move with the toggles.
  const confirmed = useMemo(() => attendees.filter((a) => a.status === "CONFIRMED").length, [attendees]);
  const packed = useMemo(() => supplies.filter((s) => s.packed).length, [supplies]);
  const openTasks = useMemo(() => tasks.filter((t) => !t.done).length, [tasks]);
  const shortLines = useMemo(() => supplies.filter((s) => s.short && !s.packed), [supplies]);

  const where = [event.venue, [event.city, event.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ");
  const when =
    event.endsAt && new Date(event.endsAt).toDateString() !== new Date(event.startsAt).toDateString()
      ? `${fmtDate(event.startsAt)} – ${fmtDate(event.endsAt)}`
      : fmtDate(event.startsAt, { weekday: "long", month: "short", day: "numeric", year: "numeric" });

  async function changeStatus(next: string) {
    setStatus(next);
    await send(`/api/events/${event.id}`, { status: next });
    router.refresh();
  }

  async function addPerson() {
    if (!personId) return;
    setBusy(true);
    setError(null);
    const ok = await send(`/api/events/${event.id}/attendees`, { newHireId: personId, role: personRole }, "POST");
    setBusy(false);
    if (!ok) {
      setError("Unable to add that person.");
      return;
    }
    setPersonId("");
    setPersonRole("");
    router.refresh();
  }

  async function setAttendeeStatus(a: AttendeeView, next: string) {
    setAttendees((cur) => cur.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    await send(`/api/events/attendees/${a.id}`, { status: next });
  }

  async function removePerson(a: AttendeeView) {
    setAttendees((cur) => cur.filter((x) => x.id !== a.id));
    await send(`/api/events/attendees/${a.id}`, null, "DELETE");
    router.refresh();
  }

  async function addSupply() {
    const qty = Math.max(1, Number.parseInt(supplyQty, 10) || 1);
    if (!supplyId && !supplyLabel.trim()) return;
    setBusy(true);
    setError(null);
    const ok = await send(
      `/api/events/${event.id}/supplies`,
      { supplyItemId: supplyId || null, label: supplyLabel, quantity: qty },
      "POST"
    );
    setBusy(false);
    if (!ok) {
      setError("Unable to add that supply.");
      return;
    }
    setSupplyId("");
    setSupplyLabel("");
    setSupplyQty("1");
    router.refresh();
  }

  async function togglePacked(s: SupplyLineView) {
    const next = !s.packed;
    setSupplies((cur) => cur.map((x) => (x.id === s.id ? { ...x, packed: next } : x)));
    await send(`/api/events/supplies/${s.id}`, { packed: next });
    // Packing releases the claim on the stock room, so the supplies page moves.
    router.refresh();
  }

  async function setQuantity(s: SupplyLineView, value: string) {
    const qty = Math.max(1, Number.parseInt(value, 10) || 1);
    setSupplies((cur) => cur.map((x) => (x.id === s.id ? { ...x, quantity: qty } : x)));
    await send(`/api/events/supplies/${s.id}`, { quantity: qty });
    router.refresh();
  }

  async function removeSupply(s: SupplyLineView) {
    setSupplies((cur) => cur.filter((x) => x.id !== s.id));
    await send(`/api/events/supplies/${s.id}`, null, "DELETE");
    router.refresh();
  }

  async function addTask() {
    if (!taskLabel.trim()) return;
    setBusy(true);
    setError(null);
    const ok = await send(`/api/events/${event.id}/tasks`, { label: taskLabel, owner: taskOwner, dueAt: taskDue }, "POST");
    setBusy(false);
    if (!ok) {
      setError("Unable to add that item.");
      return;
    }
    setTaskLabel("");
    setTaskOwner("");
    setTaskDue("");
    router.refresh();
  }

  async function toggleTask(t: TaskView) {
    const next = !t.done;
    setTasks((cur) => cur.map((x) => (x.id === t.id ? { ...x, done: next } : x)));
    await send(`/api/events/tasks/${t.id}`, { done: next });
  }

  async function removeTask(t: TaskView) {
    setTasks((cur) => cur.filter((x) => x.id !== t.id));
    await send(`/api/events/tasks/${t.id}`, null, "DELETE");
    router.refresh();
  }

  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <Link
        href="/events"
        className="inline-flex items-center gap-1 text-sm font-semibold text-brand-grey hover:text-brand-lea dark:text-slate-400"
      >
        ← Events &amp; Outreach
      </Link>

      <section className={`rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">{event.name}</h1>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              {eventTypeLabel(event.type)} · {when}
              {where ? ` · ${where}` : ""}
            </p>
            {event.website ? (
              <a
                href={event.website}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-brand-eden hover:underline dark:text-brand-sweet"
              >
                Event page <ExternalLink className="h-3 w-3" />
              </a>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={statusTone(status)}>{eventStatusLabel(status)}</Badge>
            <select className={SELECT_SM} value={status} onChange={(e) => changeStatus(e.target.value)}>
              {EVENT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {[
            ["Going", `${confirmed}/${attendees.length}`],
            ["Packed", `${packed}/${supplies.length}`],
            ["To do", String(openTasks)],
            ["Owner", event.ownerName ?? "Unassigned"]
          ].map(([label, val]) => (
            <span
              key={label}
              className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 px-3 py-1 text-brand-lea dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
            >
              <span className="font-semibold">{val}</span> <span className="text-brand-grey dark:text-slate-400">{label}</span>
            </span>
          ))}
        </div>

        {shortLines.length > 0 ? (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300">
            Not enough in stock for {shortLines.map((s) => s.label).join(", ")}. Check{" "}
            <Link href="/events/supplies" className="font-semibold underline">
              Supplies
            </Link>{" "}
            and reorder.
          </div>
        ) : null}
        {error ? <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-300">{error}</p> : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Who's going */}
        <section className={CARD}>
          <h2 className={H2}>Who is going</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                  <th className="py-2 pr-2">Name</th>
                  <th className="px-1 py-2">Role at event</th>
                  <th className="px-1 py-2">Status</th>
                  <th className="px-1 py-2" />
                </tr>
              </thead>
              <tbody>
                {attendees.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-brand-grey dark:text-slate-400">
                      Nobody added yet. Pick someone from the roster below.
                    </td>
                  </tr>
                ) : (
                  attendees.map((a) => (
                    <tr key={a.id} className="border-t border-brand-lea/10 dark:border-white/10">
                      <td className="py-2 pr-2">
                        <Link
                          href={`/people/${a.newHireId}`}
                          className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100"
                        >
                          {a.name}
                        </Link>
                        {a.position ? (
                          <div className="text-[11px] text-brand-grey dark:text-slate-400">{a.position}</div>
                        ) : null}
                      </td>
                      <td className="px-1 py-2 text-brand-grey dark:text-slate-400">{a.role ?? "—"}</td>
                      <td className="px-1 py-2">
                        <select
                          className={SELECT_SM}
                          value={a.status}
                          onChange={(e) => setAttendeeStatus(a, e.target.value)}
                        >
                          {ATTENDEE_STATUSES.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-1 py-2 text-right">
                        <button className={REMOVE} onClick={() => removePerson(a)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <label className="min-w-[10rem] flex-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                Add from roster
              </span>
              <select className={`mt-1 ${FIELD}`} value={personId} onChange={(e) => setPersonId(e.target.value)}>
                <option value="">Pick someone…</option>
                {event.roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.position ? ` — ${p.position}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[8rem] flex-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                Role (optional)
              </span>
              <Input
                className="mt-1"
                value={personRole}
                onChange={(e) => setPersonRole(e.target.value)}
                placeholder="Booth lead"
              />
            </label>
            <Button size="sm" onClick={addPerson} disabled={busy || !personId}>
              Add
            </Button>
          </div>
        </section>

        {/* What we need */}
        <section className={CARD}>
          <h2 className={H2}>What we need</h2>
          <p className="mt-1 text-xs text-brand-grey dark:text-slate-400">
            The to-do list for this event — order the banner, ship the box, book the table.
          </p>
          <ul className="mt-3 space-y-2">
            {tasks.length === 0 ? (
              <li className="py-2 text-center text-xs text-brand-grey dark:text-slate-400">
                Nothing on the list yet.
              </li>
            ) : (
              tasks.map((t) => {
                const overdue = !t.done && t.dueAt && new Date(t.dueAt) < new Date();
                return (
                  <li key={t.id} className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={t.done}
                      onChange={() => toggleTask(t)}
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-brand-gold"
                    />
                    <div className="min-w-0 flex-1">
                      <p
                        className={
                          t.done
                            ? "text-brand-grey line-through dark:text-slate-500"
                            : "text-brand-lea dark:text-slate-100"
                        }
                      >
                        {t.label}
                      </p>
                      <p className="text-[11px] text-brand-grey dark:text-slate-400">
                        {t.owner ? `${t.owner}` : "Unassigned"}
                        {t.dueAt ? ` · due ${fmtDate(t.dueAt, { month: "short", day: "numeric" })}` : ""}
                        {overdue ? " · overdue" : ""}
                      </p>
                    </div>
                    <button className={REMOVE} onClick={() => removeTask(t)}>
                      Remove
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <div className="mt-3 space-y-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
            <Input value={taskLabel} onChange={(e) => setTaskLabel(e.target.value)} placeholder="What is needed?" />
            <div className="flex gap-2">
              <Input value={taskOwner} onChange={(e) => setTaskOwner(e.target.value)} placeholder="Owner" />
              <Input type="date" value={taskDue} onChange={(e) => setTaskDue(e.target.value)} />
              <Button size="sm" onClick={addTask} disabled={busy || !taskLabel.trim()}>
                Add
              </Button>
            </div>
          </div>
        </section>
      </div>

      {/* What we're bringing */}
      <section className={CARD}>
        <div className="flex items-baseline justify-between">
          <h2 className={H2}>What we are bringing</h2>
          <Link href="/events/supplies" className="text-xs font-semibold text-brand-eden hover:underline dark:text-brand-sweet">
            Stock room →
          </Link>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                <th className="py-2 pr-2">Item</th>
                <th className="px-1 py-2">Qty</th>
                <th className="px-1 py-2">In stock</th>
                <th className="px-1 py-2 text-center">Packed</th>
                <th className="px-1 py-2" />
              </tr>
            </thead>
            <tbody>
              {supplies.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-brand-grey dark:text-slate-400">
                    Nothing on the packing list yet. Add from the stock room, or type a one-off below.
                  </td>
                </tr>
              ) : (
                supplies.map((s) => (
                  <tr key={s.id} className="border-t border-brand-lea/10 dark:border-white/10">
                    <td className="py-2 pr-2 text-brand-lea dark:text-slate-100">
                      {s.label}
                      {s.supplyItemId === null ? (
                        <span className="ml-1 text-[11px] text-brand-grey dark:text-slate-400">(one-off)</span>
                      ) : null}
                    </td>
                    <td className="px-1 py-2">
                      <input
                        type="number"
                        min={1}
                        value={s.quantity}
                        onChange={(e) => setQuantity(s, e.target.value)}
                        className="w-16 rounded border border-brand-lea/15 bg-white px-1 py-0.5 text-xs text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                      />
                    </td>
                    <td className="px-1 py-2">
                      {s.onHand === null ? (
                        <span className="text-brand-grey dark:text-slate-400">—</span>
                      ) : s.short ? (
                        <span className="font-semibold text-amber-700 dark:text-amber-300">{s.onHand} — short</span>
                      ) : (
                        <span className="text-brand-grey dark:text-slate-400">{s.onHand}</span>
                      )}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={s.packed}
                        onChange={() => togglePacked(s)}
                        className="h-3.5 w-3.5 accent-brand-gold"
                      />
                    </td>
                    <td className="px-1 py-2 text-right">
                      <button className={REMOVE} onClick={() => removeSupply(s)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-brand-lea/10 pt-3 dark:border-white/10">
          <label className="min-w-[12rem] flex-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
              From the stock room
            </span>
            <select
              className={`mt-1 ${FIELD}`}
              value={supplyId}
              onChange={(e) => {
                setSupplyId(e.target.value);
                if (e.target.value) setSupplyLabel("");
              }}
            >
              <option value="">Pick an item…</option>
              {event.stockRoom.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.onHand} {i.unit})
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-[10rem] flex-1">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
              …or a one-off
            </span>
            <Input
              className="mt-1"
              value={supplyLabel}
              onChange={(e) => {
                setSupplyLabel(e.target.value);
                if (e.target.value) setSupplyId("");
              }}
              placeholder="Borrowed pull-up banner"
            />
          </label>
          <label className="w-24">
            <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
              Qty
            </span>
            <Input className="mt-1" type="number" min={1} value={supplyQty} onChange={(e) => setSupplyQty(e.target.value)} />
          </label>
          <Button size="sm" onClick={addSupply} disabled={busy || (!supplyId && !supplyLabel.trim())}>
            Add
          </Button>
        </div>
      </section>
    </div>
  );
}
