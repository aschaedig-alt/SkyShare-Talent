"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plane } from "lucide-react";
import clsx from "clsx";
import { eventStatusLabel, eventTypeLabel } from "@/lib/events/constants";
import type { CalendarEvent } from "@/lib/data/events";

/**
 * Month view of the events calendar.
 *
 * Deliberately its own component rather than a reuse of the interview
 * MonthCalendar: that one is typed to an interview (candidate name, timezone,
 * drag-to-reschedule) and events differ in the ways that matter — they SPAN
 * DAYS, they carry a decision state rather than a booking, and dragging one to
 * another day would be meaningless since we do not set the date, the organizer
 * does. The grid and the visual language are kept deliberately identical.
 */

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

/**
 * Colour carries the decision, because that is what you scan the calendar for:
 * gold = still to decide, navy = going, green = locked in.
 */
function chipClasses(status: string) {
  switch (status) {
    case "PENDING":
      return "bg-brand-gold/25 text-brand-lea ring-1 ring-brand-gold dark:bg-brand-gold/20 dark:text-brand-gold";
    case "CONFIRMED":
      return "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200";
    case "COMPLETE":
      return "bg-brand-cloudDancer text-brand-grey dark:bg-white/10 dark:text-slate-300";
    case "CANCELED":
      return "bg-slate-200 text-slate-500 line-through dark:bg-slate-600/40 dark:text-slate-400";
    default:
      return "bg-brand-sweet/40 text-brand-lea dark:bg-brand-eden/40 dark:text-slate-100";
  }
}

const LEGEND: Array<[string, string]> = [
  ["PENDING", "Pending decision"],
  ["PLANNED", "Planned"],
  ["CONFIRMED", "Confirmed"],
  ["COMPLETE", "Complete"],
  ["CANCELED", "Canceled"]
];

/** Local y-m-d key. Built from local parts, never toISOString — the ISO form is
 *  UTC, which puts an evening event on tomorrow's square. */
