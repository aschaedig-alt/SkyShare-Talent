// Travel scheduling helpers — turning what a trip knows into dates.
//
// DATA REALITY (verified against the live DB, Jul 2026): most real TravelItem
// rows have startsAt = null. The dates are sitting in the item `detail` string,
// because that is what the confirmation paste wrote there — e.g.
//   "BOS ► SLC | Thu 16Jul2026 | 859"
// lib/extraction/travel-confirmation.ts findDate() only recognises
// "Feb 23, 2026" / "02/23/2026" / "2026-02-23", so the compact ddMMMyyyy form
// that Delta/FlightBridge confirmations actually use never gets parsed and the
// structured column stays empty.
//
// So anything that wants to draw a trip on a calendar has to fall back to
// reading the detail text. That fallback is explicitly marked as `inferred` and
// is NEVER written back to the database — it only affects display, and the UI
// labels it so nobody mistakes a guess for a confirmed booking.

import type { TravelItemView, TravelTripView } from "@/lib/data/travel";
import { dayKeyOf } from "@/lib/dates/display";

export type DateSource = "field" | "detail";

export type ResolvedDate = {
  /** Midnight-UTC-anchored ISO for the day this happens. */
  iso: string;
  source: DateSource;
};

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11
};

function utcDay(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m, d));
  if (Number.isNaN(dt.getTime()) || dt.getUTCMonth() !== m || dt.getUTCDate() !== d) return null;
  return dt.toISOString();
}

/**
 * Pull a calendar date out of free booking text. Deliberately conservative:
 * only shapes we can read unambiguously, and a 4-digit year is always required
 * so a stray "16Jul" or a flight number can never be read as a date.
 */
export function parseDateFromText(text: string | null): string | null {
  if (!text) return null;

  // "16Jul2026" / "16 Jul 2026" / "16-Jul-2026"  (the FlightBridge/Delta shape)
  const dmy = text.match(/\b(\d{1,2})[\s-]?([A-Za-z]{3})[a-z]*[\s-]?(\d{4})\b/);
  if (dmy) {
    const m = MONTHS[dmy[2].toLowerCase()];
    if (m !== undefined) {
      const hit = utcDay(Number(dmy[3]), m, Number(dmy[1]));
      if (hit) return hit;
    }
  }

  // "Jul 16, 2026" / "July 16 2026"
  const mdy = text.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})\b/);
  if (mdy) {
    const m = MONTHS[mdy[1].toLowerCase()];
    if (m !== undefined) {
      const hit = utcDay(Number(mdy[3]), m, Number(mdy[2]));
      if (hit) return hit;
    }
  }

  // "2026-07-16"
  const isoish = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (isoish) {
    const hit = utcDay(Number(isoish[1]), Number(isoish[2]) - 1, Number(isoish[3]));
    if (hit) return hit;
  }

  // "07/16/2026" — US order, which is what every vendor we deal with sends.
  const slash = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (slash) {
    const hit = utcDay(Number(slash[3]), Number(slash[1]) - 1, Number(slash[2]));
    if (hit) return hit;
  }

  return null;
}

/** The day an item happens: the real column if set, else read from its text. */
export function resolveItemStart(item: TravelItemView): ResolvedDate | null {
  if (item.startsAt) return { iso: item.startsAt, source: "field" };
  const fromText = parseDateFromText(item.detail) ?? parseDateFromText(item.confirmation);
  return fromText ? { iso: fromText, source: "detail" } : null;
}

export function resolveItemEnd(item: TravelItemView): ResolvedDate | null {
  if (item.endsAt) return { iso: item.endsAt, source: "field" };
  return null;
}

/** True when the item has no usable date at all — not even an inferred one. */
export function itemHasNoDate(item: TravelItemView): boolean {
  return resolveItemStart(item) === null;
}

// ---- Trip-level range --------------------------------------------------------

export type TripRange = {
  startIso: string;
  endIso: string;
  /** Whole days the traveller is away, inclusive (a same-day trip is 1). */
  days: number;
  /** True when any edge of the range came from parsed text rather than a column. */
  inferred: boolean;
};

