"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Download } from "lucide-react";
import type { ReportsData } from "@/lib/data/reports";
import type { UpgradePilot } from "@/lib/data/employee-journey";
import type { FleetStaffing } from "@/lib/data/fleet-staffing";
// From the PURE ladder module, never from employee-journey — that one imports
// Prisma, and a value import from a client component pulls it into the browser
// bundle and 500s the page with "Can not resolve fs".
import { SKYSHARE_LADDER, ladderRank, nextRungs } from "@/lib/fleet/pilot-ladder";
import { formatUsd, travelPurposeLabel, travelStatusLabel } from "@/lib/travel/constants";
import { TravelSpendYear } from "@/components/travel/TravelSpendYear";
import { ReportShareButton } from "@/components/reports/ReportShareButton";
import { formatCalendarDay, formatMomentDate } from "@/lib/dates/display";

type ReportsWorkspaceProps = {
  data: ReportsData;
  logoDataUrl?: string | null;
  canShare?: boolean;
};

// Chosen calendar days (start dates, expiries) read in UTC; real moments — an
// orientation session, a flight's departure — read in Mountain. See
// lib/dates/display.ts for why the two cannot share one formatter.
function fmtDate(iso: string | null) {
  return formatCalendarDay(iso) || "—";
}
function fmtMoment(iso: string | null) {
  return formatMomentDate(iso) || "—";
}

