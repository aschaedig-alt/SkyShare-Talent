// Turning trips into the six-week grid the travel hub draws.
//
// PURE — no Prisma, no React. The hub calendar is a client component and imports
// this directly; pulling a database import in here once took the whole /travel
// route down with "Module not found: Can't resolve 'fs'".
//
// Three shapes matter:
//
//   RUN      one trip's contiguous days, start to end
//   SEGMENT  the part of a run that falls inside ONE week row, since a run that
//            crosses Saturday has to be drawn as two pieces
//   LEG      a flight, carrying the route and the ONE time that matters here
//
// The six-week window is deliberate. A calendar month alone splits any trip that
// crosses the 1st — Brandon's Jul 31 → Aug 1 visit is invisible as a single trip
// in either month on its own. Six weeks always: the Sunday on or before the 1st,
// then 42 days. Fixed height too, so the page does not jump between months.

import type { TravelTripView } from "@/lib/data/travel";
import { clockTimeOf, dayKeyOf } from "@/lib/dates/display";
import { resolveItemStart, tripRange } from "@/lib/travel/schedule";

/**
 * Where "here" is.
 *
 * The whole time rule depends on it: a flight INTO this airport shows when they
 * land, a flight OUT of it shows when they leave, and a time in the other city
 * is never shown at all. Every trip in the system routes through Salt Lake.
 */
export const HOME_AIRPORT = "SLC";

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------- routes ----

/** Two airport codes pulled out of booking text: "DEN-SLC", "SLC ► BOS", "LAS to SLC". */
export function parseRoute(text: string | null | undefined): { from: string; to: string } | null {
  if (!text) return null;
  // Codes are three letters, upper-case, separated by a dash, arrow, or "to".
  const m = text.match(/\b([A-Z]{3})\b\s*(?:-|–|—|►|>|→|to)\s*\b([A-Z]{3})\b/);
  if (!m) return null;
  if (m[1] === m[2]) return null;
  return { from: m[1], to: m[2] };
}

export type LegDirection = "in" | "out" | "other";

export type FlightLeg = {
  day: string;
  from: string | null;
  to: string | null;
  /** in = lands here, out = leaves here, other = neither end is home. */
  direction: LegDirection;
  /**
   * The one time worth showing, already in office time — the arrival when they
   * are landing here, the departure when they are leaving. Null when the record
   * carries no time of day at all, which is common.
   */
  time: string | null;
  vendor: string | null;
  /** The DATE was read out of booking text rather than a real column. */
  inferred: boolean;
};

function legFrom(item: TravelTripView["items"][number], fallbackRoute: { from: string; to: string } | null): FlightLeg | null {
  const start = resolveItemStart(item);
  if (!start) return null;

  const route = parseRoute(item.detail) ?? parseRoute(item.confirmation) ?? fallbackRoute;
  const from = route?.from ?? null;
  const to = route?.to ?? null;

  let direction: LegDirection = "other";
  if (to === HOME_AIRPORT) direction = "in";
  else if (from === HOME_AIRPORT) direction = "out";

  return {
    day: dayKeyOf(start.iso),
    from,
    to,
    direction,
    // Null for a date recovered from booking text — that record carries a day and
    // nothing else, and 6:00p was this code inventing one out of a UTC midnight.
    time: clockTimeOf(start.iso),
    vendor: item.vendor,
    inferred: start.source === "detail"
  };
}

// ------------------------------------------------------------------ runs ----

export type TripRun = {
  tripId: string;
  purpose: string;
  startDay: string;
  endDay: string;
  legs: FlightLeg[];
  /** Any edge of the range came from parsed text rather than a column. */
  inferred: boolean;
  /** Everything on the trip, for the rail. */
  trip: TravelTripView;
};

export function runsFor(trip: TravelTripView): TripRun | null {
  const range = tripRange(trip);
  if (!range) return null;

  // A trip's own origin/destination is the fallback when an item's text does not
  // spell out the route — common on the return leg, which often just says the city.
  const fallback =
    trip.originAirport && trip.destinationAirport && /^[A-Za-z]{3}$/.test(trip.originAirport)
      ? { from: trip.originAirport.toUpperCase(), to: trip.destinationAirport.toUpperCase() }
      : null;

  const legs = trip.items
    .filter((i) => i.type === "FLIGHT")
    .map((i) => legFrom(i, fallback))
    .filter((l): l is FlightLeg => l !== null)
    .sort((a, b) => a.day.localeCompare(b.day));

  return {
    tripId: trip.id,
    purpose: trip.purpose,
    startDay: dayKeyOf(range.startIso),
    endDay: dayKeyOf(range.endIso),
    legs,
    inferred: range.inferred,
    trip
  };
}

// ------------------------------------------------------------------ grid ----

