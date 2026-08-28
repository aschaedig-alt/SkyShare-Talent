"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  CalendarDays,
  Plane,
  BedDouble,
  Car,
  Bus,
  Receipt,
  MapPin,
  Filter,
  ExternalLink
} from "lucide-react";
import {
  buildMonthGrid,
  chipParts,
  railItems,
  runDateLabel,
  runDays,
  runsFor,
  windowStart,
  addDaysKey,
  type FlightLeg,
  type Segment,
  type TripRun
} from "@/lib/travel/hub-calendar";
import { assignTravelerColors, FALLBACK_TRAVELER_COLOR } from "@/lib/travel/traveler-colors";
import { formatUsd, travelPurposeLabel, travelTabHref } from "@/lib/travel/constants";
import { officeDayKey } from "@/lib/dates/display";
import type { TravelCalendarData, TravelCalendarTraveler } from "@/lib/data/travel";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const RAIL_ICON = {
  flight: Plane,
  hotel: BedDouble,
  car: Car,
  transport: Bus,
  other: Receipt,
  event: MapPin
} as const;

/**
 * Everyone's travel on a six-week month, a colour per traveller.
 *
 * WHY SIX WEEKS. A calendar month splits any trip that crosses the 1st, and one
 * of the five real trips does exactly that — Jul 31 to Aug 1 — so in a plain
 * month grid it is invisible as a single trip from either side. The window is
 * always the Sunday on or before the 1st plus 42 days, which also keeps the
 * height fixed so the page does not jump as you page through months.
 *
 * WHY THE TIME SITS WHERE IT DOES. On a chip the time is always on whichever
 * side SLC is on: "DEN→SLC 9:37a" landing here, "10:39a SLC→DEN" leaving here.
 * Position alone says which end it belongs to, so no arrow is needed, and a time
 * in the other city is never shown — nobody here acts on it.
 */
