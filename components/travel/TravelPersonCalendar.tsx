"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { ChevronLeft, ChevronRight, Plane, Building2, Car, Bus, Receipt, CalendarDays, Flag, LogIn, LogOut } from "lucide-react";
import { buildTravelCalendar, spanDays, type TravelEventKind } from "@/lib/travel/schedule";
import { travelPurposeLabel } from "@/lib/travel/constants";
import type { TravelTripView } from "@/lib/data/travel";
import { formatMomentTime, hasTimeOfDay } from "@/lib/dates/display";

const KIND_ICON: Record<TravelEventKind, typeof Plane> = {
  FLIGHT: Plane,
  HOTEL: Building2,
  CAR: Car,
  TRANSPORT: Bus,
  OTHER: Receipt,
  ORIENTATION: Flag,
  INDOC: CalendarDays,
  ARRIVE: LogIn,
  RETURN: LogOut
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const todayKey = () => new Date().toISOString().slice(0, 10);
const monthLabel = (y: number, m: number) =>
  new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m, 1)));
// A flight time is a real moment, so it shows in the office timezone. This used
// to render in UTC, which put every flight six hours out — a 9:37am departure
// displayed as 3:37.
// A date recorded with no time is stored at midnight Mountain; showing that as
// "12:00 AM" would invent a departure time nobody entered. Blank means unknown.
const fmtTime = (iso: string) => (hasTimeOfDay(iso) ? formatMomentTime(iso) : "");

/**
 * One person's travel on a month grid — when they are away, and where.
 *
 * Only dated things can be drawn. A lot of real items carry their date in the
 * booking text rather than the startsAt column, so those are recovered by
 * lib/travel/schedule and shown with a dashed outline to flag that the date was
 * read from the confirmation and has not been confirmed into the record.
 */
export function TravelPersonCalendar({ trips, travelerName }: { trips: TravelTripView[]; travelerName: string }) {
  const { events, spans } = useMemo(() => buildTravelCalendar(trips), [trips]);

  // Open on the first month that has anything in it, so the calendar is not
  // just an empty current month for travel that already happened.
  const initial = useMemo(() => {
    const first = [...events].sort((a, b) => a.day.localeCompare(b.day))[0]?.day ?? todayKey();
    return { year: Number(first.slice(0, 4)), month: Number(first.slice(5, 7)) - 1 };
  }, [events]);

  const [cursor, setCursor] = useState(initial);

  const byDay = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const e of events) {
      const list = map.get(e.day) ?? [];
      list.push(e);
      map.set(e.day, list);
    }
    return map;
  }, [events]);

  const awayByDay = useMemo(() => {
    const map = new Map<string, (typeof spans)[number]>();
    for (const s of spans) for (const d of spanDays(s)) map.set(d, s);
    return map;
  }, [spans]);

  // Leading blanks + the month's days, as a flat grid.
  const cells = useMemo(() => {
    const firstWeekday = new Date(Date.UTC(cursor.year, cursor.month, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const out: (string | null)[] = Array.from({ length: firstWeekday }, () => null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      out.push(`${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    }
    return out;
  }, [cursor]);

  const shift = (delta: number) => {
    const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };

  const monthHasEvents = cells.some((c) => c && byDay.has(c));
  const today = todayKey();

  return (
    <div className="rounded border border-brand-lea/12 bg-brand-cloudDancer/30 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-brand-gold" />
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
            {travelerName.split(" ")[0]}&apos;s travel calendar
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="rounded border border-brand-lea/15 bg-white p-1 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[110px] text-center text-xs font-semibold text-brand-lea dark:text-slate-100">
            {monthLabel(cursor.year, cursor.month)}
          </span>
          <button
            onClick={() => shift(1)}
            aria-label="Next month"
            className="rounded border border-brand-lea/15 bg-white p-1 text-brand-grey transition hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:border-white/10 dark:bg-brand-panel dark:text-slate-400"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {events.length === 0 ? (
        <div className="mt-2 rounded border border-dashed border-brand-lea/20 bg-white/60 p-3 text-xs text-brand-grey dark:border-white/10 dark:bg-transparent dark:text-slate-400">
          No dated travel for {travelerName} yet. Trips appear here once an item has a date, or once a requested
          arrival/return is set.
        </div>
      ) : (
        <>
          <div className="mt-2 grid grid-cols-7 gap-px overflow-hidden rounded border border-brand-lea/10 bg-brand-lea/10 dark:border-white/10 dark:bg-white/10">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="bg-brand-cloudDancer/70 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-brand-grey dark:bg-brand-panel dark:text-slate-400"
              >
                {w}
              </div>
            ))}
            {cells.map((day, i) => {
              if (!day) return <div key={`pad-${i}`} className="min-h-[62px] bg-white/40 dark:bg-brand-panel/40" />;
              const dayEvents = byDay.get(day) ?? [];
              const away = awayByDay.get(day);
              const isToday = day === today;
              return (
                <div
                  key={day}
                  className={clsx(
                    "min-h-[62px] p-1",
                    away ? "bg-brand-sweet/25 dark:bg-brand-sweet/10" : "bg-white dark:bg-brand-panel"
                  )}
                  title={away ? `Away — ${travelPurposeLabel(away.purpose)}${away.where ? ` · ${away.where}` : ""}` : undefined}
                >
                  <div
                    className={clsx(
                      "text-[10px] font-semibold",
                      isToday
                        ? "inline-flex h-4 w-4 items-center justify-center rounded bg-brand-lea text-white dark:bg-brand-gold dark:text-brand-black"
                        : "text-brand-grey dark:text-slate-400"
                    )}
                  >
                    {Number(day.slice(8, 10))}
                  </div>
                  <div className="mt-0.5 space-y-0.5">
                    {dayEvents.map((e, idx) => {
                      const Icon = KIND_ICON[e.kind] ?? Receipt;
                      return (
                        <div
                          key={`${e.tripId}-${e.kind}-${idx}`}
                          className={clsx(
                            "flex items-center gap-1 rounded border px-1 py-0.5 text-[9px] font-semibold leading-tight text-brand-lea dark:text-slate-100",
                            e.inferred
                              ? "border-dashed border-brand-gold/50 bg-brand-gold/10"
                              : "border-brand-lea/15 bg-brand-cloudDancer/70 dark:border-white/10 dark:bg-white/10"
                          )}
                          title={`${e.label}${e.timeIso ? ` · ${fmtTime(e.timeIso)}` : ""}${
                            e.inferred ? " — date read from the booking details, not confirmed" : ""
                          }`}
                        >
                          <Icon className="h-2.5 w-2.5 shrink-0 text-brand-gold" />
                          <span className="min-w-0 truncate">{e.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {!monthHasEvents && (
            <p className="mt-1.5 text-[11px] text-brand-grey dark:text-slate-400">
              Nothing in {monthLabel(cursor.year, cursor.month)}. Use the arrows to find their travel.
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-brand-grey dark:text-slate-400">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-sweet/60" />
              Away
            </span>
            {events.some((e) => e.inferred) && (
              <span className="flex items-center gap-1">
                <span className="inline-block h-2.5 w-2.5 rounded-sm border border-dashed border-brand-gold/70 bg-brand-gold/10" />
                Date read from the booking text — not saved on the item
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
