"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import { CalendarDays, CalendarPlus, ExternalLink, RotateCcw } from "lucide-react";
import type { DebriefQueue as Queue, DebriefRow } from "@/lib/interviews/debrief";

/**
 * Interviews that happened and have no write-up yet.
 *
 * "Write up" is a real <Link> because it changes the whole screen — it must stay
 * ctrl/right-clickable, since working through a queue of sixteen in new tabs is
 * exactly how this gets used. Everything else stays a button: they change this
 * list in place.
 *
 * CLEARING A ROW NEVER TOUCHES A CALENDAR. Marking something not needed only
 * hides it here; only the explicit "Needs scheduling" button creates an event,
 * and even that adds no attendees, so nothing is ever emailed to a candidate.
 */

const denverDate = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  weekday: "short",
  month: "short",
  day: "numeric",
});

const denverTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Denver",
  hour: "numeric",
  minute: "2-digit",
});

/** Anything at least this old is what he meant by "the old ones". */
const OLD_AFTER_DAYS = 7;

const REASON_NOT_NEEDED = "Not needed - no follow-up";
const REASON_NOT_AN_INTERVIEW = "Not an interview";

function ageLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

const CARD = "rounded border border-brand-lea/12 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5";
const GHOST_BUTTON =
  "rounded border border-brand-lea/15 px-2 py-1 text-[11px] font-semibold text-brand-eden transition hover:border-brand-gold hover:text-brand-lea hover:shadow-[0_0_0_3px_rgba(234,170,0,0.18)] disabled:opacity-50 dark:border-white/15 dark:text-slate-300 dark:hover:text-white";
const SOLID_BUTTON =
  "rounded border border-brand-lea bg-brand-lea px-2.5 py-1 text-[11px] font-semibold text-white transition hover:border-brand-gold hover:shadow-[0_0_0_3px_rgba(234,170,0,0.25)] disabled:opacity-50 dark:border-white/20";

type MarkerState = { link: string | null; note: string };