export function TravelHubCalendar({ data }: { data: TravelCalendarData }) {
  const { travelers, undated } = data;

  const colors = useMemo(() => assignTravelerColors(travelers.map((t) => t.key)), [travelers]);
  const byKey = useMemo(() => new Map(travelers.map((t) => [t.key, t])), [travelers]);

  // Runs, once, per traveller.
  const runsByTraveler = useMemo(
    () =>
      travelers.map((t) => ({
        key: t.key,
        runs: t.trips.map(runsFor).filter((r): r is TripRun => r !== null)
      })),
    [travelers]
  );

  const [focused, setFocused] = useState<string | null>(null);

  /**
   * Which rail cards are open, for the ones somebody has clicked.
   *
   * Absent means "use the default", which is: open unless every trip in view has
   * already finished. A card is not hidden when it closes — the name, the dates
   * and the colour band all stay — so a past traveller still reads at a glance
   * and costs one click to open. Kept as an override map rather than seeded
   * state so paging to another month re-applies the default to whoever appears.
   */
  const [railOpen, setRailOpen] = useState<Record<string, boolean>>({});

  const visible = useMemo(
    () => (focused ? runsByTraveler.filter((t) => t.key === focused) : runsByTraveler),
    [runsByTraveler, focused]
  );

  const today = useMemo(() => officeDayKey(new Date()), []);

  /**
   * Open on THIS month, unless nothing is happening anywhere near it.
   *
   * Opening on the earliest trip was wrong in practice: the earliest trip in the
   * system is a completed one from June, so the page opened on travel that had
   * already happened while three live trips sat a month away. Today's month
   * first; only if its six-week window is genuinely empty do we jump to the
   * nearest trip, preferring an upcoming one over a past one.
   */
  const initial = useMemo(() => {
    const now = { year: Number(today.slice(0, 4)), month: Number(today.slice(5, 7)) - 1 };
    const from = windowStart(now.year, now.month);
    const to = addDaysKey(from, 41);

    const runs = runsByTraveler.flatMap((t) => t.runs);
    if (runs.some((r) => r.endDay >= from && r.startDay <= to)) return now;

    const upcoming = runs.filter((r) => r.startDay >= today).sort((a, b) => a.startDay.localeCompare(b.startDay))[0];
    const past = runs.filter((r) => r.startDay < today).sort((a, b) => b.startDay.localeCompare(a.startDay))[0];
    const target = upcoming ?? past;
    if (!target) return now;
    return { year: Number(target.startDay.slice(0, 4)), month: Number(target.startDay.slice(5, 7)) - 1 };
  }, [runsByTraveler, today]);

  const [cursor, setCursor] = useState(initial);

  const weeks = useMemo(
    () => buildMonthGrid(visible, cursor.year, cursor.month, today),
    [visible, cursor, today]
  );

  const shift = (delta: number) => {
    const next = new Date(Date.UTC(cursor.year, cursor.month + delta, 1));
    setCursor({ year: next.getUTCFullYear(), month: next.getUTCMonth() });
  };

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(cursor.year, cursor.month, 1))
  );
  const windowLabel = `${shortDay(weeks[0]?.days[0]?.key)} – ${shortDay(weeks[5]?.days[6]?.key)}`;

  // Whoever actually appears in the drawn window — the rail follows the grid.
  const inWindow = useMemo(() => {
    const from = weeks[0]?.days[0]?.key ?? "";
    const to = weeks[5]?.days[6]?.key ?? "";
    return runsByTraveler
      .map((t) => ({
        traveler: byKey.get(t.key),
        runs: t.runs.filter((r) => r.endDay >= from && r.startDay <= to)
      }))
      .filter((x): x is { traveler: TravelCalendarTraveler; runs: TripRun[] } => Boolean(x.traveler) && x.runs.length > 0);
  }, [runsByTraveler, weeks, byKey]);

  if (!travelers.length && !undated.length) return null;

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-brand-gold" />
          <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Who is travelling</h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="rounded border border-brand-lea/15 p-1 text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-200"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[180px] text-center text-sm font-semibold text-brand-lea dark:text-slate-100">
            {monthName}
            <span className="ml-1.5 text-[11px] font-medium text-brand-grey dark:text-slate-400">{windowLabel}</span>
          </span>
          <button
            onClick={() => shift(1)}
            aria-label="Next month"
            className="rounded border border-brand-lea/15 p-1 text-brand-lea transition hover:bg-brand-gold/10 dark:border-white/10 dark:text-slate-200"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        {/* ---------------- the grid ---------------- */}
        <div className="min-w-0 overflow-x-auto">
          {/* The floor that keeps a chip inside its own day at ANY width. Seven
              columns out of 700px is a 100px cell, and the widest chip a real
              trip produces ("10:39a SLC→DEN") is 89px. Below this the wrapper
              scrolls sideways rather than letting cells shrink under the chips —
              which is what keeps the phone case honest instead of squashed. */}
          <div className="min-w-[700px]">
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-t border border-b-0 border-brand-lea/10 bg-brand-lea/10 dark:border-white/10 dark:bg-white/10">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="bg-brand-cloudDancer/70 py-1.5 text-center text-[10px] font-bold uppercase tracking-[0.09em] text-brand-grey dark:bg-white/5 dark:text-slate-400"
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-px overflow-hidden rounded-b border border-t-0 border-brand-lea/10 bg-brand-lea/10 dark:border-white/10 dark:bg-white/10">
              {weeks.map((week, wi) => (
                <div key={week.days[0].key}>
                  {/* EVERY DAY IS THE SAME WIDTH, in every week.
                      grid-cols-7 is repeat(7, minmax(0, 1fr)), so no cell can be
                      widened by what is inside it — a long chip clips (see Chip)
                      rather than stretching Tuesday. The runs overlay below uses
                      the same seven columns, and the weekday header above matches
                      the day cells exactly (measured: identical left edges).
                      Measured across all six weeks: every week resolves to the
                      SAME column template, with a 0.013px spread between columns
                      that is browser sub-pixel rounding of 1fr over a width not
                      divisible by seven. Do not "fix" that with fixed widths or a
                      calc() — it is invisible, and hard widths reintroduce the
                      real bug of a column that will not match its header. */}
                  <div className="relative grid grid-cols-7 gap-px">
                    {week.days.map((day) => (
                      <div
                        key={day.key}
                        style={{ minHeight: weekRowHeight(week.lanes.length) }}
                        className={clsx(
                          "px-1.5 py-1",
                          day.inMonth ? "bg-white dark:bg-brand-panel" : "bg-[#e7eef7] dark:bg-[#0b1c2b]",
                          day.isToday && "ring-2 ring-inset ring-brand-gold"
                        )}
                      >
                        <span
                          className={clsx(
                            "flex items-baseline gap-1.5 text-[11px] font-semibold tabular-nums",
                            day.inMonth
                              ? "text-brand-grey dark:text-slate-400"
                              : "text-brand-grey/70 dark:text-slate-500"
                          )}
                        >
                          {day.dayNum}
                          {day.monthTag ? (
                            <span className="text-[9.5px] font-extrabold uppercase tracking-[0.07em] text-brand-gold">
                              {day.monthTag}
                            </span>
                          ) : null}
                        </span>
                      </div>
                    ))}

                    {/* Trip runs float over the day cells so one run can span several. */}
                    <div className="pointer-events-none absolute inset-x-0 top-[26px] grid grid-cols-7 gap-px">
                      {week.lanes.map((lane, li) => (
                        <div key={`${wi}-${li}`} className="col-span-7 mb-1 grid grid-cols-7 gap-px">
                          {lane.map((seg) => (
                            <Run
                              key={`${seg.tripId}-${seg.startCol}-${seg.loneLeg ? "l" : "r"}`}
                              seg={seg}
                              color={colors.get(seg.travelerKey) ?? FALLBACK_TRAVELER_COLOR}
                              name={byKey.get(seg.travelerKey)?.name ?? ""}
                              // A chip is a real link to that trip on that
                              // person's profile, so it ctrl-clicks into a new
                              // tab like everything else that changes the page.
                              href={(() => {
                                const t = byKey.get(seg.travelerKey);
                                return t ? travelTabHref(t.href, seg.tripId) : null;
                              })()}
                            />
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ---------------- the rail ---------------- */}
        <div className="min-w-0">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.09em] text-brand-grey dark:text-slate-400">
            {inWindow.length === 0
              ? "Nobody in view"
              : `${inWindow.length} traveller${inWindow.length === 1 ? "" : "s"} in view`}
          </p>

          {inWindow.length === 0 ? (
            <p className="text-[12.5px] text-brand-grey dark:text-slate-400">
              Nothing in this six-week window. Use the arrows to find the month you want.
            </p>
          ) : null}

          {inWindow.map(({ traveler, runs }) => {
            const c = colors.get(traveler.key) ?? FALLBACK_TRAVELER_COLOR;
            const dim = focused !== null && focused !== traveler.key;
            const allOver = runs.every((r) => r.endDay < today);
            const open = railOpen[traveler.key] ?? !allOver;
            return (
              <div
                key={traveler.key}
                className={clsx(
                  "mb-2.5 overflow-hidden rounded border border-brand-lea/12 transition dark:border-white/10",
                  dim && "opacity-45"
                )}
              >
                {/* C2: the colour carries a full band rather than a dot.
                    Three things live on it, and they used to be one: the whole
                    band was the focus filter, which meant there was nowhere left
                    to put "open this" or "fold this away". Clicking the NAME now
                    folds — the thing a header is expected to do — and the two
                    icon buttons carry focus and open. */}
                <div className={clsx("flex items-center gap-1 px-3 py-1.5", c.band)}>
                  <button
                    onClick={() => setRailOpen((cur) => ({ ...cur, [traveler.key]: !open }))}
                    title={open ? `Fold ${traveler.name} away` : `Show ${traveler.name}'s trip`}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-1.5 text-left transition hover:brightness-105"
                  >
                    {open ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    )}
                    <span className="truncate text-[13px] font-bold">{traveler.name}</span>
                    <span className="ml-auto shrink-0 text-[10.5px] font-semibold opacity-80">
                      {runs.map(runDateLabel).join(" · ")}
                    </span>
                  </button>
                  <button
                    onClick={() => setFocused(focused === traveler.key ? null : traveler.key)}
                    title={focused === traveler.key ? "Show everyone again" : `Show only ${traveler.name} on the grid`}
                    aria-pressed={focused === traveler.key}
                    className={clsx(
                      "shrink-0 rounded p-1 transition hover:brightness-110",
                      focused === traveler.key ? "bg-black/15" : "opacity-70 hover:opacity-100"
                    )}
                  >
                    <Filter className="h-3.5 w-3.5" />
                  </button>
                  {/* "Open this PERSON" — their own profile, on its Travel tab.
                      It used to load a copy of the profile at the bottom of
                      this page, which is the thing the team asked to be rid of.
                      A real link, so it ctrl-clicks into a new tab. */}
                  <Link
                    href={travelTabHref(traveler.href)}
                    title={`Open ${traveler.name}'s Travel tab`}
                    className="shrink-0 rounded p-1 opacity-70 transition hover:opacity-100 hover:brightness-110"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>

                <div className={clsx("bg-white px-3 py-2 dark:bg-brand-panel", !open && "hidden")}>
                  {runs.map((run) => (
                    <div key={run.tripId}>
                      <p className="flex flex-wrap items-center gap-1.5 text-[12px] text-brand-grey dark:text-slate-400">
                        <Link
                          href={travelTabHref(traveler.href, run.tripId)}
                          title="Open this trip on their Travel tab"
                          className="font-semibold text-brand-eden underline-offset-2 transition hover:underline dark:text-brand-sweet"
                        >
                          {travelPurposeLabel(run.purpose)}
                        </Link>
                        · {runDays(run)} day{runDays(run) === 1 ? "" : "s"}
                        {run.inferred ? (
                          <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                            dates from booking text
                          </span>
                        ) : null}
                      </p>
                      <ul className="mt-1">
                        {railItems(run).map((item, i) => {
                          const Icon = RAIL_ICON[item.kind];
                          return (
                            <li
                              key={`${run.tripId}-${i}`}
                              className="flex items-baseline gap-2 border-t border-brand-lea/8 py-1 text-[12.5px] first:border-t-0 dark:border-white/8"
                            >
                              <Icon className="h-3 w-3 shrink-0 translate-y-0.5 text-brand-grey/70 dark:text-slate-500" />
                              {item.route ? (
                                <span className="shrink-0 font-bold tracking-[0.04em] text-brand-lea dark:text-slate-100">
                                  {item.route}
                                </span>
                              ) : null}
                              <span className="min-w-0 truncate text-brand-grey dark:text-slate-400">{item.label}</span>
                              <span className="ml-auto shrink-0 tabular-nums text-brand-grey/80 dark:text-slate-500">
                                {item.time ?? (item.amount != null ? formatUsd(item.amount) : "—")}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {focused ? (
            <button
              onClick={() => setFocused(null)}
              className="rounded border border-brand-lea/15 px-2 py-1 text-[11.5px] font-semibold text-brand-grey transition hover:text-brand-lea dark:border-white/10 dark:text-slate-400"
            >
              Show everyone
            </button>
          ) : null}

          {/* Anyone who cannot be drawn is NAMED. Leaving them out silently is how
              a trip with no dates disappears from view entirely. */}
          {undated.length > 0 ? (
            <p className="mt-2 rounded border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
              Not on the calendar — no readable dates yet:{" "}
              {undated.map((u, i) => (
                <span key={u.href}>
                  {i > 0 ? ", " : ""}
                  <span className="font-semibold">{u.name}</span>
                  {u.tripCount > 1 ? ` (${u.tripCount} trips)` : ""}
                </span>
              ))}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * One run inside one week: a dashed capsule on each day somebody flies, joined by
 * a 6px rule across the days they are simply here. Where the run carries on past
 * the week edge the end is squared off, so the break reads as "continues" rather
 * than as two separate trips.
 */
function Run({
  seg,
  color,
  name,
  href
}: {
  seg: Segment;
  color: { bar: string; chip: string; dot: string; ring: string };
  name: string;
  /** Where this run goes: that trip, on that person's Travel tab. */
  href: string | null;
}) {
  const style = { gridColumn: `${seg.startCol} / span ${seg.span}` };

  if (seg.loneLeg) {
    return (
      <div style={style} className="pointer-events-auto flex items-center overflow-hidden">
        <Chip leg={seg.loneLeg} color={color} name={name} href={href} />
      </div>
    );
  }

  return (
    <div style={style} className="pointer-events-auto flex items-center overflow-hidden">
      {seg.leftLeg ? (
        <Chip leg={seg.leftLeg} color={color} name={name} href={href} />
      ) : seg.label ? (
        <ChipShell
          href={href}
          title={`${name} — ${seg.label}`}
          className={clsx(
            "min-w-0 truncate rounded border border-solid px-1 py-px text-[9px] font-bold leading-[1.45]",
            color.chip
          )}
        >
          {seg.label}
        </ChipShell>
      ) : null}

      {seg.span > 1 || seg.continuesLeft || seg.continuesRight ? (
        <span
          aria-hidden
          className={clsx(
            "h-[6px] min-w-[8px] flex-1 opacity-30",
            color.bar,
            seg.continuesLeft ? "rounded-r-[3px]" : "rounded-[3px]",
            seg.continuesRight && "rounded-l-[3px] rounded-r-none"
          )}
          style={{
            marginLeft: seg.continuesLeft ? -6 : -2,
            marginRight: seg.continuesRight ? -6 : -2
          }}
        />
      ) : null}

      {seg.rightLeg ? <Chip leg={seg.rightLeg} color={color} name={name} href={href} /> : null}
    </div>
  );
}

/**
 * A chip that navigates when we know where to, and is inert text when we do not.
 *
 * href is null only if a segment's traveller is missing from the map, which
 * should not happen — but a link that goes nowhere is worse than plain text,
 * because it looks clickable and then swallows the click.
 */
function ChipShell({
  href,
  title,
  className,
  children
}: {
  href: string | null;
  title: string;
  className: string;
  children: React.ReactNode;
}) {
  const style = { borderColor: "currentColor" };
  if (!href) {
    return (
      <span title={title} className={className} style={style}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} title={title} className={className} style={style}>
      {children}
    </Link>
  );
}

/** ✈ DEN→SLC 9:37a  ·  ✈ 10:39a SLC→DEN — the time always on the SLC side. */
function Chip({
  leg,
  color,
  name,
  href
}: {
  leg: FlightLeg;
  color: { chip: string };
  name: string;
  href: string | null;
}) {
  const { timeBefore, from, to, route, timeAfter } = chipParts(leg);
  const where =
    leg.direction === "in" ? "lands here" : leg.direction === "out" ? "leaves here" : "flight";

  return (
    <ChipShell
      href={href}
      title={`${name} — ${route ?? "Flight"}${leg.vendor ? ` · ${leg.vendor}` : ""}${
        leg.time ? ` · ${leg.time} ${where}` : ""
      }${leg.inferred ? " · date read from the booking text" : ""}`}
      className={clsx(
        // min-w-0 + overflow-hidden matter as much as the size: the chip is
        // whitespace-nowrap, so without them a "10:39a SLC→DEN" is simply wider
        // than a day cell and spills out over the next one.
        // No plane here. At 9px the glyph reads as a smudge rather than an icon,
        // and every chip on this grid is a flight anyway — it was costing width
        // to say something the row already says. It stays in the rail, where
        // there is room for it and where it distinguishes a flight from a hotel.
        "flex min-w-0 items-center gap-[3px] overflow-hidden whitespace-nowrap rounded border border-dashed px-1 py-px text-[9px] font-bold leading-[1.45]",
        color.chip
      )}
    >
      {timeBefore ? <span className="shrink-0 tabular-nums">{timeBefore}</span> : null}
      {from && to ? (
        <span className="truncate tracking-[0.02em]">
          {from}
          <Arrow />
          {to}
        </span>
      ) : route ? (
        <span className="truncate tracking-[0.02em]">{route}</span>
      ) : null}
      {timeAfter ? <span className="shrink-0 tabular-nums">{timeAfter}</span> : null}
    </ChipShell>
  );
}

/**
 * The arrow between two airport codes: 40% narrower, with room either side.
 *
 * scaleX alone would only squash the glyph — a transform does not change layout,
 * so the box keeps its full width. The margin is what decides how close the
 * codes sit to it. At -0.2em the box hugged the squashed glyph exactly and the
 * arrow ended up jammed against both codes; -0.04em spends a little of the width
 * the scaling saved on about 1.5px of air on each side, and still leaves the
 * chip well short of where it started.
 */
function Arrow() {
  return (
    <span aria-hidden className="mx-[-0.04em] inline-block scale-x-[0.6]">
      →
    </span>
  );
}

/**
 * What one stacked lane actually costs, measured in the browser at 2, 3 and 4
 * lanes rather than derived from the type sizes.
 *
 * Both attempts to reason it out were wrong. On paper it looked like 22px — chip
 * text plus padding plus gap. Measuring the lane element gave 32px, which was
 * still short because that height excludes its own 4px bottom margin. Growth
 * between lane counts is ~35.7px, so 36 with the constant below leaves a few
 * pixels spare at every count.
 */
const LANE_HEIGHT = 36;

/** Clears the date number before the first lane starts. */
const DATE_ROW_HEIGHT = 26;

/**
 * How tall a week row has to be to hold its runs.
 *
 * Runs are drawn in an absolutely-positioned overlay so one can span several
 * days — which means they contribute NOTHING to the row's own height. A fixed
 * 84px was fine while no week had more than one traveller, and would have
 * silently broken the first time two people's trips overlapped.
 */
function weekRowHeight(laneCount: number): number {
  return Math.max(84, DATE_ROW_HEIGHT + laneCount * LANE_HEIGHT + 6);
}

function shortDay(key: string | undefined): string {
  if (!key) return "";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${key}T00:00:00Z`)
  );
}