function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function EventsCalendar({ events }: { events: CalendarEvent[] }) {
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [openDay, setOpenDay] = useState<string | null>(null);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startDayOfWeek = new Date(year, month, 1).getDay();
  const todayKey = dayKey(new Date());

  /**
   * Every day an event covers, not just its first. A two-day fair that shows
   * only on its opening day looks like a one-day event on a calendar, which is
   * exactly the thing a calendar is supposed to settle.
   */
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const start = new Date(event.startsAt);
      const end = event.endsAt ? new Date(event.endsAt) : start;
      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      // Guard against a bad end date producing an unbounded loop.
      let guard = 0;
      while (cursor <= last && guard < 400) {
        const key = dayKey(cursor);
        map.set(key, [...(map.get(key) ?? []), event]);
        cursor.setDate(cursor.getDate() + 1);
        guard += 1;
      }
    }
    return map;
  }, [events]);

  const cells: Array<{ day: number | null; key: string }> = [];
  for (let i = 0; i < startDayOfWeek; i += 1) cells.push({ day: null, key: `blank-${i}` });
  for (let d = 1; d <= daysInMonth; d += 1) cells.push({ day: d, key: `${year}-${month}-${d}` });

  const monthCount = useMemo(
    () =>
      events.filter((e) => {
        const s = new Date(e.startsAt);
        const end = e.endsAt ? new Date(e.endsAt) : s;
        return (
          (s.getFullYear() === year && s.getMonth() === month) ||
          (end.getFullYear() === year && end.getMonth() === month)
        );
      }).length,
    [events, year, month]
  );

  return (
    <section className="rounded bg-white shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-lea/10 px-4 py-3 dark:border-white/10">
        <div>
          <h2 className="text-lg font-semibold text-brand-lea dark:text-slate-100">
            {MONTHS[month]} {year}
          </h2>
          <p className="text-xs text-brand-grey dark:text-slate-400">
            {monthCount === 0 ? "Nothing this month" : `${monthCount} event${monthCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const now = new Date();
              setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
            }}
            className="rounded border border-brand-lea/20 px-3 py-1 text-xs font-semibold text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          >
            Today
          </button>
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            aria-label="Previous month"
            className="rounded border border-brand-lea/20 p-1 text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            aria-label="Next month"
            className="rounded border border-brand-lea/20 p-1 text-brand-lea transition hover:shadow-glow dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 border-b border-brand-lea/10 dark:border-white/10">
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-center text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400"
          >
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {cells.map((cell) => {
          if (cell.day === null) {
            return (
              <div
                key={cell.key}
                className="min-h-[80px] border-b border-r border-brand-lea/5 bg-brand-cloudDancer/10 sm:min-h-[110px] dark:border-white/10 dark:bg-white/5"
              />
            );
          }
          const dayEvents = byDay.get(cell.key) ?? [];
          const isToday = cell.key === todayKey;
          const isOpen = openDay === cell.key;

          return (
            <div
              key={cell.key}
              className="relative min-h-[80px] border-b border-r border-brand-lea/5 p-1 transition hover:bg-brand-cloudDancer/20 sm:min-h-[110px] dark:border-white/10 dark:hover:bg-white/5"
            >
              <div className="mb-1 flex items-center px-1">
                <span
                  className={clsx(
                    "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold",
                    isToday ? "bg-brand-lea text-white dark:bg-brand-gold dark:text-brand-lea" : "text-brand-lea dark:text-slate-300"
                  )}
                >
                  {cell.day}
                </span>
              </div>

              <div className="space-y-1">
                {dayEvents.slice(0, 2).map((event) => (
                  <Link
                    key={event.id}
                    href={`/events/${event.id}`}
                    // A month grid shows up to two chips a day across ~31 days, so the
                    // default prefetch fires dozens of /events/[id] requests just for
                    // rendering the month. Same reason the sidebar's links opt out.
                    prefetch={false}
                    title={`${event.name} — ${eventStatusLabel(event.status)}${event.venue ? ` · ${event.venue}` : ""}`}
                    className={clsx(
                      "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[10px] font-medium transition hover:brightness-105",
                      chipClasses(event.status)
                    )}
                  >
                    {event.aircraftPlan === "CONFIRMED" || event.aircraftPlan === "REQUESTED" ? (
                      <Plane className="h-2.5 w-2.5 shrink-0" />
                    ) : null}
                    <span className="truncate">{event.name}</span>
                  </Link>
                ))}
                {dayEvents.length > 2 ? (
                  <button
                    onClick={() => setOpenDay(isOpen ? null : cell.key)}
                    className="px-1 text-[10px] font-semibold text-brand-eden hover:underline dark:text-brand-sweet"
                  >
                    +{dayEvents.length - 2} more
                  </button>
                ) : null}
              </div>

              {isOpen ? (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setOpenDay(null)} />
                  <div className="absolute left-1 right-1 top-8 z-20 max-h-64 overflow-y-auto rounded border border-brand-lea/20 bg-white p-2 shadow-xl dark:border-white/10 dark:bg-brand-panel">
                    <div className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.12em] text-brand-grey dark:text-slate-400">
                      {MONTHS[month]} {cell.day}
                    </div>
                    <div className="space-y-1">
                      {dayEvents.map((event) => (
                        <Link
                          key={event.id}
                          href={`/events/${event.id}`}
                          // Same reasoning as the day chips above — this "+N more"
                          // popover can hold every event on a busy day at once.
                          prefetch={false}
                          className={clsx(
                            "block truncate rounded px-2 py-1 text-[11px] font-medium transition hover:brightness-105",
                            chipClasses(event.status)
                          )}
                        >
                          {event.name}
                          <span className="ml-1 opacity-70">· {eventTypeLabel(event.type)}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-brand-lea/10 px-4 py-3 text-[11px] text-brand-grey dark:border-white/10 dark:text-slate-400">
        {LEGEND.map(([status, label]) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span className={clsx("inline-block h-3 w-5 rounded", chipClasses(status))} />
            {label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <Plane className="h-3 w-3" /> aircraft requested or confirmed
        </span>
      </div>
    </section>
  );
}