export function DebriefQueue({ queue }: { queue: Queue }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Markers live on Google, not in our data, so router.refresh() cannot show
  // them — they are remembered here for the rest of the visit.
  const [markers, setMarkers] = useState<Record<string, MarkerState>>({});

  const clearable = useMemo(() => [...queue.pending, ...queue.unmatched], [queue.pending, queue.unmatched]);
  const oldOnes = useMemo(() => clearable.filter((r) => r.ageDays >= OLD_AFTER_DAYS), [clearable]);

  function toggle(eventId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) next.delete(eventId);
      else next.add(eventId);
      return next;
    });
  }

  /** One request for the whole selection — see the note on dismissEvents. */
  async function clearRows(eventIds: string[], reason: string) {
    if (!eventIds.length) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interviews/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventIds, action: "dismiss", reason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "That did not save.");
        return;
      }
      setSelected(new Set());
      router.refresh();
    } catch {
      setError("That did not save — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function restore(eventId: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interviews/debrief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, action: "restore" }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message ?? "That did not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("That did not save — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  async function addMarker(row: DebriefRow) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interviews/debrief/schedule-marker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          candidateId: row.candidate?.id ?? null,
          name: row.candidate?.displayName ?? row.parsedName,
          role: row.parsedRole,
          interviewStartsAt: row.startsAt,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        htmlLink?: string | null;
        hadPaycomLink?: boolean;
      };
      if (!res.ok) {
        setError(data.message ?? "The calendar event was not created.");
        return;
      }
      setMarkers((prev) => ({
        ...prev,
        [row.eventId]: {
          link: data.htmlLink ?? null,
          note: data.hadPaycomLink ? "On the calendar" : "On the calendar — no Paycom link",
        },
      }));
    } catch {
      setError("The calendar event was not created — check your connection.");
    } finally {
      setBusy(false);
    }
  }

  if (queue.blocker) {
    return (
      <div className={CARD}>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-lea dark:text-slate-100">
          Debrief queue
        </h3>
        <p className="mt-2 text-sm text-brand-eden dark:text-slate-300">{queue.blocker}</p>
      </div>
    );
  }

  const total = clearable.length;

  return (
    <div className="space-y-3">
      <div className={CARD}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-lea dark:text-slate-100">
              Awaiting write-up
            </h3>
            <p className="mt-1 text-[11px] text-brand-eden dark:text-slate-400">
              {queue.calendarEmail} · last {queue.windowDays} days · {queue.scanned} events scanned,{" "}
              {queue.detected} interviews found, {queue.writtenUp} already written up
            </p>
          </div>
          <span
            className={clsx(
              "text-2xl font-semibold leading-none",
              total === 0 ? "text-brand-eden dark:text-slate-400" : "text-brand-lea dark:text-slate-100"
            )}
          >
            {total}
          </span>
        </div>

        {oldOnes.length && !selected.size ? (
          <p className="mt-2 text-[11px] text-brand-eden dark:text-slate-400">
            {oldOnes.length} {oldOnes.length === 1 ? "is" : "are"} more than {OLD_AFTER_DAYS} days old.{" "}
            <button
              type="button"
              disabled={busy}
              onClick={() => setSelected(new Set(oldOnes.map((r) => r.eventId)))}
              className="font-semibold text-brand-lea underline hover:text-brand-gold disabled:opacity-50 dark:text-slate-200"
            >
              Select them all
            </button>
          </p>
        ) : null}

        {error ? <p className="mt-2 text-[11px] font-semibold text-red-600 dark:text-red-400">{error}</p> : null}
      </div>

      {selected.size ? (
        <div className="sticky top-2 z-10 flex flex-wrap items-center justify-between gap-2 rounded border border-brand-gold bg-brand-cloudDancer p-2.5 shadow-[0_0_0_3px_rgba(234,170,0,0.18)] dark:border-brand-gold/60 dark:bg-slate-800">
          <span className="text-[11px] font-semibold text-brand-lea dark:text-slate-100">
            {selected.size} selected — clearing these creates nothing on any calendar
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearRows([...selected], REASON_NOT_NEEDED)}
              className={SOLID_BUTTON}
            >
              Not needed
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void clearRows([...selected], REASON_NOT_AN_INTERVIEW)}
              className={GHOST_BUTTON}
            >
              Not an interview
            </button>
            <button type="button" disabled={busy} onClick={() => setSelected(new Set())} className={GHOST_BUTTON}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {total === 0 ? (
        <div className={CARD}>
          <p className="text-sm text-brand-eden dark:text-slate-300">
            Nothing waiting. Every interview on the calendar in the last {queue.windowDays} days has a write-up or has
            been cleared.
          </p>
        </div>
      ) : null}

      {queue.pending.length ? (
        <ul className="space-y-2">
          {queue.pending.map((row) => (
            <Row
              key={row.eventId}
              row={row}
              busy={busy}
              checked={selected.has(row.eventId)}
              onToggle={toggle}
              onClear={clearRows}
              onMarker={addMarker}
              marker={markers[row.eventId] ?? null}
            />
          ))}
        </ul>
      ) : null}

      {queue.unmatched.length ? (
        <div className={CARD}>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-lea dark:text-slate-100">
            No candidate record for these
          </h3>
          <p className="mt-1 text-[11px] text-brand-eden dark:text-slate-400">
            The invite email does not match anyone in the app, so there is nowhere to file the notes yet. Search for
            them — they may be under another address.
          </p>
          <ul className="mt-2 space-y-2">
            {queue.unmatched.map((row) => (
              <li
                key={row.eventId}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-brand-lea/12 bg-white/60 p-2.5 dark:border-white/10 dark:bg-white/5"
              >
                <label className="flex min-w-0 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.has(row.eventId)}
                    onChange={() => toggle(row.eventId)}
                    className="h-3.5 w-3.5 shrink-0 accent-brand-lea"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
                      {row.parsedName}
                    </span>
                    <span className="block truncate text-[11px] text-brand-eden dark:text-slate-400">
                      {denverDate.format(new Date(row.startsAt))} · {ageLabel(row.ageDays)} · {row.candidateEmail}
                      {row.parsedRole ? ` · ${row.parsedRole}` : ""}
                    </span>
                  </span>
                </label>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Link href={`/candidates?q=${encodeURIComponent(row.candidateEmail)}`} className={GHOST_BUTTON}>
                    Find them
                  </Link>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void clearRows([row.eventId], REASON_NOT_NEEDED)}
                    className={GHOST_BUTTON}
                  >
                    Not needed
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {queue.dismissed.length ? (
        <details className={CARD}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-brand-lea dark:text-slate-100">
            Cleared ({queue.dismissed.length})
          </summary>
          <ul className="mt-2 space-y-1.5">
            {queue.dismissed.map((row) => (
              <li key={row.eventId} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11px] text-brand-eden dark:text-slate-400">
                  {denverDate.format(new Date(row.startsAt))} · {row.candidate?.displayName ?? row.parsedName} ·{" "}
                  {row.dismissedReason}
                </span>
                <button type="button" disabled={busy} onClick={() => void restore(row.eventId)} className={GHOST_BUTTON}>
                  <RotateCcw className="mr-1 inline h-3 w-3" />
                  Put back
                </button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function Row({
  row,
  busy,
  checked,
  onToggle,
  onClear,
  onMarker,
  marker,
}: {
  row: DebriefRow;
  busy: boolean;
  checked: boolean;
  onToggle: (eventId: string) => void;
  onClear: (eventIds: string[], reason: string) => Promise<void>;
  onMarker: (row: DebriefRow) => Promise<void>;
  marker: MarkerState | null;
}) {
  const startsAt = new Date(row.startsAt);
  const stale = row.ageDays >= 3;

  return (
    <li
      className={clsx(
        "flex flex-wrap items-center justify-between gap-3 rounded border p-3 transition hover:border-brand-gold hover:shadow-[0_0_0_3px_rgba(234,170,0,0.15)]",
        checked
          ? "border-brand-gold bg-brand-cloudDancer/60 dark:border-brand-gold/60 dark:bg-white/10"
          : "border-brand-lea/12 bg-white/70 dark:border-white/10 dark:bg-white/5"
      )}
    >
      <label className="flex min-w-0 items-center gap-2.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => onToggle(row.eventId)}
          className="h-3.5 w-3.5 shrink-0 accent-brand-lea"
        />
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
              {row.candidate?.displayName ?? row.parsedName}
            </span>
            {row.candidate?.status && row.candidate.status !== "ACTIVE" ? (
              <span className="rounded bg-brand-lea/8 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-brand-eden dark:bg-white/10 dark:text-slate-300">
                {row.candidate.status}
              </span>
            ) : null}
            <span
              className={clsx(
                "text-[11px] font-semibold",
                stale ? "text-red-600 dark:text-red-400" : "text-brand-eden dark:text-slate-400"
              )}
            >
              {ageLabel(row.ageDays)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-[11px] text-brand-eden dark:text-slate-400">
            {denverDate.format(startsAt)} at {denverTime.format(startsAt)}
            {row.parsedRole ? ` · ${row.parsedRole}` : ""}
          </span>
          {marker ? (
            <span className="mt-0.5 block text-[11px] font-semibold text-brand-lea dark:text-slate-200">
              {marker.link ? (
                <a href={marker.link} target="_blank" rel="noopener noreferrer" className="underline">
                  {marker.note}
                </a>
              ) : (
                marker.note
              )}
            </span>
          ) : null}
        </span>
      </label>

      <div className="flex shrink-0 items-center gap-1.5">
        {row.htmlLink ? (
          <a
            href={row.htmlLink}
            target="_blank"
            rel="noopener noreferrer"
            className={GHOST_BUTTON}
            title="Open the calendar event"
          >
            <CalendarDays className="h-3 w-3" />
          </a>
        ) : null}
        <button
          type="button"
          disabled={busy || Boolean(marker)}
          onClick={() => void onMarker(row)}
          className={GHOST_BUTTON}
          title="Add a SCHEDULE to-do to the shared recruiting calendar"
        >
          <CalendarPlus className="mr-1 inline h-3 w-3" />
          {marker ? "Scheduled" : "Needs scheduling"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void onClear([row.eventId], REASON_NOT_NEEDED)}
          className={GHOST_BUTTON}
          title="Clear this row. Creates nothing on any calendar."
        >
          Not needed
        </button>
        <Link href={`/candidates/${row.candidate?.id ?? ""}?tab=interviews`} className={SOLID_BUTTON}>
          Write up
          <ExternalLink className="ml-1 inline h-3 w-3" />
        </Link>
      </div>
    </li>
  );
}