const dayMs = 24 * 60 * 60 * 1000;
const startOfUtcDay = (iso: string) => {
  const d = new Date(iso);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * The window a trip covers, from everything it knows: the requested travel
 * window, the orientation/indoc dates, and the items themselves.
 * Returns null when the trip has no dates anywhere — which is common, and is
 * itself reported as a gap (see gaps.ts).
 */
export function tripRange(trip: TravelTripView): TripRange | null {
  const edges: { iso: string; inferred: boolean }[] = [];
  const push = (iso: string | null, inferred = false) => {
    if (iso) edges.push({ iso, inferred });
  };

  push(trip.requestedArrival);
  push(trip.requestedReturn);
  push(trip.orientationDate);
  push(trip.indocStart);
  push(trip.indocEnd);

  for (const item of trip.items) {
    const s = resolveItemStart(item);
    if (s) push(s.iso, s.source === "detail");
    const e = resolveItemEnd(item);
    if (e) push(e.iso, e.source === "detail");
  }

  if (edges.length === 0) return null;

  const sorted = [...edges].sort((a, b) => startOfUtcDay(a.iso) - startOfUtcDay(b.iso));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const days = Math.round((startOfUtcDay(last.iso) - startOfUtcDay(first.iso)) / dayMs) + 1;

  return {
    startIso: first.iso,
    endIso: last.iso,
    days,
    inferred: edges.some((e) => e.inferred)
  };
}

// ---- Calendar events ---------------------------------------------------------

export type TravelEventKind =
  | "FLIGHT"
  | "HOTEL"
  | "CAR"
  | "TRANSPORT"
  | "OTHER"
  | "ORIENTATION"
  | "INDOC"
  | "ARRIVE"
  | "RETURN";

export type TravelCalendarEvent = {
  /** YYYY-MM-DD, UTC — the grid cell this belongs in. */
  day: string;
  tripId: string;
  kind: TravelEventKind;
  label: string;
  /** The date was read out of booking text, not a real date column. */
  inferred: boolean;
  /** A clock time is only shown when we actually have one. */
  timeIso: string | null;
};

/** A stretch of days the traveller is away, used to shade the grid. */
export type TravelAwaySpan = {
  tripId: string;
  purpose: string;
  status: string;
  where: string | null;
  startDay: string;
  endDay: string;
  inferred: boolean;
};

// Which DAY an item sits on.
//
// Two fixes live in this one line. Reading everything in UTC put an evening
// departure (8pm MT = 02:00Z the next day) on the wrong square — that was fixed
// Jul 21. Reading everything in Mountain then broke the OTHER kind: a date
// recovered from booking text, and orientationDate, are calendar days stored at
// midnight UTC, and midnight UTC is 6pm the previous day in Mountain — so a
// Jul 16 flight drew on Jul 15 and an Aug 4 orientation drew on Aug 3.
// dayKeyOf picks per value: UTC for calendar days, office time for moments.
export const dayKey = (iso: string) => dayKeyOf(iso);

/** Does this ISO carry a meaningful clock time, or is it just a date? */
function hasTime(iso: string): boolean {
  const d = new Date(iso);
  return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0;
}

const ITEM_LABEL: Record<string, string> = {
  FLIGHT: "Flight",
  HOTEL: "Hotel",
  CAR: "Rental car",
  TRANSPORT: "Ground transport",
  OTHER: "Travel"
};

/**
 * Flatten a person's trips into calendar events + away-spans.
 * Anything without a readable date is simply absent — findTravelGaps() is what
 * tells the user about those, rather than the calendar inventing a position.
 */
export function buildTravelCalendar(trips: TravelTripView[]): {
  events: TravelCalendarEvent[];
  spans: TravelAwaySpan[];
} {
  const events: TravelCalendarEvent[] = [];
  const spans: TravelAwaySpan[] = [];

  for (const trip of trips) {
    if (trip.status === "CANCELED") continue;

    for (const item of trip.items) {
      const start = resolveItemStart(item);
      if (!start) continue;
      const vendor = item.vendor ? ` · ${item.vendor}` : "";
      events.push({
        day: dayKey(start.iso),
        tripId: trip.id,
        kind: (item.type as TravelEventKind) ?? "OTHER",
        label: `${ITEM_LABEL[item.type] ?? "Travel"}${vendor}`,
        inferred: start.source === "detail",
        timeIso: hasTime(start.iso) ? start.iso : null
      });

      // A hotel booked with a checkout date covers every night in between.
      const end = resolveItemEnd(item);
      if (item.type === "HOTEL" && end) {
        events.push({
          day: dayKey(end.iso),
          tripId: trip.id,
          kind: "HOTEL",
          label: `Checkout${vendor}`,
          inferred: end.source === "detail",
          timeIso: hasTime(end.iso) ? end.iso : null
        });
      }
    }

    const tripEvent = (iso: string | null, kind: TravelEventKind, label: string) => {
      if (!iso) return;
      events.push({ day: dayKey(iso), tripId: trip.id, kind, label, inferred: false, timeIso: hasTime(iso) ? iso : null });
    };
    tripEvent(trip.requestedArrival, "ARRIVE", "Requested arrival");
    tripEvent(trip.requestedReturn, "RETURN", "Requested return");
    tripEvent(trip.orientationDate, "ORIENTATION", "Orientation");
    tripEvent(trip.indocStart, "INDOC", "Indoc starts");
    tripEvent(trip.indocEnd, "INDOC", "Indoc ends");

    const range = tripRange(trip);
    if (range) {
      spans.push({
        tripId: trip.id,
        purpose: trip.purpose,
        status: trip.status,
        where: [trip.originAirport, trip.destinationAirport].filter(Boolean).join(" → ") || null,
        startDay: dayKey(range.startIso),
        endDay: dayKey(range.endIso),
        inferred: range.inferred
      });
    }
  }

  events.sort((a, b) => (a.day === b.day ? a.kind.localeCompare(b.kind) : a.day.localeCompare(b.day)));
  return { events, spans };
}

/** Every YYYY-MM-DD covered by a span, inclusive. */
export function spanDays(span: TravelAwaySpan): string[] {
  const out: string[] = [];
  let cur = Date.parse(`${span.startDay}T00:00:00Z`);
  const end = Date.parse(`${span.endDay}T00:00:00Z`);
  // Guard against a malformed span turning into an unbounded loop.
  let guard = 0;
  while (cur <= end && guard < 400) {
    out.push(new Date(cur).toISOString().slice(0, 10));
    cur += dayMs;
    guard += 1;
  }
  return out;
}