export type GridDay = {
  key: string;
  dayNum: number;
  /** Part of the month being viewed, as opposed to a rolled-in neighbour week. */
  inMonth: boolean;
  /** "Aug" on the 1st of any month in view, so the boundary is readable. */
  monthTag: string | null;
  isToday: boolean;
};

export type Segment = {
  travelerKey: string;
  tripId: string;
  /** 1-7 within the week. */
  startCol: number;
  span: number;
  /** The run carries on past this week's edge, so that end is squared off. */
  continuesLeft: boolean;
  continuesRight: boolean;
  /** Flight on the first day of this segment, if any. */
  leftLeg: FlightLeg | null;
  /** Flight on the last day, when the segment is longer than a day. */
  rightLeg: FlightLeg | null;
  /** A flight that is neither, given its own single-day segment. */
  loneLeg: FlightLeg | null;
  /** Non-flight markers — orientation, indoc — on the segment's first day. */
  label: string | null;
  inferred: boolean;
};

export type GridWeek = {
  days: GridDay[];
  /** Stacked rows, so two travellers in one week do not overlap. */
  lanes: Segment[][];
};

const addDays = (key: string, n: number) => {
  const t = Date.parse(`${key}T00:00:00Z`) + n * DAY_MS;
  return new Date(t).toISOString().slice(0, 10);
};

/** Day-key arithmetic, for callers working out a window without rebuilding one. */
export const addDaysKey = addDays;

const diffDays = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

/** The Sunday on or before the 1st of the given month. */
export function windowStart(year: number, month: number): string {
  const first = new Date(Date.UTC(year, month, 1));
  const back = first.getUTCDay();
  return new Date(Date.UTC(year, month, 1 - back)).toISOString().slice(0, 10);
}

export type TravelerRuns = { key: string; runs: TripRun[] };

/**
 * Six weeks of days, with each traveller's runs cut to fit the week rows.
 *
 * `todayKey` is passed in rather than read from the clock so this stays pure and
 * testable — and so the server and the client cannot disagree about what "today"
 * is across a midnight render.
 */
export function buildMonthGrid(
  travelers: TravelerRuns[],
  year: number,
  month: number,
  todayKey: string
): GridWeek[] {
  const start = windowStart(year, month);
  const weeks: GridWeek[] = [];

  for (let w = 0; w < 6; w += 1) {
    const days: GridDay[] = [];
    for (let d = 0; d < 7; d += 1) {
      const key = addDays(start, w * 7 + d);
      const dayNum = Number(key.slice(8, 10));
      const monthIdx = Number(key.slice(5, 7)) - 1;
      days.push({
        key,
        dayNum,
        inMonth: monthIdx === month,
        monthTag:
          dayNum === 1
            ? new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(
                new Date(`${key}T00:00:00Z`)
              )
            : null,
        isToday: key === todayKey
      });
    }

    const weekStart = days[0].key;
    const weekEnd = days[6].key;
    const segments: Segment[] = [];

    for (const t of travelers) {
      for (const run of t.runs) {
        if (run.endDay < weekStart || run.startDay > weekEnd) continue;

        const segStart = run.startDay > weekStart ? run.startDay : weekStart;
        const segEnd = run.endDay < weekEnd ? run.endDay : weekEnd;
        const startCol = diffDays(weekStart, segStart) + 1;
        const span = diffDays(segStart, segEnd) + 1;

        const legAt = (day: string) => run.legs.find((l) => l.day === day) ?? null;
        const leftLeg = legAt(segStart);
        const rightLeg = span > 1 ? legAt(segEnd) : null;

        // A trip-level marker that is not a flight — the orientation itself.
        const label =
          run.purpose === "ORIENTATION" && run.trip.orientationDate
            ? dayKeyOf(run.trip.orientationDate) === segStart
              ? "Orientation"
              : null
            : null;

        segments.push({
          travelerKey: t.key,
          tripId: run.tripId,
          startCol,
          span,
          continuesLeft: run.startDay < weekStart,
          continuesRight: run.endDay > weekEnd,
          leftLeg,
          rightLeg,
          loneLeg: null,
          label,
          inferred: run.inferred
        });

        // Flights that sit in the middle of a run get their own single-day
        // segment rather than being dropped — the chip-at-each-end shape cannot
        // otherwise show them, and a silently missing flight is the worst outcome.
        for (const leg of run.legs) {
          if (leg.day < segStart || leg.day > segEnd) continue;
          if (leg === leftLeg || leg === rightLeg) continue;
          segments.push({
            travelerKey: t.key,
            tripId: run.tripId,
            startCol: diffDays(weekStart, leg.day) + 1,
            span: 1,
            continuesLeft: false,
            continuesRight: false,
            leftLeg: null,
            rightLeg: null,
            loneLeg: leg,
            label: null,
            inferred: leg.inferred
          });
        }
      }
    }

    weeks.push({ days, lanes: packLanes(segments) });
  }

  return weeks;
}

