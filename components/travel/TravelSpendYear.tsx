"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { Wallet } from "lucide-react";
import { formatUsd } from "@/lib/travel/constants";
import { officeDayKey } from "@/lib/dates/display";
import type { TravelSpendByMonth, TravelSpendYearSeries } from "@/lib/data/travel";

/**
 * "What has travel cost us this year, and how much of it went on people we did
 * not hire?" — Aimee's ask, which was the hired/not-hired distinction from the
 * traveler calendar applied to SPEND, over TIME.
 *
 * The split itself already existed on /reports as one summary bar. What did not
 * exist anywhere was the time dimension, which is the whole question: a total
 * cannot show that three recruiting visits landed in one month.
 *
 * COLORS ARE NOT A CHOICE HERE. Hired is emerald, not hired is amber and
 * unassigned is brand-eden/40, because that is what /reports already ships for
 * the same split — two pages showing one number in two color schemes is the bug.
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

function StatCard({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{label}</div>
      <div className={clsx("mt-1 text-xl font-semibold", tone ?? "text-brand-lea dark:text-slate-100")}>{value}</div>
      {note ? <div className="mt-0.5 text-[11px] text-brand-grey dark:text-slate-400">{note}</div> : null}
    </div>
  );
}

function SpendChart({ series, currentMonth }: { series: TravelSpendYearSeries; currentMonth: number | null }) {
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
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[520px]"
        role="img"
        aria-label={`Travel spend by month for ${series.year}: ${formatUsd(series.hired)} on travelers who were hired, ${formatUsd(series.notHired)} on travelers who were not`}
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

          const detail =
            m.trips === 0
              ? `${m.label} ${series.year}: no travel`
              : `${m.label} ${series.year}: ${formatUsd(m.total)} across ${m.trips} ${m.trips === 1 ? "trip" : "trips"}` +
                ` — hired ${formatUsd(m.hired)}, not hired ${formatUsd(m.notHired)}` +
                (m.unassigned > 0 ? `, unassigned ${formatUsd(m.unassigned)}` : "") +
                (m.inferred > 0 ? ` (${m.inferred} placed by a fallback date)` : "");

          return (
            <g key={m.month} className="tsy-col" style={{ animationDelay: `${m.month * 35}ms` }}>
              <title>{detail}</title>
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
              <text
                x={xOf(m.month)}
                y={H - 12}
                textAnchor="middle"
                className={clsx(
                  "text-[11px]",
                  m.month === currentMonth
                    ? "fill-brand-lea font-bold dark:fill-brand-gold"
                    : "fill-brand-grey dark:fill-slate-400"
                )}
              >
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function TravelSpendYear({ data }: { data: TravelSpendByMonth }) {
  // Most recent year with travel, which is the current year whenever there is
  // anything in it. Deliberately NOT read off the clock: the server and the
  // browser would have to agree on the date for that to hydrate cleanly, and a
  // January with no trips yet would open on an empty chart.
  const [year, setYear] = useState<number | null>(data.years[data.years.length - 1]?.year ?? null);

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

  const hiredPct = series.total > 0 ? Math.round((series.hired / series.total) * 100) : 0;

  return (
    <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-medium text-brand-lea dark:text-slate-100">
            <Wallet className="h-5 w-5 text-brand-gold" />
            Travel spend across {series.year}, hired vs not hired
          </h2>
          <p className="mt-0.5 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
            {series.total === 0
              ? `${series.tripCount} ${series.tripCount === 1 ? "trip" : "trips"} logged in ${series.year} with no cost recorded on any of them yet.`
              : `${formatUsd(series.total)} across ${series.tripCount} ${series.tripCount === 1 ? "trip" : "trips"}, month by month. ${hiredPct}% of it went on people who were ultimately hired.`}
          </p>
        </div>
        {data.years.length > 1 ? (
          <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
            Year
            <select
              value={series.year}
              onChange={(e) => setYear(Number(e.target.value))}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total spend" value={formatUsd(series.total)} note={`${series.tripCount} trips, canceled excluded`} />
        <StatCard
          label="Hired"
          value={formatUsd(series.hired)}
          note={`${series.hiredTravelers} ${series.hiredTravelers === 1 ? "traveler" : "travelers"}`}
          tone="text-emerald-700 dark:text-emerald-300"
        />
        <StatCard
          label="Not hired"
          value={formatUsd(series.notHired)}
          note={`${series.notHiredTravelers} ${series.notHiredTravelers === 1 ? "traveler" : "travelers"}`}
          tone="text-amber-700 dark:text-amber-300"
        />
        <StatCard
          label="Biggest month"
          value={(() => {
            const top = [...series.months].sort((a, b) => b.total - a.total)[0];
            return top && top.total > 0 ? formatUsd(top.total) : "—";
          })()}
          note={(() => {
            const top = [...series.months].sort((a, b) => b.total - a.total)[0];
            return top && top.total > 0 ? `${top.label} ${series.year}` : "nothing recorded yet";
          })()}
        />
      </div>

      <div className="mt-4">
        <SpendChart series={series} currentMonth={currentMonth} />
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
      </div>

      {/* What the numbers above are NOT. Every total in this app is a floor
          while items carry no amount, and a third of the trips have no travel
          dates of their own — saying so here is cheaper than somebody taking
          the sum to a budget meeting as an actual. */}
      <div className="mt-3 space-y-1 border-t border-brand-lea/10 pt-2 text-[11px] leading-snug text-brand-grey dark:border-white/10 dark:text-slate-400">
        {series.itemsMissingCost > 0 ? (
          <p>
            <span className="font-semibold text-brand-lea dark:text-slate-200">
              {series.itemsMissingCost} booked {series.itemsMissingCost === 1 ? "item has" : "items have"} no cost recorded
            </span>{" "}
            — flights, cars and hotels that were booked but never priced here. Every total above is a floor, not a final
            number.
          </p>
        ) : null}
        {series.inferredTrips > 0 ? (
          <p>
            {series.inferredTrips} {series.inferredTrips === 1 ? "trip carries" : "trips carry"} no travel dates, so{" "}
            {series.inferredTrips === 1 ? "it is" : "they are"} placed by the first booking on the trip, or failing that by
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