// Human span for a day count (upgrade timing).
function fmtSpan(days: number | null): string {
  if (days === null) return "—";
  if (days < 60) return `${days} days`;
  const months = days / 30.44;
  if (months < 18) return `${months.toFixed(months < 3 ? 1 : 0)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
}

// The ladder moved into lib/fleet/pilot-ladder.ts, because it now decides
// CLASSIFICATION as well as what to suggest next — "almost any aircraft to a larger
// aircraft is an upgrade" needs an ordering, and a second copy here would be a
// second answer to whether a pilot advanced. Imported so there is one.

// The pilot's most recent FLYING role — a management title (e.g. Assistant
// Director of Training) doesn't change which aircraft they fly, so upgrades are
// still measured from their real seat.
function lastFlyingStep(p: UpgradePilot): UpgradePilot["steps"][number] | null {
  for (let i = p.steps.length - 1; i >= 0; i--) if (p.steps[i].aircraft) return p.steps[i];
  return p.steps[p.steps.length - 1] ?? null;
}

/**
 * Next moves up the ladder: upgrade to Captain if still a First Officer, then the
 * next rung or two. A pilot on an off-ladder seat has no suggestion.
 *
 * `crewed` is the set of airframe codes the fleet actually crews (from the Crew
 * roster). Two things depend on it, and both were wrong before it existed:
 *   - a PC-12 First Officer was handed NINE suggestions ending at the Legacy 650,
 *     because the list was written for a 5-rung ladder and the ladder now has 10;
 *   - a G450 captain was told his next step was the Legacy 650, a single managed
 *     tail, which made him look like a pilot with somewhere to go when he is at
 *     the top of the shared fleet. That is the difference between "stayed put"
 *     reading as a choice and reading as a verdict.
 * With no roster loaded it degrades to the old behaviour, capped at two rungs.
 */
function nextSteps(
  seat: string | null,
  aircraft: string | null,
  crewed: ReadonlySet<string>
): { label: string; kind: "upgrade" | "transition" }[] {
  const rank = ladderRank(aircraft);
  if (rank < 0) return [];
  const out: { label: string; kind: "upgrade" | "transition" }[] = [];
  if (seat === "SIC" && aircraft) out.push({ label: `${aircraft} Captain`, kind: "upgrade" });
  for (const rung of nextRungs(rank, crewed)) out.push({ label: rung, kind: "transition" });
  return out;
}

/**
 * Gold service stars beside a pilot's name — one per whole year with SkyShare.
 *
 * THEY ARE ASTERISK GLYPHS, NOT ICONS, and that is not a shortcut: it is what the
 * employee profile already renders (NewHireDetailWorkspace, in the header row next
 * to the name), and this exists so the two surfaces show the same thing. The
 * title/aria wording is copied from there for the same reason.
 *
 * The one deliberate difference is size. The profile sets text-xl against a
 * text-2xl heading; a roster row's name is body-sized, so the same ratio lands at
 * text-base. Everything else — the gold token, the weight, leading-none,
 * tracking-tight, select-none so the asterisks are not caught when someone copies
 * a name — is unchanged.
 *
 * Count comes from UpgradePilot.tenureYears, which is computeTenure's rehire-aware
 * completedYears rather than tenureDays / 365, so a pilot cannot show five stars
 * on their profile and four here.
 */
function TenureStars({ years }: { years: number }) {
  if (years <= 0) return null;
  const label = `${years} year${years === 1 ? "" : "s"}`;
  return (
    <span
      title={`${label} with SkyShare`}
      aria-label={`${label} of service`}
      className="select-none text-base font-bold leading-none tracking-tight text-brand-gold"
    >
      {"*".repeat(years)}
    </span>
  );
}

/**
 * The middle value, not the mean.
 *
 * Both pilots who reviewed this report asked for a median independently, and
 * they were right for a reason beyond preference: the mean here was computed
 * over the pilots who HAD advanced, so it silently improved every time somebody
 * stalled. A median over the same set is at least a number a First Officer can
 * be told, and it is reported next to how many are still waiting so the reader
 * can see what it leaves out.
 */
function median(xs: (number | null)[]): number | null {
  const v = xs.filter((n): n is number => n !== null).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : Math.round((v[m - 1] + v[m]) / 2);
}

function yearOf(iso: string | null): number | null {
  if (!iso) return null;
  // Dates are stored as UTC midnight; read the year in UTC so it matches the
  // pilots' employedYears (also UTC) — otherwise a Jan-1 date slips to the prior year.
  const y = new Date(iso).getUTCFullYear();
  return Number.isFinite(y) ? y : null;
}

// ---------------------------------------------------------------------------
// "The climb" — cumulative role/aircraft progressions across the fleet over
// time. One rising area (all progressions) with a Captain-milestone line, so
// the growth of everyone's advancement reads at a glance.
// ---------------------------------------------------------------------------
function ClimbChart({ pilots, highlightYear }: { pilots: UpgradePilot[]; highlightYear?: number | null }) {
  const model = useMemo(() => {
    const perYear = new Map<number, { up: number; tr: number }>();
    for (const p of pilots) {
      // Count each upgrade/transition event, dated by its start.
      //
      // AN UPGRADE IS READ OFF THE SEAT here too. This chart used to test
      // kind === "upgrade", which is only ever set when the aircraft did not
      // change — so after the upgrade rule was corrected on 2026-09-08 the chart
      // silently disagreed with the tiles above it: a CJ2 First Officer moving to
      // the PC-12 as a Captain counted as an upgrade in the tiles and as a
      // transition in this line. Two panels, one dataset, two answers.
      //
      // A step that is BOTH increments both series, which is right for a chart
      // whose own label is "upgrades + transitions" — it is a sum of two event
      // types, not a count of moves, and the headline above states those two
      // numbers separately for the same reason.
      for (let i = 1; i < p.steps.length; i++) {
        const step = p.steps[i];
        const isTransition = step.kind === "transition";
        const isUpgrade = step.upgrade;
        if (!isTransition && !isUpgrade) continue;
        const y = yearOf(step.date);
        if (y === null) continue;
        const b = perYear.get(y) ?? { up: 0, tr: 0 };
        if (isUpgrade) b.up += 1;
        if (isTransition) b.tr += 1;
        perYear.set(y, b);
      }
    }
    const years = [...perYear.keys()].sort((a, b) => a - b);
    if (years.length === 0) return null;
    const span: number[] = [];
    for (let y = years[0]; y <= years[years.length - 1]; y++) span.push(y);

    let cumU = 0;
    let cumTr = 0;
    const points = span.map((y) => {
      const b = perYear.get(y) ?? { up: 0, tr: 0 };
      cumU += b.up;
      cumTr += b.tr;
      return { year: y, total: cumU + cumTr, up: cumU, tr: cumTr };
    });
    return { points, maxY: cumU + cumTr };
  }, [pilots]);

  if (!model) return null;

  const W = 720;
  const H = 240;
  const padL = 40;
  const padR = 16;
  const padT = 18;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = model.points.length;
  const maxY = Math.max(model.maxY, 1);

  const x = (i: number) => padL + (n === 1 ? plotW / 2 : (plotW * i) / (n - 1));
  const y = (v: number) => padT + plotH * (1 - v / maxY);

  const linePts = model.points.map((p, i) => `${x(i)},${y(p.total)}`);
  const areaPath = `M ${x(0)},${y(0)} L ${linePts.join(" L ")} L ${x(n - 1)},${y(0)} Z`;
  const linePath = `M ${linePts.join(" L ")}`;
  const upPath = `M ${model.points.map((p, i) => `${x(i)},${y(p.up)}`).join(" L ")}`;
  const trPath = `M ${model.points.map((p, i) => `${x(i)},${y(p.tr)}`).join(" L ")}`;

  // A few horizontal gridlines with value labels.
  const ticks = 3;
  const gridVals = Array.from({ length: ticks + 1 }, (_, i) => Math.round((maxY * i) / ticks));
  // Thin year labels if crowded.
  const labelEvery = n > 9 ? 2 : 1;

  return (
    // overflow-y-hidden is NOT redundant, and leaving it off is the documented
    // trap: per the CSS overflow spec, setting one axis to anything but visible
    // makes the OTHER axis compute to auto. overflow-x-auto alone therefore turns
    // on a vertical scrollbar too. The min-width is the last resort of the
    // scrollbar ladder — a line chart cannot be made to fit 375px and stay
    // readable, since SVG text scales with the viewBox and 11px becomes 6px — but
    // it is now low enough that anything from a large phone upward does not scroll.
    <div className="w-full overflow-x-auto overflow-y-hidden">
      <style>{`
        @keyframes climb-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes climb-draw { to { stroke-dashoffset: 0; } }
        .climb-area { animation: climb-rise .7s ease-out both; }
        .climb-line { stroke-dasharray: 2400; stroke-dashoffset: 2400; animation: climb-draw 1.1s ease-out .1s forwards; }
        @media (prefers-reduced-motion: reduce) {
          .climb-area, .climb-line { animation: none; opacity: 1; stroke-dashoffset: 0; }
        }
      `}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[420px]" role="img" aria-label="Cumulative pilot progressions over time">
        <defs>
          <linearGradient id="climbFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#eaaa00" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#eaaa00" stopOpacity="0.04" />
          </linearGradient>
        </defs>

        {gridVals.map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="currentColor" className="text-brand-lea/10 dark:text-white/10" strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="fill-brand-grey text-[11px] dark:fill-slate-400">
              {v}
            </text>
          </g>
        ))}

        <path d={areaPath} fill="url(#climbFill)" className="climb-area" />
        <path d={linePath} fill="none" stroke="#0d2c43" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" className="climb-line dark:stroke-white" />
        <path d={trPath} fill="none" stroke="#466481" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="1.5 4" />
        <path d={upPath} fill="none" stroke="#eaaa00" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" strokeDasharray="6 4" />

        {/* The selected year, marked. The tiles above already narrow to it, and a
            chart that never moved while every number around it did was reading as
            a second, contradicting answer. */}
        {highlightYear != null && model.points.some((p) => p.year === highlightYear) && (
          <line
            x1={x(model.points.findIndex((p) => p.year === highlightYear))}
            y1={padT}
            x2={x(model.points.findIndex((p) => p.year === highlightYear))}
            y2={padT + plotH}
            stroke="#eaaa00"
            strokeWidth={1.5}
            strokeDasharray="3 3"
          />
        )}

        {model.points.map((p, i) => (
          <g key={p.year}>
            <circle
              cx={x(i)}
              cy={y(p.total)}
              r={p.year === highlightYear ? 5 : 3.5}
              className={p.year === highlightYear ? "fill-brand-gold" : "fill-brand-lea dark:fill-white"}
            />
            <title>{`${p.year}: ${p.total} total (${p.up} upgrades, ${p.tr} transitions)`}</title>
            {(i % labelEvery === 0 || p.year === highlightYear) && (
              <text
                x={x(i)}
                y={H - 10}
                textAnchor="middle"
                className={clsx("text-[11px]", p.year === highlightYear ? "fill-brand-lea font-bold dark:fill-brand-gold" : "fill-brand-grey dark:fill-slate-400")}
              >
                {p.year}
              </text>
            )}
          </g>
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[11px] font-medium text-brand-grey dark:text-slate-400">
        <span className="font-bold text-brand-lea dark:text-slate-100">{model.maxY} total</span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: "linear-gradient(#eaaa00aa,#eaaa0022)" }} /> Upgrades + transitions
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dashed border-brand-gold" /> Upgrades
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-4 border-t-2 border-dotted border-brand-eden" /> Transitions
        </span>
      </div>
    </div>
  );
}

// One step in a pilot's mini journey. Upgrades (FO→Captain) glow gold;
// transitions (new aircraft) read in navy/eden; hires/laterals stay neutral.
const STEP_CHIP: Record<string, string> = {
  upgrade: "border-brand-gold/60 bg-brand-gold/15 text-brand-lea dark:text-brand-gold ring-2 ring-brand-gold/50 shadow-glow",
  transition: "border-brand-eden/40 bg-brand-eden/10 text-brand-eden dark:border-white/15 dark:bg-white/5 dark:text-slate-200",
  hire: "border-brand-lea/10 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
  lateral: "border-brand-lea/10 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
};
const STEP_LABEL: Record<string, string> = { hire: "Hired", upgrade: "Upgrade", transition: "Transition", lateral: "Move" };

function PilotJourney({ steps }: { steps: UpgradePilot["steps"] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((s, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span
              // A seat advance shows the upgrade arrow even when the aircraft changed
              // too, so the strip agrees with the tiles and the chart. Reading kind
              // alone drew a plain transition arrow over a real upgrade.
              className={clsx("text-sm leading-none", s.upgrade ? "font-bold text-brand-gold" : s.kind === "transition" ? "font-bold text-brand-eden dark:text-brand-edenOnDark" : "text-brand-grey/50")}
              aria-hidden
            >
              {s.upgrade ? "↗" : "→"}
            </span>
          )}
          <span className={clsx("inline-flex flex-col rounded border px-2 py-1 transition", STEP_CHIP[s.kind])}>
            <span className="text-xs font-semibold leading-tight">{s.title}</span>
            <span className="text-[9px] uppercase tracking-wide opacity-70">{STEP_LABEL[s.kind]} · {fmtMoment(s.date)}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/**
 * FOUR EXCLUSIVE BUCKETS, replacing six that overlapped.
 *
 * The old six were Advanced (>= 1), Once (= 1), Twice or more (>= 2), 3x or more
 * (>= 3), Made Captain, and Stayed put — so a three-move pilot was counted in
 * four of them, and the six summed to 89 against 60 tracked pilots. They render
 * as bars scaled to the largest tile, which reads as a distribution, and a
 * distribution whose parts sum to 148% of the whole is not one.
 *
 * These four partition the pool: every pilot is in exactly one, and they add up
 * to `tracked`. "Made Captain" moved to the stat row, where a count that overlaps
 * everything else belongs; "Advanced" is gone because the headline states it
 * twice already.
 */
type Bucket = "m0" | "m1" | "m2" | "m3";

/**
 * Why a pilot with no moves has none.
 *
 * "Stayed put" was one tile holding four different situations and reading as a
 * verdict on each person in it. A pilot six weeks in is not a pilot who stalled;
 * a G450 captain at the top of the shared fleet has nowhere to go; and a captain
 * who was offered a move and turned it down to stay home-based made a decision.
 * Measured 2026-09-08: of 39 in the default view, 27 had not been here a year.
 *
 * `declined` IS NOT MEASURABLE TODAY and is shown anyway, empty and labelled as
 * such. Nothing in the schema records whether a move was offered or asked for,
 * so every declined move is currently sitting in `waiting` looking like a stall.
 * Leaving the bucket out would hide that; showing it empty says what is missing.
 */
type StayReason = "tooNew" | "waiting" | "capped" | "declined";

/**
 * How long before a pilot could reasonably have moved.
 *
 * AN ASSUMPTION, NOT A COMPANY RULE — nobody has stated one, and it is flagged
 * for him rather than buried. It is load-bearing in two places: the "within N yr"
 * denominators and the not-yet-eligible split. One year is the smallest band the
 * tenure filter offers and no pilot in the data has moved in under 8 months, so
 * it does not currently exclude anybody who did move. Change this one constant
 * if he sets a real number.
 */
const ELIGIBLE_AFTER_DAYS = 365;

/**
 * The tenure ladder, 1 through 10 years.
 *
 * Asked for on 2026-09-08: it offered 1+, 2+ and 5+ only, so the 3+ and 4+ bands
 * were missing entirely and nothing past 5 could be asked at all - which is the
 * band that matters most for a fractional operator, where the long-tenure captains
 * are the bench everything else depends on.
 *
 * GENERATED rather than listed, so the next change is one number. 365 days a year
 * is deliberate and slightly wrong: it drifts about 2.4 days per decade against
 * leap years, which cannot move anybody between whole-year bands, and matching the
 * "/ 365" the tenure column already displays matters more than calendar precision -
 * a pilot shown as 5.0 yr must be inside the 5+ filter.
 *
 * A DESIGN REVIEW SUGGESTED REPLACING THE 10-OPTION SELECT with a range input or
 * a cohort split. He asked for the ten options by name, so they ship; the control
 * is his call and not one to change unasked.
 */
const TENURE_YEARS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const tenureDaysFor = (years: number) => years * 365;

type Scope = "active" | "former" | "all";

const SCOPE_LABEL: Record<Scope, string> = { active: "Active", former: "Former", all: "All" };

// Selected = navy + gold; hover = gold glow. Both segmented controls used bare
// navy with no gold at all, which is the one combination the locked design system
// names for a selected state.
const SEGMENT_ON = "bg-brand-lea text-white ring-1 ring-brand-gold";
const SEGMENT_OFF = "text-brand-grey hover:text-brand-lea hover:shadow-glow dark:text-slate-400 dark:hover:text-slate-100";

/**
 * Filled vs target by aircraft type and seat, plus the upgrade bench behind the
 * open captain seats.
 *
 * The single biggest gap in this report, raised unprompted by all four executive
 * reviews on 2026-09-08: it could say 26 pilots upgraded and not that 7 seats are
 * open. The numbers are the Crew org chart's roster (see lib/data/fleet-staffing),
 * so the two pages cannot disagree.
 */
function StaffingPanel({
  staffing,
  bench,
  benchIsMeaningful,
  poolFilter
}: {
  staffing: FleetStaffing;
  bench: Map<string, { ready: number; soon: number }>;
  benchIsMeaningful: boolean;
  poolFilter: "fractional" | "all";
}) {
  const types = staffing.types.filter((t) => (poolFilter === "all" ? true : t.pool === "SkyShare"));
  if (types.length === 0) return null;
  const totals = types.reduce(
    (a, t) => ({ filled: a.filled + t.filled, training: a.training + t.training, open: a.open + t.open, target: a.target + t.target }),
    { filled: 0, training: 0, open: 0, target: 0 }
  );
  const openPic = types.reduce((a, t) => a + (t.pic?.open ?? 0), 0);
  const openSic = types.reduce((a, t) => a + (t.sic?.open ?? 0), 0);
  const readyTotal = [...bench.values()].reduce((a, b) => a + b.ready, 0);
  const seatCell = (s: { filled: number; training: number; open: number; target: number } | null) =>
    s ? `${s.filled}/${s.target}${s.open ? ` · ${s.open} open` : ""}${s.training ? ` · ${s.training} training` : ""}` : "—";

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
          Staffing — filled against target
        </div>
        <Link href="/fleet/crew" className="text-[11px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-brand-edenOnDark">
          Crew org chart &rarr;
        </Link>
      </div>
      <p className="mt-1 text-[11px] text-brand-grey dark:text-slate-400">
        From the Crew roster. Target is filled + in training + open; seats on hold are excluded, per the rule that a parked
        seat never counts.
      </p>

      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Filled", value: String(totals.filled), sub: `of ${totals.target} target` },
          { label: "In training", value: String(totals.training), sub: "not yet on the line" },
          { label: "Open seats", value: String(totals.open), sub: `${openPic} captain · ${openSic} first officer` },
          {
            label: "Fill rate",
            value: totals.target ? `${Math.round((totals.filled / totals.target) * 100)}%` : "—",
            sub: "filled / target"
          }
        ].map((c) => (
          <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
            <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{c.value}</div>
            <div className="text-[11px] text-brand-grey dark:text-slate-400">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto overflow-y-hidden">
        <table className="w-full min-w-[560px] border-collapse text-left text-sm">
          <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.14em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
            <tr>
              <th className="px-3 py-2 font-bold">Aircraft</th>
              <th className="px-3 py-2 font-bold">Captains</th>
              <th className="px-3 py-2 font-bold">First officers</th>
              <th className="px-3 py-2 text-right font-bold">Open</th>
              <th className="px-3 py-2 text-right font-bold">Bench</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
            {types.map((t) => {
              const b = t.aircraft ? bench.get(t.aircraft) : undefined;
              return (
                <tr key={t.key} className="row-wash">
                  <td className="px-3 py-2">
                    <span className="font-semibold text-brand-lea dark:text-slate-100">{t.name}</span>
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                      {t.pool === "SkyShare" ? "Fractional" : `Managed · ${t.tails} ${t.tails === 1 ? "tail" : "tails"}`}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-brand-black/80 dark:text-slate-300">{seatCell(t.pic)}</td>
                  <td className="px-3 py-2 tabular-nums text-brand-black/80 dark:text-slate-300">{seatCell(t.sic)}</td>
                  <td className={clsx("px-3 py-2 text-right font-semibold tabular-nums", t.open > 0 ? "text-brand-gold" : "text-brand-grey dark:text-slate-400")}>
                    {t.open}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-brand-grey dark:text-slate-400">
                    {!benchIsMeaningful ? "—" : b ? `${b.ready} ready${b.soon ? ` · ${b.soon} soon` : ""}` : "0"}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-brand-cloudDancer/40 font-semibold dark:bg-white/5">
              <td className="px-3 py-2 text-brand-lea dark:text-slate-100">Total</td>
              <td className="px-3 py-2 tabular-nums text-brand-lea dark:text-slate-100">
                {types.reduce((a, t) => a + (t.pic?.filled ?? 0), 0)}/{types.reduce((a, t) => a + (t.pic?.target ?? 0), 0)}
              </td>
              <td className="px-3 py-2 tabular-nums text-brand-lea dark:text-slate-100">
                {types.reduce((a, t) => a + (t.sic?.filled ?? 0), 0)}/{types.reduce((a, t) => a + (t.sic?.target ?? 0), 0)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-brand-lea dark:text-slate-100">{totals.open}</td>
              <td className="px-3 py-2 text-right tabular-nums text-brand-lea dark:text-slate-100">{benchIsMeaningful ? readyTotal : "—"}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* The second-order hole. Asked for by the Chief Pilot and the Director of
          Ops: every internal upgrade fills a left seat by emptying a right one,
          and a staffing plan that stops at the first move is short by exactly the
          number of moves it makes. */}
      <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
        {benchIsMeaningful ? (
          <>
            <span className="font-semibold text-brand-lea dark:text-slate-200">Bench</span> counts first officers already on
            type with {Math.round(ELIGIBLE_AFTER_DAYS / 365)}+ {ELIGIBLE_AFTER_DAYS === 365 ? "year" : "years"} of tenure.
            {openPic > 0
              ? ` Filling all ${openPic} open captain ${openPic === 1 ? "seat" : "seats"} from inside would open ${openPic} first-officer ${openPic === 1 ? "seat" : "seats"} behind them, on top of the ${openSic} already open.`
              : " No captain seats are open."}
          </>
        ) : (
          <>Bench is only shown for active pilots — switch the scope back to Active to see who is ready now.</>
        )}
      </p>
    </div>
  );
}

export function PilotProgressions({
  upgrades,
  staffing
}: {
  upgrades: ReportsData["pilotUpgrades"];
  /** Optional on purpose. The public share link does NOT pass it: open requisitions
   *  and target headcounts are not something to put behind a token URL without
   *  him deciding to. */
  staffing?: FleetStaffing | null;
}) {
  const [scope, setScope] = useState<Scope>("active");
  // Default to the SkyShare / fractional shared pool — managed-account pilots
  // aren't on a promote-by-date path, so they're hidden until you toggle "All fleets".
  const [poolFilter, setPoolFilter] = useState<"fractional" | "all">("fractional");
  // 0 means no filter. Otherwise a day count from TENURE_YEARS above.
  const [tenure, setTenure] = useState<number>(0);
  const [year, setYear] = useState<number | "all">("all");
  const [bucket, setBucket] = useState<Bucket>("m1");
  const [stayReason, setStayReason] = useState<StayReason | "any">("any");

  // Every year we had pilots on staff, so any year's headcount is selectable.
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of upgrades.pilots) for (const y of p.employedYears) set.add(y);
    return [...set].sort((a, b) => b - a);
  }, [upgrades.pilots]);

  // Which airframes the fleet actually crews, so a "possible next step" is a seat
  // that exists. Empty when no roster is loaded, which nextRungs reads as no filter.
  const crewed = useMemo(
    () => new Set(poolFilter === "all" ? (staffing?.crewedAll ?? []) : (staffing?.crewedFractional ?? [])),
    [staffing, poolFilter]
  );

  // Recompute for scope + tenure + timeframe. Move counts respect the timeframe;
  // the "time to advance" stats stay career-wide for the filtered pilot group.
  const s = useMemo(() => {
    const inYear = (iso: string | null) => year === "all" || yearOf(iso) === year;
    const inScope = (p: UpgradePilot) => (scope === "all" ? true : scope === "active" ? p.active : !p.active);
    // Chart pool = scope + tenure across all years. Denominator pool further
    // restricts to the selected year's headcount, so a year's % is measured
    // against that year's pilots, not today's.
    const poolNoYear = upgrades.pilots.filter((p) => inScope(p) && (poolFilter === "all" || !p.managed) && p.tenureDays >= tenure);
    const pool = poolNoYear.filter((p) => year === "all" || p.employedYears.includes(year));
    const rows = pool.map((p) => {
      // ANY FIRST OFFICER TO CAPTAIN CHANGE IS AN UPGRADE — his rule, 2026-09-08.
      // So an upgrade is read off the SEAT (step.seatUp) rather than off the step
      // kind, which only says "upgrade" when the aircraft stayed the same. The
      // commonest upgrade here changes type at the same moment.
      let up = 0;
      let tr = 0;
      // ONE STEP IS ONE MOVE. A step can be an upgrade AND a transition, so
      // up + tr would count that step twice and claim a pilot moved more times
      // than things actually happened to them.
      let mv = 0;
      let capt = 0;
      let lat = 0;
      for (let i = 1; i < p.steps.length; i++) {
        const step = p.steps[i];
        if (!inYear(step.date)) continue;
        const isTransition = step.kind === "transition";
        // up counts UPGRADES under the full rules; capt counts only the seat
        // advance, because "Made Captain" has to mean made captain.
        if (step.upgrade) up++;
        if (step.seatUp) capt++;
        if (isTransition) tr++;
        if (step.upgrade || isTransition) mv++;
        // A LATERAL IS NOT NOTHING. Captain to Lead Captain, or a move into the
        // chief pilot's office, is classified lateral and counts as no move — so
        // the people running the fleet showed as zero-move "stayed put" pilots.
        // Counted here so the roster can at least say a role change happened.
        else if (step.kind === "lateral") lat++;
      }
      const cur = lastFlyingStep(p);
      const rank = ladderRank(cur?.aircraft ?? null);
      // Why this pilot has no moves. Only meaningful when moves === 0.
      //
      // NOWHERE-LEFT-TO-GO IS TESTED FIRST, and the order is the whole point. A
      // pilot can be both new AND capped — a G450 captain seven months in is one
      // — and "under a year" is a fact that expires while "nowhere left to go" is
      // structural. Testing tenure first would file him as too new today and then
      // silently promote him to "eligible, waiting" in five months, which is the
      // exact verdict this split exists to stop the report making.
      const reason: StayReason =
        nextSteps(cur?.seat ?? null, cur?.aircraft ?? null, crewed).length === 0
          ? "capped"
          : p.tenureDays < ELIGIBLE_AFTER_DAYS
            ? "tooNew"
            : "waiting";
      return { p, up, tr, moves: mv, capt, lat, reason, rank, cur };
    });
    const advanced = rows.filter((r) => r.moves >= 1);
    const tracked = pool.length;
    const stayedRows = rows.filter((r) => r.moves === 0);

    // BOTH "within N yr" FIGURES HAD THE WRONG DENOMINATOR. The numerator counts
    // pilots who moved within N years; the denominator was every pilot in scope,
    // including someone hired last month who could not possibly have qualified.
    // A hiring wave therefore pushed the number DOWN while nothing about anybody's
    // progression changed. Measured 2026-09-08 in the default view: 27 of the 60
    // had not been here a year, so "advanced within 1 yr" read 8% when the honest
    // figure over the 33 who had the chance is 15%.
    const withinPct = (days: number) => {
      const eligible = pool.filter((p) => p.tenureDays >= days);
      const moved = eligible.filter((p) => p.daysToFirstMove !== null && p.daysToFirstMove <= days).length;
      return { pct: eligible.length ? Math.round((moved / eligible.length) * 100) : 0, moved, of: eligible.length };
    };

    const paths = new Map<string, number>();
    for (const p of pool)
      for (let i = 1; i < p.steps.length; i++) {
        const prev = p.steps[i - 1].aircraft;
        const cur = p.steps[i].aircraft;
        if (p.steps[i].kind === "transition" && inYear(p.steps[i].date) && prev && cur) paths.set(`${prev} → ${cur}`, (paths.get(`${prev} → ${cur}`) ?? 0) + 1);
      }

    // Leavers. The report defaulted to active-only and had no former scope at all,
    // so the question two of the executive reviews actually asked — why do pilots
    // leave before upgrading — could not be put to it.
    const formerRows = rows.filter((r) => !r.p.active);
    const leavers = formerRows.length
      ? {
          count: formerRows.length,
          neverUpgraded: formerRows.filter((r) => r.p.daysToFirstUpgrade === null).length,
          medianTenure: median(formerRows.map((r) => r.p.tenureDays))
        }
      : null;

    // The upgrade bench: first officers already on type. Only meaningful for
    // pilots who are still here.
    const bench = new Map<string, { ready: number; soon: number }>();
    for (const r of rows) {
      if (!r.p.active || r.cur?.seat !== "SIC" || !r.cur.aircraft) continue;
      const b = bench.get(r.cur.aircraft) ?? { ready: 0, soon: 0 };
      if (r.p.tenureDays >= ELIGIBLE_AFTER_DAYS) b.ready += 1;
      else b.soon += 1;
      bench.set(r.cur.aircraft, b);
    }

    return {
      pool,
      poolNoYear,
      rows,
      tracked,
      advanced: advanced.length,
      pctAdvanced: tracked ? Math.round((advanced.length / tracked) * 100) : 0,
      upgradesTotal: rows.reduce((a, r) => a + r.up, 0),
      transitionsTotal: rows.reduce((a, r) => a + r.tr, 0),
      madeCaptain: rows.filter((r) => r.capt >= 1).length,
      // Exclusive, and they sum to tracked. See the Bucket comment.
      m0: stayedRows.length,
      m1: rows.filter((r) => r.moves === 1).length,
      m2: rows.filter((r) => r.moves === 2).length,
      m3: rows.filter((r) => r.moves >= 3).length,
      stayBreakdown: {
        tooNew: stayedRows.filter((r) => r.reason === "tooNew").length,
        waiting: stayedRows.filter((r) => r.reason === "waiting").length,
        capped: stayedRows.filter((r) => r.reason === "capped").length,
        declined: 0
      },
      stayLaterals: stayedRows.filter((r) => r.lat > 0).length,

      // MEDIAN, NOT MEAN, and reported with what it leaves out. The old average
      // dropped nulls, so pilots who never upgraded were excluded from the number
      // measuring how long an upgrade takes — which means it IMPROVED as people
      // stalled. Both pilot reviewers asked for a median independently.
      medToMove: median(pool.map((p) => p.daysToFirstMove)),
      medToUpgrade: median(pool.map((p) => p.daysToFirstUpgrade)),
      medToTransition: median(pool.map((p) => p.daysToFirstTransition)),
      movedCount: pool.filter((p) => p.daysToFirstMove !== null).length,
      upgradedCount: pool.filter((p) => p.daysToFirstUpgrade !== null).length,
      transitionedCount: pool.filter((p) => p.daysToFirstTransition !== null).length,
      waitingMedianTenure: median(pool.filter((p) => p.daysToFirstUpgrade === null).map((p) => p.tenureDays)),
      within1: withinPct(365),
      within2: withinPct(730),
      leavers,
      bench,
      topPaths: [...paths.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 6)
    };
  }, [upgrades.pilots, scope, poolFilter, tenure, year, crewed]);

  const tiles: { key: Bucket; label: string; value: number; hint: string }[] = [
    { key: "m0", label: "No moves yet", value: s.m0, hint: "0" },
    { key: "m1", label: "One move", value: s.m1, hint: "1" },
    { key: "m2", label: "Two moves", value: s.m2, hint: "2" },
    { key: "m3", label: "Three or more", value: s.m3, hint: "3+" }
  ];

  const bucketTest = (r: { moves: number; reason: StayReason }) =>
    bucket === "m0"
      ? r.moves === 0 && (stayReason === "any" || stayReason === r.reason)
      : bucket === "m1"
        ? r.moves === 1
        : bucket === "m2"
          ? r.moves === 2
          : r.moves >= 3;
  const filtered = s.rows.filter(bucketTest);
  const activeTile = tiles.find((t) => t.key === bucket);
  // Derived, so a new band cannot be added to the dropdown and forgotten here -
  // which is exactly what the old three-way ternary invited.
  const tenureLabel = tenure > 0 ? `${Math.round(tenure / 365)}+ yr` : null;
  const poolWord = poolFilter === "fractional" ? "fractional " : "";
  const scopeWord = scope === "active" ? "active " : scope === "former" ? "former " : "all ";
  const denomLabel =
    (year === "all"
      ? `${scopeWord}${poolWord}pilots`
      : `${poolWord}pilots on staff in ${year}${scope === "active" ? " (still here)" : scope === "former" ? " (since left)" : ""}`) +
    (tenureLabel ? ` with ${tenureLabel} tenure` : "");

  const STAY_LABEL: Record<StayReason, string> = {
    tooNew: `Under ${Math.round(ELIGIBLE_AFTER_DAYS / 365)} yr`,
    waiting: "Eligible, waiting",
    capped: "Nowhere left to go",
    declined: "Declined a move"
  };

  // Download the current roster (name, position, tenure, START DATE for validating
  // timeframe, moves, and suggested next steps) as CSV.
  const downloadRoster = () => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    // Full years is the STAR COUNT — rehire-aware whole anniversary years — and it
    // is a different number from the decimal tenure beside it, which measures the
    // span from the first role. Both are exported and both are labelled, because a
    // spreadsheet with two tenure columns and no explanation is worse than one.
    const header = ["Name", "Current position", "Seat", "Aircraft", "Full years (service)", "Tenure (yr, from first role)", "Start date", "Left on", "Upgrades", "Transitions", "Why no move", "Possible next steps"];
    const lines = filtered.map(({ p, up, tr, moves, reason }) => {
      const cur = lastFlyingStep(p);
      const steps = nextSteps(cur?.seat ?? null, cur?.aircraft ?? null, crewed)
        .map((sg) => (sg.kind === "upgrade" ? `Upgrade: ${sg.label}` : `To ${sg.label}`))
        .join("; ");
      return [
        p.name,
        cur?.title ?? "",
        cur?.seat ?? "",
        cur?.aircraft ?? "",
        String(p.tenureYears),
        (p.tenureDays / 365).toFixed(1),
        p.startDate?.slice(0, 10) ?? "",
        p.departedOn?.slice(0, 10) ?? "",
        String(up),
        String(tr),
        moves === 0 ? STAY_LABEL[reason] : "",
        steps
      ];
    });
    const csv = [header, ...lines].map((r) => r.map((c) => esc(String(c))).join(",")).join("\r\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `fleet-${bucket}-${scope}${tenureLabel ? `-${tenureLabel.replace(/[^\w]+/g, "")}` : ""}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Fleet progression</p>
          <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">Upgrades &amp; transitions</h2>
          {/* THIS SENTENCE HAS BEEN WRONG TWICE, both times because the rule moved
              and the copy did not — first when it said "on the same aircraft", then
              when it named only the seat rule and left out the larger-aircraft one.
              It has to state BOTH halves or the tiles below cannot be reconciled.
              It ALSO used to print the whole ten-rung ladder inline, which was
              accurate and ran to four lines; the ladder now sits in the title
              attribute, where it is one hover away instead of in everybody's way. */}
          <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
            {s.advanced} of {s.tracked} {denomLabel} ({s.pctAdvanced}%) upgraded or transitioned{year === "all" ? "" : ` in ${year}`}. An{" "}
            <span className="font-medium text-brand-eden dark:text-slate-300">upgrade</span> is any FO &rarr; Captain change, or a
            same-seat move{" "}
            <span className="cursor-help underline decoration-dotted underline-offset-2" title={SKYSHARE_LADDER.join(" → ")}>
              up the fleet ladder
            </span>
            ; a <span className="font-medium text-brand-eden dark:text-slate-300">transition</span> is a move to a new aircraft.
            One step can be both, and counts once as a move.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="inline-flex rounded border border-brand-lea/15 p-0.5 text-xs font-semibold dark:border-white/10">
            {(["active", "former", "all"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setScope(v)}
                aria-pressed={scope === v}
                title={v === "former" ? "Pilots who have left — the only way to ask why people leave before upgrading" : undefined}
                className={clsx("rounded px-3 py-1.5 transition", scope === v ? SEGMENT_ON : SEGMENT_OFF)}
              >
                {SCOPE_LABEL[v]}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded border border-brand-lea/15 p-0.5 text-xs font-semibold dark:border-white/10">
            {(["fractional", "all"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setPoolFilter(v)}
                aria-pressed={poolFilter === v}
                title={v === "fractional" ? "SkyShare / fractional shared pool only" : "Include managed-account pilots"}
                className={clsx("rounded px-3 py-1.5 transition", poolFilter === v ? SEGMENT_ON : SEGMENT_OFF)}
              >
                {v === "fractional" ? "Fractional" : "All fleets"}
              </button>
            ))}
          </div>
          <select
            value={tenure}
            onChange={(e) => setTenure(Number(e.target.value))}
            aria-label="Filter by tenure"
            className="rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
          >
            <option value={0}>Any tenure</option>
            {TENURE_YEARS.map((y) => (
              <option key={y} value={tenureDaysFor(y)}>
                {y}+ yr tenure
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}
            aria-label="Filter by year"
            className="rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
          >
            <option value="all">All time</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      {!upgrades.hasData ? (
        <p className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          No progressions recorded yet. Record role changes on employee profiles (or import promotion history) and this fills in automatically.
        </p>
      ) : (
        <>
          {/* Headline — the shareable "since hire" figure */}
          <div className="mt-4 rounded bg-brand-lea p-4 text-white dark:ring-1 dark:ring-brand-gold/25">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-3xl font-bold text-brand-gold">{s.pctAdvanced}%</span>
              <span className="text-sm font-medium">
                of {denomLabel} {year === "all" ? "have upgraded or transitioned since being hired" : `upgraded or transitioned in ${year}`}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/70">
              {s.advanced} of {s.tracked} · {s.upgradesTotal} upgrade{s.upgradesTotal === 1 ? "" : "s"} + {s.transitionsTotal} transition{s.transitionsTotal === 1 ? "" : "s"}
              {year === "all" && s.tracked - s.advanced > 0 ? ` · ${s.tracked - s.advanced} still in their original seat` : ""}
            </p>
          </div>

          {/* Headline stats */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Pilots", value: String(s.tracked), sub: year === "all" ? "tracked" : `on staff in ${year}` },
              {
                label: "Median time to advance",
                value: fmtSpan(s.medToMove),
                sub: `${s.movedCount} of ${s.tracked} moved · ${s.tracked - s.movedCount} still waiting`
              },
              { label: "Upgrades", value: String(s.upgradesTotal), sub: `${s.madeCaptain} made Captain` },
              { label: "Transitions", value: String(s.transitionsTotal), sub: "aircraft changes" }
            ].map((c) => (
              <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
                <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{c.value}</div>
                <div className="text-[11px] text-brand-grey dark:text-slate-400">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Secondary timing. Every one of these now states its own denominator,
              because all four used to hide it: the medians exclude pilots who never
              advanced, and the percentages used to divide by pilots who had not been
              here long enough to qualify. */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: "Median to first upgrade",
                value: fmtSpan(s.medToUpgrade),
                sub: `${s.upgradedCount} of ${s.tracked}; ${s.tracked - s.upgradedCount} waiting, median ${fmtSpan(s.waitingMedianTenure)} in`
              },
              {
                label: "Median to first transition",
                value: fmtSpan(s.medToTransition),
                sub: `${s.transitionedCount} of ${s.tracked} changed aircraft`
              },
              { label: "Advanced within 1 yr", value: `${s.within1.pct}%`, sub: `${s.within1.moved} of the ${s.within1.of} here a year or more` },
              { label: "Advanced within 2 yr", value: `${s.within2.pct}%`, sub: `${s.within2.moved} of the ${s.within2.of} here two years or more` }
            ].map((c) => (
              <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
                <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{c.value}</div>
                <div className="text-[11px] text-brand-grey dark:text-slate-400">{c.sub}</div>
              </div>
            ))}
          </div>

          {/* Leavers — only when the scope actually contains any. */}
          {s.leavers && (
            <div className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
              <span className="font-semibold text-brand-lea dark:text-slate-200">{s.leavers.count} former pilots</span> in this view ·{" "}
              {s.leavers.neverUpgraded} left without ever upgrading · median tenure at departure {fmtSpan(s.leavers.medianTenure)}.
            </div>
          )}

          {/* What this report cannot see. An absence stated out loud, because two
              reviews asked why pilots leave before upgrading and some leavers are
              not in the dataset at all — a report that drops them silently answers
              that question wrongly rather than not answering it. */}
          {upgrades.excluded.total > 0 && (
            <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">
              Not shown: {upgrades.excluded.total} pilot-titled {upgrades.excluded.total === 1 ? "employee" : "employees"}
              {upgrades.excluded.former === upgrades.excluded.total
                ? ", all of them former,"
                : upgrades.excluded.former > 0
                  ? ` (${upgrades.excluded.former} of them former)`
                  : ""}{" "}
              whose records state no seat — a title of just &quot;Pilot&quot;, with no aircraft and no fleet position, cannot be
              classified as a Captain or a First Officer. Fixing the titles on those profiles brings them in.
            </p>
          )}

          {/* The climb graph */}
          <div className="mt-5 rounded border border-brand-lea/10 bg-gradient-to-b from-brand-cloudDancer/40 to-transparent p-4 dark:border-white/10 dark:from-white/5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
              Cumulative upgrades + transitions over time
              {year !== "all" ? <span className="ml-1 font-semibold text-brand-gold">· {year} marked</span> : null}
            </div>
            <div className="mt-2">
              {/* s.pool, NOT s.poolNoYear. The chart was passed the year-agnostic
                  pool, so selecting 2023 changed every tile on the page and left the
                  chart identical — two panels over one dataset giving two answers.
                  It now follows the same headcount the tiles do, and marks the year. */}
              <ClimbChart pilots={s.pool} highlightYear={year === "all" ? null : year} />
            </div>
          </div>

          {/* Staffing — filled vs target. Absent from this report entirely until
              2026-09-08 and asked for by every executive review of it. */}
          {staffing ? (
            <StaffingPanel staffing={staffing} bench={s.bench} benchIsMeaningful={scope !== "former"} poolFilter={poolFilter} />
          ) : null}

          {/* Clickable buckets — exclusive, and they sum to the tracked count. */}
          <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
            {tiles.map((t) => {
              const active = t.key === bucket;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    setBucket(t.key);
                    if (t.key !== "m0") setStayReason("any");
                  }}
                  aria-pressed={active}
                  className={clsx(
                    "group flex flex-col rounded border p-3 text-left transition",
                    active
                      ? "border-brand-gold bg-brand-lea text-white shadow-glow dark:bg-brand-lea"
                      : "border-brand-lea/10 bg-brand-cloudDancer/45 hover:border-brand-gold/50 hover:shadow-glow dark:border-white/10 dark:bg-white/5"
                  )}
                >
                  <span className={clsx("text-2xl font-bold tabular-nums", active ? "text-brand-gold" : "text-brand-lea dark:text-slate-100")}>
                    {t.value}
                  </span>
                  <span className={clsx("text-xs font-semibold", active ? "text-white" : "text-brand-lea dark:text-slate-200")}>{t.label}</span>
                  <span className={clsx("text-[10px]", active ? "text-white/70" : "text-brand-grey dark:text-slate-400")}>
                    {t.hint} · {s.tracked ? Math.round((t.value / s.tracked) * 100) : 0}%
                  </span>
                  {/* Scaled to the WHOLE, not to the biggest tile. The old bars were
                      scaled to maxTile, which made four overlapping counts look like
                      a distribution; these are four exclusive shares of one pool, so
                      the bar can honestly be read as a proportion. */}
                  <span className={clsx("mt-2 h-1 rounded", active ? "bg-brand-gold/30" : "bg-brand-gold/20")}>
                    <span className="block h-1 rounded bg-brand-gold" style={{ width: `${s.tracked ? Math.max(2, (t.value / s.tracked) * 100) : 0}%` }} />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Why the no-move pilots have no moves. One tile used to hold four
              different situations and read as a verdict on each person in it. */}
          {bucket === "m0" && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-brand-grey dark:text-slate-400">Because:</span>
              {(["any", "tooNew", "waiting", "capped", "declined"] as const).map((k) => {
                const count = k === "any" ? s.m0 : s.stayBreakdown[k];
                const on = stayReason === k;
                const dead = k === "declined";
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => !dead && setStayReason(k)}
                    disabled={dead}
                    aria-pressed={on}
                    title={dead ? "Not recorded anywhere — nothing captures whether a move was offered or turned down" : undefined}
                    className={clsx(
                      "rounded border px-2 py-0.5 font-semibold transition",
                      dead
                        ? "cursor-not-allowed border-dashed border-brand-lea/15 text-brand-grey/60 dark:border-white/10 dark:text-slate-500"
                        : on
                          ? "border-brand-gold bg-brand-lea text-white"
                          : "border-brand-lea/15 text-brand-lea hover:border-brand-gold/50 hover:shadow-glow dark:border-white/10 dark:text-slate-200"
                    )}
                  >
                    {k === "any" ? "All" : STAY_LABEL[k]} {count}
                    {dead ? " · not recorded" : ""}
                  </button>
                );
              })}
              {s.stayLaterals > 0 && (
                <span className="text-brand-grey dark:text-slate-400">
                  · {s.stayLaterals} of them changed role sideways (a lateral is not counted as a move)
                </span>
              )}
            </div>
          )}

          {/* Roster drill-down */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                {activeTile?.label} — {filtered.length} {filtered.length === 1 ? "pilot" : "pilots"}
              </p>
              <div className="flex items-center gap-2">
                {filtered.length > 0 && (
                  <button
                    type="button"
                    onClick={downloadRoster}
                    className="inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2 py-1 text-[11px] font-semibold text-brand-lea transition hover:border-brand-gold/50 hover:shadow-glow dark:border-white/10 dark:text-slate-200"
                  >
                    <Download className="h-3 w-3" /> Download CSV
                  </button>
                )}
                <p className="text-[11px] text-brand-grey dark:text-slate-400"><span className="font-semibold text-brand-gold">↗ upgrade</span> · <span className="font-semibold text-brand-eden dark:text-slate-300">→ transition</span></p>
              </div>
            </div>
            <div className="mt-2 space-y-2 pr-1">
              {filtered.length === 0 ? (
                <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-6 text-center text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  No pilots in this group yet.
                </p>
              ) : (
                filtered.map(({ p, up, tr, moves, lat, reason }) => {
                  // No-move pilots: show current position, tenure, WHY they have no
                  // move, and where they could go next.
                  if (moves === 0) {
                    const cur = lastFlyingStep(p);
                    const suggestions = nextSteps(cur?.seat ?? null, cur?.aircraft ?? null, crewed);
                    return (
                      <div key={p.hireId} className="rounded border border-brand-lea/10 bg-white p-3 transition hover:border-brand-gold/40 hover:shadow-glow dark:border-white/10 dark:bg-white/5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/people/${p.hireId}`}
                              className="font-semibold text-brand-lea transition hover:text-brand-eden hover:drop-shadow-[0_0_6px_rgba(234,170,0,0.5)] dark:text-slate-100 dark:hover:text-brand-edenOnDark"
                            >
                              {p.name}
                            </Link>
                            <TenureStars years={p.tenureYears} />
                            <span className="rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-grey dark:border-white/10 dark:text-slate-400">
                              {STAY_LABEL[reason]}
                            </span>
                            {lat > 0 && (
                              <span className="rounded bg-brand-eden/10 px-1.5 py-0.5 text-[10px] font-semibold text-brand-eden dark:bg-white/5 dark:text-slate-300">
                                {lat} lateral role change{lat === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          {/* "since hire", not "tenure", because it is measured from
                              the first role and the gold stars beside the name are
                              measured from continuous SERVICE. They are two clocks and
                              they disagree for anybody rehired after a gap longer than
                              three months — one pilot in the default view reads 3.4 yr
                              here and has no stars, which is right under the rehire rule
                              and would read as a bug if both said "tenure". */}
                          <span
                            className="text-[11px] font-medium text-brand-grey dark:text-slate-400"
                            title="Measured from their first role. The gold stars count whole years of continuous service, which restarts after a break longer than three months."
                          >
                            {cur?.title ?? "—"} · <span className="text-brand-lea dark:text-slate-200">{fmtSpan(p.tenureDays)}</span> since hire
                            {p.departedOn ? <> · left {fmtDate(p.departedOn)}</> : null}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="text-brand-grey dark:text-slate-400">Possible next step:</span>
                          {suggestions.length ? (
                            suggestions.map((sug, i) => (
                              <span
                                key={i}
                                className={clsx(
                                  "rounded px-2 py-0.5 font-semibold",
                                  sug.kind === "upgrade"
                                    ? "bg-brand-gold/20 text-brand-lea dark:text-brand-gold"
                                    : "bg-brand-eden/10 text-brand-eden dark:bg-white/5 dark:text-slate-300"
                                )}
                              >
                                {sug.kind === "upgrade" ? "↗ " : "→ "}
                                {sug.label}
                              </span>
                            ))
                          ) : (
                            <span className="text-brand-grey/70 dark:text-slate-500">
                              {ladderRank(cur?.aircraft ?? null) < 0
                                ? "Managed / off-ladder seat — no shared-fleet path"
                                : "Top of the shared fleet — leadership / check-airman track"}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                  <div key={p.hireId} className="rounded border border-brand-lea/10 bg-white p-3 transition hover:border-brand-gold/40 hover:shadow-glow dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          href={`/people/${p.hireId}`}
                          className="font-semibold text-brand-lea transition hover:text-brand-eden hover:drop-shadow-[0_0_6px_rgba(234,170,0,0.5)] dark:text-slate-100 dark:hover:text-brand-edenOnDark"
                        >
                          {p.name}
                        </Link>
                        <TenureStars years={p.tenureYears} />
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {up > 0 && (
                          <span className="rounded bg-brand-gold/20 px-2 py-0.5 font-semibold text-brand-lea dark:text-brand-gold">
                            {up} upgrade{up === 1 ? "" : "s"}
                          </span>
                        )}
                        {tr > 0 && (
                          <span className="rounded bg-brand-eden/10 px-2 py-0.5 font-semibold text-brand-eden dark:bg-white/5 dark:text-slate-300">
                            {tr} transition{tr === 1 ? "" : "s"}
                          </span>
                        )}
                        <span className="text-brand-grey dark:text-slate-400">{fmtSpan(p.daysToFirstMove)} to 1st</span>
                        {p.departedOn ? <span className="text-brand-grey dark:text-slate-400">· left {fmtDate(p.departedOn)}</span> : null}
                      </div>
                    </div>
                    <div className="mt-2">
                      <PilotJourney steps={p.steps} />
                    </div>
                  </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Most common transition paths — the popular career moves */}
          {s.topPaths.length > 0 && (
            <div className="mt-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Most common transitions</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {s.topPaths.map((tp) => (
                  <div key={tp.path} className="flex items-center justify-between rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm dark:border-white/10 dark:bg-white/5">
                    <span className="font-medium text-brand-lea dark:text-slate-100">{tp.path}</span>
                    <span className="font-semibold text-brand-grey dark:text-slate-400">{tp.count}×</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const PURPOSE_COLORS: Record<string, string> = {
  ORIENTATION: "#0d2c43",
  INDOC: "#466481",
  TRAINING: "#eaaa00",
  INTERVIEW: "#6b8fb0",
  RECRUITING_VISIT: "#b98900",
  OTHER: "#9aa3ad"
};

function TravelSpend({
  travel,
  byMonth
}: {
  travel: ReportsData["travelSpend"];
  byMonth: ReportsData["travelSpendByMonth"];
}) {
  const [openPurpose, setOpenPurpose] = useState<string | null>(travel.byPurpose[0]?.purpose ?? null);

  const hiredPct = travel.totalSpend > 0 ? (travel.hiredSpend / travel.totalSpend) * 100 : 0;
  const notHiredPct = travel.totalSpend > 0 ? (travel.notHiredSpend / travel.totalSpend) * 100 : 0;
  const otherPct = Math.max(0, 100 - hiredPct - notHiredPct);
  const maxPurpose = Math.max(...travel.byPurpose.map((p) => p.spend), 1);

  return (
    <div className="space-y-4">
      {/* The SAME component the Travel page renders, imported rather than
          reimplemented. She will decide what leaves the Travel page once she has
          looked at this, and two copies of the chart would have drifted apart in
          the meantime. */}
      <TravelSpendYear data={byMonth} />

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Travel spend</p>
      <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">Recruiting &amp; onboarding travel</h2>
      <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
        {formatUsd(travel.totalSpend)} across {travel.tripCount} {travel.tripCount === 1 ? "trip" : "trips"} (excludes canceled). Click a purpose to see the trips behind it.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total spend", value: formatUsd(travel.totalSpend), tone: "text-brand-lea dark:text-slate-100" },
          { label: "Hired travelers", value: formatUsd(travel.hiredSpend), tone: "text-emerald-600 dark:text-emerald-300" },
          { label: "Not hired", value: formatUsd(travel.notHiredSpend), tone: "text-amber-600 dark:text-amber-300" },
          { label: "Cost per hire", value: travel.costPerHire === null ? "—" : formatUsd(travel.costPerHire), tone: "text-brand-lea dark:text-slate-100" }
        ].map((c) => (
          <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
            <div className={`mt-1 text-xl font-semibold ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Hired vs not-hired split */}
      {travel.totalSpend > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">Where the money goes</div>
          <div className="mt-2 flex h-3 w-full overflow-hidden rounded bg-brand-cloudDancer dark:bg-white/10">
            <div className="h-full bg-emerald-500" style={{ width: `${hiredPct}%` }} title={`Hired travelers · ${formatUsd(travel.hiredSpend)}`} />
            <div className="h-full bg-amber-400" style={{ width: `${notHiredPct}%` }} title={`Not hired · ${formatUsd(travel.notHiredSpend)}`} />
            {otherPct > 0 && <div className="h-full bg-brand-eden/40" style={{ width: `${otherPct}%` }} title="Unassigned" />}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-4 text-[11px] font-medium text-brand-grey dark:text-slate-400">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Hired {Math.round(hiredPct)}%</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-amber-400" /> Not hired {Math.round(notHiredPct)}%</span>
          </div>
        </div>
      )}

      {/* By purpose — click to drill into trips */}
      {travel.byPurpose.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">By purpose</div>
          <div className="mt-2 space-y-1.5">
            {travel.byPurpose.map((p) => {
              const open = openPurpose === p.purpose;
              const tripRows = travel.trips.filter((t) => t.purpose === p.purpose);
              const color = PURPOSE_COLORS[p.purpose] ?? "#466481";
              return (
                <div key={p.purpose} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5">
                  <button
                    type="button"
                    onClick={() => setOpenPurpose(open ? null : p.purpose)}
                    aria-expanded={open}
                    className="w-full rounded p-3 text-left transition hover:bg-brand-sweet/10"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
                        <span className={clsx("text-brand-grey transition dark:text-slate-400", open && "rotate-90")} aria-hidden>
                          ▸
                        </span>
                        {travelPurposeLabel(p.purpose)}
                        <span className="font-normal text-brand-grey dark:text-slate-400">· {p.trips} {p.trips === 1 ? "trip" : "trips"}</span>
                      </span>
                      <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">{formatUsd(p.spend)}</span>
                    </div>
                    <div className="mt-2 h-1.5 rounded bg-brand-lea/5 dark:bg-white/10">
                      <div className="h-1.5 rounded" style={{ width: `${Math.max(6, (p.spend / maxPurpose) * 100)}%`, backgroundColor: color }} />
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-brand-lea/10 px-3 py-2 dark:border-white/10">
                      {tripRows.length === 0 ? (
                        <p className="py-2 text-xs text-brand-grey dark:text-slate-400">No trip detail recorded.</p>
                      ) : (
                        <ul className="divide-y divide-brand-lea/5 dark:divide-white/5">
                          {tripRows.map((t) => (
                            <li key={t.tripId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
                              <div className="min-w-0">
                                {t.travelerHref ? (
                                  <Link
                                    href={t.travelerHref}
                                    className="text-sm font-semibold text-brand-lea transition hover:text-brand-eden hover:drop-shadow-[0_0_6px_rgba(234,170,0,0.5)] dark:text-slate-100 dark:hover:text-brand-edenOnDark"
                                  >
                                    {t.travelerName}
                                  </Link>
                                ) : (
                                  <span className="text-sm font-semibold text-brand-grey dark:text-slate-400">{t.travelerName}</span>
                                )}
                                <span className="ml-2 text-xs text-brand-grey dark:text-slate-400">
                                  {t.route ?? "route TBD"} · {fmtMoment(t.startsAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={clsx(
                                    "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                                    t.hired ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-amber-400/20 text-amber-700 dark:text-amber-300"
                                  )}
                                >
                                  {travelStatusLabel(t.status)}
                                </span>
                                <span className="w-20 text-right text-sm font-semibold tabular-nums text-brand-lea dark:text-slate-100">
                                  {formatUsd(t.total)}
                                </span>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="pt-1 text-right">
                        <Link href="/travel" className="text-[11px] font-semibold text-brand-eden hover:text-brand-lea dark:text-slate-300">
                          Open Travel hub →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {travel.tripCount === 0 && (
        <p className="mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          No booked travel yet. Add trips from a candidate or new-hire profile and spend rolls up here.
        </p>
      )}
      </section>

      {/* NOT BUILT YET, and named so it does not get forgotten. She listed the
          cuts she will want as this fills up over years: department, hired vs
          not, purpose, month and year, plus sorting and a download. Three of
          those five are already on the trip row and are a filter away. DEPARTMENT
          is the one with real work behind it — a trip has no department, it has a
          traveler, so it has to be derived through the hire or the job they
          applied to (lib/candidates/departments.ts), and that derivation is
          exactly where a wrong number would come from. */}
      <p className="px-1 text-xs text-brand-grey dark:text-slate-400">
        Filtering and downloading this is next: by department, hired or not, purpose, and month or
        year. Say the word once the numbers above look right to you.
      </p>
    </div>
  );
}

function DocumentCurrency({ dc }: { dc: ReportsData["documentCurrency"] }) {
  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Document currency</p>
      <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Expiring &amp; expired candidate documents</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Expired", value: dc.counts.expired, tone: "text-red-600 dark:text-red-300" },
          { label: "Due ≤ 30 days", value: dc.counts.due30, tone: "text-amber-600 dark:text-amber-300" },
          { label: "Due ≤ 90 days", value: dc.counts.due90, tone: "text-brand-lea dark:text-slate-100" },
          { label: "Tracked total", value: dc.counts.total, tone: "text-brand-grey dark:text-slate-400" }
        ].map((c) => (
          <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
            <div className={`mt-1 text-xl font-semibold ${c.tone}`}>{c.value}</div>
          </div>
        ))}
      </div>

      {dc.upcoming.length > 0 ? (
        // overflow-y-hidden pins the other axis — setting overflow-x alone makes
        // overflow-y compute to auto and quietly adds a second scrollbar.
        <div className="mt-4 overflow-x-auto overflow-y-hidden">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.14em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-bold">Candidate</th>
                <th className="px-3 py-2 font-bold">Document</th>
                <th className="px-3 py-2 font-bold">Expires</th>
                <th className="px-3 py-2 font-bold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
              {dc.upcoming.map((item, i) => {
                const tone = item.status === "expired" ? "text-red-600 dark:text-red-300" : item.status === "due30" ? "text-amber-600 dark:text-amber-300" : "text-brand-lea dark:text-slate-100";
                return (
                  <tr key={i} className="row-wash">
                    <td className="px-3 py-2">
                      <Link href={`/candidates/${item.candidateId}`} className="font-semibold text-brand-lea transition hover:text-brand-eden dark:text-slate-100 dark:hover:text-brand-edenOnDark">
                        {item.candidateName}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-brand-black/80 dark:text-slate-300">{item.documentType ?? item.displayFilename}</td>
                    <td className="px-3 py-2 text-brand-grey dark:text-slate-400">{fmtDate(item.expiresAt)}</td>
                    <td className={`px-3 py-2 font-semibold ${tone}`}>
                      {item.days < 0 ? `expired ${Math.abs(item.days)}d ago` : `${item.days}d left`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-brand-grey dark:text-slate-400">
          No documents are expired or expiring within 90 days. Set expiry dates on Medical, Passport, and license documents to track currency here.
        </p>
      )}
    </section>
  );
}

const REPORT_TABS = [
  { id: "progression", label: "Fleet Progression" },
  { id: "travel", label: "Travel Spend" },
  { id: "documents", label: "Document Currency" }
] as const;
type ReportTab = (typeof REPORT_TABS)[number]["id"];

export function ReportsWorkspace({ data, logoDataUrl, canShare = false }: ReportsWorkspaceProps) {
  const [tab, setTab] = useState<ReportTab>("progression");
  return (
    <div className="space-y-4 px-5 py-5 lg:px-8">
      <section className="flex items-start justify-between gap-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Talent analytics</p>
          <h1 className="text-2xl font-semibold text-brand-lea dark:text-slate-100">Reports</h1>
          <p className="mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400">
            Pick a report below. Everything is clickable, down to the person.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {canShare && tab === "progression" ? <ReportShareButton /> : null}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 print:hidden dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5"
          >
            <Download className="h-4 w-4" /> Export PDF
          </button>
          {logoDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoDataUrl} alt="Workspace logo" className="h-12 w-auto object-contain" />
          ) : null}
        </div>
      </section>

      {/* Sub-tabs — one report at a time. The active tab is the only one rendered,
          so "Export PDF" prints exactly what's on screen. */}
      <div className="flex flex-wrap gap-1 rounded bg-white p-1 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10 print:hidden">
        {REPORT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className={clsx(
              "rounded px-4 py-2 text-sm font-semibold transition",
              tab === t.id ? SEGMENT_ON : SEGMENT_OFF
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* staffing is passed HERE and deliberately not on the public share link —
          open requisitions and target headcounts behind a token URL is his call
          to make, not a side effect of adding the panel. */}
      {tab === "progression" ? <PilotProgressions upgrades={data.pilotUpgrades} staffing={data.fleetStaffing} /> : null}
      {tab === "travel" ? <TravelSpend travel={data.travelSpend} byMonth={data.travelSpendByMonth} /> : null}
      {tab === "documents" ? <DocumentCurrency dc={data.documentCurrency} /> : null}
    </div>
  );
}