/**
 * Stack segments into rows so two that share a day never overlap.
 *
 * First-fit by start column. With a handful of travellers this is trivially
 * enough; the alternative — one fixed row per traveller — would leave a tall
 * empty grid the moment somebody has no trips that week.
 */
function packLanes(segments: Segment[]): Segment[][] {
  const sorted = [...segments].sort((a, b) => a.startCol - b.startCol || b.span - a.span);
  const lanes: Segment[][] = [];

  for (const seg of sorted) {
    const end = seg.startCol + seg.span - 1;
    let placed = false;
    for (const lane of lanes) {
      const clash = lane.some((s) => {
        const sEnd = s.startCol + s.span - 1;
        return seg.startCol <= sEnd && s.startCol <= end;
      });
      if (!clash) {
        lane.push(seg);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([seg]);
  }
  return lanes;
}

// ------------------------------------------------------------- chip text ----

export type ChipParts = {
  /** Time shown BEFORE the route — set when they are leaving here. */
  timeBefore: string | null;
  /** The two codes kept apart, so the arrow between them can be styled on its own. */
  from: string | null;
  to: string | null;
  /** Both codes joined, for tooltips and anywhere the arrow needs no styling. */
  route: string | null;
  /** Time shown AFTER the route — set when they are landing here. */
  timeAfter: string | null;
};

/**
 * How a flight reads on a chip.
 *
 * THE RULE: the time always sits on whichever side SLC is on. Landing here reads
 * "DEN→SLC 9:37a" with the time trailing; leaving here reads "10:39a SLC→DEN"
 * with it leading. Position alone says which end of the flight the time belongs
 * to, so no arrow or "arr/dep" label is needed — and a time for the other city is
 * never shown, because it is not a time anybody here acts on.
 */
export function chipParts(leg: FlightLeg): ChipParts {
  const route = leg.from && leg.to ? `${leg.from}→${leg.to}` : null;
  const codes = { from: leg.from, to: leg.to, route };
  if (leg.direction === "out") return { timeBefore: leg.time, ...codes, timeAfter: null };
  // "in" and "other" both trail. For a leg touching neither home airport there is
  // no better answer, and trailing matches the far more common inbound case.
  return { timeBefore: null, ...codes, timeAfter: leg.time };
}

// ------------------------------------------------------------------ rail ----

export type RailItem = {
  kind: "flight" | "hotel" | "car" | "transport" | "other" | "event";
  label: string;
  route: string | null;
  detail: string | null;
  /** Already formatted; the SLC-side time for a flight, a clock time otherwise. */
  time: string | null;
  amount: number | null;
};

/** One traveller's trip as the rail lists it: flights, then where they sleep and drive. */
export function railItems(run: TripRun): RailItem[] {
  const out: RailItem[] = [];

  for (const leg of run.legs) {
    out.push({
      kind: "flight",
      label: leg.vendor ?? "Flight",
      route: leg.from && leg.to ? `${leg.from} → ${leg.to}` : null,
      detail: null,
      time: leg.time,
      amount: null
    });
  }

  for (const item of run.trip.items) {
    if (item.type === "FLIGHT") continue;
    const kind =
      item.type === "HOTEL" ? "hotel" : item.type === "CAR" ? "car" : item.type === "TRANSPORT" ? "transport" : "other";
    out.push({
      kind,
      label: item.vendor ?? (kind === "hotel" ? "Hotel" : kind === "car" ? "Rental car" : "Booking"),
      route: null,
      detail: item.detail,
      time: null,
      amount: item.amount
    });
  }

  if (run.purpose === "ORIENTATION" && run.trip.orientationDate) {
    out.push({
      kind: "event",
      label: "Orientation",
      route: null,
      detail: null,
      time: clockTimeOf(run.trip.orientationDate),
      amount: null
    });
  }

  return out;
}

/** "Jul 16 – 19" / "Jul 31 – Aug 1" / "Aug 4" — a run's span, said briefly. */
export function runDateLabel(run: TripRun): string {
  const fmt = (key: string) =>
    new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
      new Date(`${key}T00:00:00Z`)
    );
  if (run.startDay === run.endDay) return fmt(run.startDay);
  const sameMonth = run.startDay.slice(0, 7) === run.endDay.slice(0, 7);
  return sameMonth
    ? `${fmt(run.startDay)} – ${Number(run.endDay.slice(8, 10))}`
    : `${fmt(run.startDay)} – ${fmt(run.endDay)}`;
}

/** Whole days inclusive. */
export function runDays(run: TripRun): number {
  return diffDays(run.startDay, run.endDay) + 1;
}
