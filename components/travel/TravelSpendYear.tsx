"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Wallet, X } from "lucide-react";
import { formatUsd } from "@/lib/travel/constants";
import { officeDayKey } from "@/lib/dates/display";
import {
  MONTH_NAMES,
  monthRank,
  monthRankLabel,
  type TravelSpendByMonth,
  type TravelSpendMonthPoint,
  type TravelSpendYearSeries
} from "@/lib/travel/spend";

/**
 * "What has travel cost us this year, and how much of it went on people we did
 * not hire?" — Aimee's ask, which was the hired/not-hired distinction from the
 * traveler calendar applied to SPEND, over TIME.
 *
 * The split itself already existed on /reports as one summary bar. What did not
 * exist anywhere was the time dimension, which is the whole question: a total
 * cannot show that three recruiting visits landed in one month.
 *
 * A MONTH IS CLICKABLE, and the four tiles follow it. Her words (feedback, Sep
 * 11): "When I click on the month of September, I'd like the information in the
 * four boxes above to move to that month's info". Clicking a bar selects that
 * month; clicking it again, or "Whole year", goes back. The fourth tile says
 * where the month RANKS ("2nd-highest") rather than repeating "Biggest month",
 * which she said did not work once you are looking at one month.
 *
 * ONE COMPONENT, TWO PAGES. The Travel page renders it on its own and it keeps
 * its own year and month. The Reports tab CONTROLS it — passes `year`, `month`
 * and the change handlers — because there the selected month also scopes the
 * breakdowns and the trip table below, and a month held in two places is two
 * answers to "which month am I looking at".
 *
 * COLORS ARE NOT A CHOICE HERE. Hired is emerald, not hired is amber and
 * unassigned is brand-eden/40, and the Reports breakdown bars use the same three,
 * so one number never appears in two color schemes.
 *
 * Hand-rolled SVG on purpose: there is no charting library in this repo and the
 * house pattern is ClimbChart in components/reports/ReportsWorkspace.tsx, whose
 * mechanics (viewBox, currentColor gridlines, fill- utilities on SVG text, a
 * child <title> for hover detail, a reduced-motion guard) this follows.
 */

const selectClass =
  "rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-sm text-brand-lea outline-none focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100 dark:[color-scheme:dark]";

/** "$4.5K" — short enough for an axis label at 11px. */
function compactUsd(v: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1
  }).format(v);
}

/**
 * An axis top that divides into round gridlines. Pick the STEP first and
 * multiply up, rather than rounding the max and dividing: $4,277 rounded to
 * $5,000 gives gridlines of $1,666.67.
 */
function axisTop(max: number, ticks: number): number {
  if (max <= 0) return 1;
  const target = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(target)));
  for (const s of [1, 1.5, 2, 2.5, 5, 7.5, 10]) {
    if (target <= s * mag) return s * mag * ticks;
  }
  return 10 * mag * ticks;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "3 travelers · $1,498.03 each" — the per-person figure is what "what does
 *  hiring somebody really cost" is asking, so it rides on the tile. */
function travelersNote(spend: number, travelers: number): string {
  if (travelers === 0) return "0 travelers";
  return `${plural(travelers, "traveler", "travelers")} · ${formatUsd(spend / travelers)} each`;
}

function StatCard({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{label}</div>
      <div className={clsx("mt-1 text-xl font-semibold", tone ?? "text-brand-lea dark:text-slate-100")}>{value}</div>
      {note ? <div className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">{note}</div> : null}
    </div>
  );
}

function monthDetail(m: TravelSpendMonthPoint, year: number): string {
  if (m.trips === 0) return `${m.label} ${year}: no travel`;
  return (
    `${m.label} ${year}: ${formatUsd(m.total)} across ${plural(m.trips, "trip", "trips")}` +
    ` — hired ${formatUsd(m.hired)}, not hired ${formatUsd(m.notHired)}` +
    (m.unassigned > 0 ? `, unassigned ${formatUsd(m.unassigned)}` : "") +
    (m.inferred > 0 ? ` (${m.inferred} placed by a fallback date)` : "")
  );
}

function SpendChart({
  series,
  currentMonth,
  selectedMonth,
  onSelect
}: {
  series: TravelSpendYearSeries;
  currentMonth: number | null;
  selectedMonth: number | null;
  onSelect: (month: number | null) => void;
}) {
  const W = 720;
  const H = 240;
  const padL = 56;
  const padR = 16;
  const padT = 18;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const slot = plotW / 12;
  const barW = Math.min(30, slot * 0.56);
  const baseline = padT + plotH;

  const ticks = 3;
  const top = axisTop(Math.max(...series.months.map((m) => m.total), 0), ticks);
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => (top * i) / ticks);
  const yOf = (v: number) => baseline - (v / top) * plotH;
  const xOf = (m: number) => padL + slot * m + slot / 2;

  return (
    // overflow-y-hidden is not redundant: per the CSS overflow spec, setting one
    // axis to anything but visible makes the OTHER compute to auto, so
    // overflow-x-auto alone would switch on a vertical scrollbar as well. The
    // min-width is the last resort of the scrollbar ladder — twelve labeled
    // columns cannot be made legible at 375px, since SVG text scales with the
    // viewBox and 11px becomes 6px.
    <div className="w-full overflow-x-auto overflow-y-hidden">
      <style>{`
        @keyframes tsy-rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }
        .tsy-col { animation: tsy-rise .5s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .tsy-col { animation: none; opacity: 1; transform: none; }
        }
      `}</style>
      {/* role="group", not "img": the months inside are buttons now, and an img
          role would hide them from a screen reader entirely. */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[520px]"
        role="group"
        aria-label={`Travel spend by month for ${series.year}: ${formatUsd(series.hired)} on travelers who were hired, ${formatUsd(series.notHired)} on travelers who were not. Each month is a button that shows that month on its own.`}
      >
        {gridVals.map((v) => (
          <g key={v}>
            <line
              x1={padL}
              y1={yOf(v)}
              x2={W - padR}
              y2={yOf(v)}
              stroke="currentColor"
              className="text-brand-lea/10 dark:text-white/10"
              strokeWidth={1}
            />
            <text x={padL - 8} y={yOf(v) + 4} textAnchor="end" className="fill-brand-grey text-[11px] dark:fill-slate-400">
              {compactUsd(v)}
            </text>
          </g>
        ))}

        {series.months.map((m) => {
          const x = xOf(m.month) - barW / 2;
          const selected = selectedMonth === m.month;
          const dimmed = selectedMonth !== null && !selected;
          const segments = [
            { key: "hired", value: m.hired, className: "fill-emerald-500" },
            { key: "notHired", value: m.notHired, className: "fill-amber-400" },
            { key: "unassigned", value: m.unassigned, className: "fill-brand-eden/40" }
          ].filter((s) => s.value > 0);

          let cursor = baseline;
          const rects = segments.map((s) => {
            // A month with $12 in it is a real month, so a segment never rounds
            // away to nothing — the floor costs a pixel of stack accuracy and
            // buys a bar you can actually see and hover.
            const h = Math.max((s.value / top) * plotH, 2);
            cursor -= h;
            return { ...s, y: cursor, h };
          });

          const detail = monthDetail(m, series.year);
          const toggle = () => onSelect(selected ? null : m.month);

          return (
            // The entrance animation lives on this OUTER group and nothing else
            // does. It runs with fill-mode "both", so its final opacity keeps
            // applying after it ends and would silently beat the dimming class —
            // which is why dimming sits on the bars' own group further in.
            <g key={m.month} className="tsy-col" style={{ animationDelay: `${m.month * 35}ms` }}>
              <g
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`${detail}. ${selected ? "Selected — press again for the whole year." : "Press to show this month on its own."}`}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                  }
                }}
                className="group/month cursor-pointer outline-none"
              >
                <title>{detail}</title>
                {/* The hit area is the whole column, label included, not the
                    painted bar: an empty month has a 2px seat to aim at, and a
                    small bar is a small target. Transparent, not "none" — a
                    fill of none takes no clicks. */}
                <rect x={padL + slot * m.month} y={padT - 8} width={slot} height={H - padT + 8} fill="transparent" />
                {/* Selected = a navy wash behind the column and a gold rule under
                    its label — navy + gold, per the locked design system, and
                    neither one repaints the hired/not-hired bars themselves. */}
                {selected ? (
                  <rect
                    x={padL + slot * m.month + 2}
                    y={padT - 6}
                    width={slot - 4}
                    height={H - padT + 4}
                    rx={4}
                    className="fill-brand-lea/[0.07] dark:fill-white/[0.08]"
                  />
                ) : null}
                <g
                  className={clsx(
                    "transition-opacity duration-150 group-hover/month:opacity-100 group-hover/month:drop-shadow-[0_0_6px_rgba(234,170,0,0.55)] group-focus-visible/month:opacity-100 group-focus-visible/month:drop-shadow-[0_0_6px_rgba(234,170,0,0.55)]",
                    dimmed ? "opacity-40" : "opacity-100"
                  )}
                >
                  {/* An empty month has to read as "no travel", not as a broken
                      chart — so it keeps a visible seat on the axis. */}
                  {rects.length === 0 ? (
                    <rect
                      x={x}
                      y={baseline - 2}
                      width={barW}
                      height={2}
                      rx={1}
                      className="fill-brand-lea/10 dark:fill-white/15"
                    />
                  ) : (
                    rects.map((r) => (
                      <rect key={r.key} x={x} y={r.y} width={barW} height={r.h} rx={2} className={r.className} />
                    ))
                  )}
                </g>
                <text
                  x={xOf(m.month)}
                  y={H - 12}
                  textAnchor="middle"
                  className={clsx(
                    "text-[11px]",
                    selected || m.month === currentMonth
                      ? "fill-brand-lea font-bold dark:fill-brand-gold"
                      : "fill-brand-grey dark:fill-slate-400"
                  )}
                >
                  {m.label}
                </text>
                {selected ? (
                  <rect x={xOf(m.month) - 11} y={H - 6} width={22} height={3} rx={1.5} className="fill-brand-gold" />
                ) : null}
              </g>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

type Props = {
  data: TravelSpendByMonth;
  /**
   * CONTROLLED MODE — the Reports tab. Pass the year and month and the handlers
   * and this component holds neither; leave them off (the Travel page) and it
   * keeps its own. In controlled mode the year picker is the parent's, in its
   * filter row, so this one is not drawn.
   */
  year?: number;
  month?: number | null;
  onYearChange?: (year: number) => void;
  onMonthChange?: (month: number | null) => void;
  /** Words for a filtered slice ("Flight Ops · Not hired"), so a printed or
   *  screenshotted chart says what it is of. Only the Reports tab passes it. */
  sliceNote?: string | null;
};

export function TravelSpendYear({ data, year: yearProp, month: monthProp, onYearChange, onMonthChange, sliceNote }: Props) {
  // Most recent year with travel, which is the current year whenever there is
  // anything in it. Deliberately NOT read off the clock: the server and the
  // browser would have to agree on the date for that to hydrate cleanly, and a
  // January with no trips yet would open on an empty chart.
  const [ownYear, setOwnYear] = useState<number | null>(data.years[data.years.length - 1]?.year ?? null);
  // Whole year until somebody clicks a month.
  const [ownMonth, setOwnMonth] = useState<number | null>(null);

  const yearControlled = yearProp !== undefined;
  const monthControlled = onMonthChange !== undefined;
  const year = yearControlled ? yearProp : ownYear;
  const month = monthControlled ? (monthProp ?? null) : ownMonth;

  function selectMonth(next: number | null) {
    if (monthControlled) onMonthChange?.(next);
    else setOwnMonth(next);
  }
  function selectYear(next: number) {
    if (onYearChange) onYearChange(next);
    else setOwnYear(next);
    // A month belongs to a year; carrying "September" across to another year
    // would silently show a different September than the one clicked.
    if (!monthControlled) setOwnMonth(null);
  }

  // The clock is only used to bold the month we are in, after mount.
  const [todayKey, setTodayKey] = useState<string | null>(null);
  useEffect(() => setTodayKey(officeDayKey(new Date())), []);

  const series = useMemo(
    () => data.years.find((y) => y.year === year) ?? data.years[data.years.length - 1] ?? null,
    [data.years, year]
  );

  if (!series) return null;

  const currentMonth =
    todayKey && series.year === Number(todayKey.slice(0, 4)) ? Number(todayKey.slice(5, 7)) - 1 : null;

  const point = month !== null ? (series.months[month] ?? null) : null;
  const periodName = point ? `${MONTH_NAMES[point.month]} ${series.year}` : String(series.year);
  const hiredPct = series.total > 0 ? Math.round((series.hired / series.total) * 100) : 0;
  const topMonth = [...series.months].sort((a, b) => b.total - a.total)[0];
  const rank = point ? monthRank(series, point.month) : null;

  // The caveats follow the period on screen: "7 items have no cost" under a
  // September view is a claim about the whole year and reads as one about
  // September.
  const itemsMissingCost = point ? point.itemsMissingCost : series.itemsMissingCost;
  const inferredTrips = point ? point.inferred : series.inferredTrips;

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium text-brand-lea dark:text-slate-100">
            <Wallet className="h-5 w-5 text-brand-gold" />
            Travel spend across {series.year}, hired vs not hired
          </h2>
          <p className="mt-0.5 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
            {sliceNote ? <span className="font-semibold text-brand-lea dark:text-slate-200">{sliceNote}. </span> : null}
            {point
              ? point.trips === 0
                ? `No travel in ${periodName}.`
                : `${periodName}: ${formatUsd(point.total)} across ${plural(point.trips, "trip", "trips")}.`
              : series.total === 0
                ? `${plural(series.tripCount, "trip", "trips")} logged in ${series.year} with no cost recorded on any of them yet.`
                : `${formatUsd(series.total)} across ${plural(series.tripCount, "trip", "trips")}, month by month. ${hiredPct}% of it went on people who were ultimately hired.`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {point ? (
            <button
              type="button"
              onClick={() => selectMonth(null)}
              className="inline-flex items-center gap-1 rounded border border-brand-gold bg-brand-lea px-2.5 py-1 text-xs font-semibold text-white transition hover:shadow-glow"
              title={`Showing ${periodName} — go back to the whole of ${series.year}`}
            >
              {MONTH_NAMES[point.month]}
              <X className="h-3 w-3" aria-hidden />
              <span className="sr-only">Show the whole of {series.year}</span>
            </button>
          ) : null}
          {!yearControlled && data.years.length > 1 ? (
            <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
              Year
              <select
                value={series.year}
                onChange={(e) => selectYear(Number(e.target.value))}
                className={clsx(selectClass, "font-normal normal-case tracking-normal")}
              >
                {[...data.years].reverse().map((y) => (
                  <option key={y.year} value={y.year}>
                    {y.year}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      </div>

      {point ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label={`Spend in ${point.label} ${series.year}`}
            value={formatUsd(point.total)}
            note={
              plural(point.trips, "trip", "trips") +
              (point.unassigned > 0 ? ` · ${formatUsd(point.unassigned)} with no traveler` : "")
            }
          />
          <StatCard
            label="Hired"
            value={formatUsd(point.hired)}
            note={travelersNote(point.hired, point.hiredTravelers)}
            tone="text-emerald-700 dark:text-emerald-300"
          />
          <StatCard
            label="Not hired"
            value={formatUsd(point.notHired)}
            note={travelersNote(point.notHired, point.notHiredTravelers)}
            tone="text-amber-700 dark:text-amber-300"
          />
          <StatCard
            label={`Rank in ${series.year}`}
            value={rank ? monthRankLabel(rank) : "—"}
            note={
              rank
                ? `out of ${plural(rank.of, "month", "months")} with spend in ${series.year}`
                : point.trips > 0
                  ? "No cost recorded on this month's trips yet"
                  : `No travel in ${MONTH_NAMES[point.month]}`
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total spend" value={formatUsd(series.total)} note={`${plural(series.tripCount, "trip", "trips")}, canceled excluded`} />
          <StatCard
            label="Hired"
            value={formatUsd(series.hired)}
            note={travelersNote(series.hired, series.hiredTravelers)}
            tone="text-emerald-700 dark:text-emerald-300"
          />
          <StatCard
            label="Not hired"
            value={formatUsd(series.notHired)}
            note={travelersNote(series.notHired, series.notHiredTravelers)}
            tone="text-amber-700 dark:text-amber-300"
          />
          <StatCard
            label="Highest month"
            value={topMonth && topMonth.total > 0 ? formatUsd(topMonth.total) : "—"}
            note={topMonth && topMonth.total > 0 ? `${MONTH_NAMES[topMonth.month]} ${series.year}` : "nothing recorded yet"}
          />
        </div>
      )}

      <div className="mt-4">
        <SpendChart series={series} currentMonth={currentMonth} selectedMonth={point ? point.month : null} onSelect={selectMonth} />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[11px] font-medium text-brand-grey dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Hired {formatUsd(series.hired)}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> Not hired {formatUsd(series.notHired)}
        </span>
        {series.unassigned > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-eden/40" /> No traveler on the trip {formatUsd(series.unassigned)}
          </span>
        ) : null}
        <span className="ml-auto font-normal">
          {point ? "Click the month again, or its name above, for the whole year." : "Click a month to see it on its own."}
        </span>
      </div>

      {/* What the numbers above are NOT. Every total in this app is a floor
          while items carry no amount, and a third of the trips have no travel
          dates of their own — saying so here is cheaper than somebody taking
          the sum to a budget meeting as an actual. */}
      <div className="mt-3 space-y-1 border-t border-brand-lea/10 pt-2 text-[11px] leading-snug text-brand-grey dark:border-white/10 dark:text-slate-400">
        {itemsMissingCost > 0 ? (
          <p>
            <span className="font-semibold text-brand-lea dark:text-slate-200">
              {itemsMissingCost} booked {itemsMissingCost === 1 ? "item" : "items"}
              {point ? ` in ${periodName}` : ""} {itemsMissingCost === 1 ? "has" : "have"} no cost recorded
            </span>{" "}
            — flights, cars and hotels that were booked but never priced here. Every total above is a floor, not a final
            number.
          </p>
        ) : null}
        {inferredTrips > 0 ? (
          <p>
            {inferredTrips} {inferredTrips === 1 ? "trip" : "trips"}
            {point ? ` in ${periodName}` : ""} {inferredTrips === 1 ? "carries" : "carry"} no travel dates, so{" "}
            {inferredTrips === 1 ? "it is" : "they are"} placed by the first booking on the trip, or failing that by
            the day the trip was logged.
          </p>
        ) : null}
        <p>
          Hired means the traveler was ultimately hired, not that the trip was booked for a hire: somebody who flew in for a
          visit and then declined the offer counts as not hired. Canceled trips are excluded.
        </p>
      </div>
    </section>
  );
}
