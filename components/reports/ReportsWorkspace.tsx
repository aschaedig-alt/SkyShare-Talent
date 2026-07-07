"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Download } from "lucide-react";
import type { ReportsData } from "@/lib/data/reports";
import type { UpgradePilot } from "@/lib/data/employee-journey";
import { formatUsd, travelPurposeLabel, travelStatusLabel } from "@/lib/travel/constants";
import { ReportShareButton } from "@/components/reports/ReportShareButton";

type ReportsWorkspaceProps = {
  data: ReportsData;
  logoDataUrl?: string | null;
  canShare?: boolean;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

// Human span for a day count (upgrade timing).
function fmtSpan(days: number | null): string {
  if (days === null) return "—";
  if (days < 60) return `${days} days`;
  const months = days / 30.44;
  if (months < 18) return `${months.toFixed(months < 3 ? 1 : 0)} mo`;
  return `${(days / 365).toFixed(1)} yr`;
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
function ClimbChart({ pilots }: { pilots: UpgradePilot[] }) {
  const model = useMemo(() => {
    const perYear = new Map<number, { up: number; tr: number }>();
    for (const p of pilots) {
      // Count each upgrade/transition event, dated by its start.
      for (let i = 1; i < p.steps.length; i++) {
        const k = p.steps[i].kind;
        if (k !== "upgrade" && k !== "transition") continue;
        const y = yearOf(p.steps[i].date);
        if (y === null) continue;
        const b = perYear.get(y) ?? { up: 0, tr: 0 };
        if (k === "upgrade") b.up += 1;
        else b.tr += 1;
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
    <div className="w-full overflow-x-auto">
      <style>{`
        @keyframes climb-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        @keyframes climb-draw { to { stroke-dashoffset: 0; } }
        .climb-area { animation: climb-rise .7s ease-out both; }
        .climb-line { stroke-dasharray: 2400; stroke-dashoffset: 2400; animation: climb-draw 1.1s ease-out .1s forwards; }
        @media (prefers-reduced-motion: reduce) {
          .climb-area, .climb-line { animation: none; opacity: 1; stroke-dashoffset: 0; }
        }
      `}</style>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[520px]" role="img" aria-label="Cumulative pilot progressions over time">
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

        {model.points.map((p, i) => (
          <g key={p.year}>
            <circle cx={x(i)} cy={y(p.total)} r={3.5} className="fill-brand-lea dark:fill-white" />
            <title>{`${p.year}: ${p.total} total (${p.up} upgrades, ${p.tr} transitions)`}</title>
            {i % labelEvery === 0 && (
              <text x={x(i)} y={H - 10} textAnchor="middle" className="fill-brand-grey text-[11px] dark:fill-slate-400">
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
              className={clsx("text-sm leading-none", s.kind === "upgrade" ? "font-bold text-brand-gold" : s.kind === "transition" ? "font-bold text-brand-eden" : "text-brand-grey/50")}
              aria-hidden
            >
              {s.kind === "upgrade" ? "↗" : "→"}
            </span>
          )}
          <span className={clsx("inline-flex flex-col rounded border px-2 py-1 transition", STEP_CHIP[s.kind])}>
            <span className="text-xs font-semibold leading-tight">{s.title}</span>
            <span className="text-[9px] uppercase tracking-wide opacity-70">{STEP_LABEL[s.kind]} · {fmtDate(s.date)}</span>
          </span>
        </Fragment>
      ))}
    </div>
  );
}

type Bucket = "advanced" | "once" | "twice" | "thrice" | "captain";

export function PilotProgressions({ upgrades }: { upgrades: ReportsData["pilotUpgrades"] }) {
  const [scope, setScope] = useState<"all" | "active">("active");
  const [tenure, setTenure] = useState<0 | 365 | 730 | 1825>(0);
  const [year, setYear] = useState<number | "all">("all");
  const [bucket, setBucket] = useState<Bucket>("advanced");

  // Every year we had pilots on staff, so any year's headcount is selectable.
  const years = useMemo(() => {
    const set = new Set<number>();
    for (const p of upgrades.pilots) for (const y of p.employedYears) set.add(y);
    return [...set].sort((a, b) => b - a);
  }, [upgrades.pilots]);

  // Recompute for scope + tenure + timeframe. Move counts respect the timeframe;
  // the "time to advance" stats stay career-wide for the filtered pilot group.
  const s = useMemo(() => {
    const inYear = (iso: string | null) => year === "all" || yearOf(iso) === year;
    // Chart pool = scope + tenure across all years. Denominator pool further
    // restricts to the selected year's headcount, so a year's % is measured
    // against that year's pilots, not today's.
    const poolNoYear = upgrades.pilots.filter((p) => (scope === "active" ? p.active : true) && p.tenureDays >= tenure);
    const pool = poolNoYear.filter((p) => year === "all" || p.employedYears.includes(year));
    const rows = pool.map((p) => {
      let up = 0;
      let tr = 0;
      for (let i = 1; i < p.steps.length; i++) {
        const k = p.steps[i].kind;
        if ((k === "upgrade" || k === "transition") && inYear(p.steps[i].date)) {
          if (k === "upgrade") up++;
          else tr++;
        }
      }
      return { p, up, tr, moves: up + tr };
    });
    const advanced = rows.filter((r) => r.moves >= 1);
    const tracked = pool.length;
    const avg = (xs: (number | null)[]) => {
      const v = xs.filter((n): n is number => n !== null);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    const within = (days: number) => advanced.filter((r) => r.p.daysToFirstMove !== null && r.p.daysToFirstMove <= days).length;
    const paths = new Map<string, number>();
    for (const p of pool)
      for (let i = 1; i < p.steps.length; i++) {
        const prev = p.steps[i - 1].aircraft;
        const cur = p.steps[i].aircraft;
        if (p.steps[i].kind === "transition" && inYear(p.steps[i].date) && prev && cur) paths.set(`${prev} → ${cur}`, (paths.get(`${prev} → ${cur}`) ?? 0) + 1);
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
      madeCaptain: rows.filter((r) => r.up >= 1).length,
      once: rows.filter((r) => r.moves === 1).length,
      twice: rows.filter((r) => r.moves >= 2).length,
      thrice: rows.filter((r) => r.moves >= 3).length,
      avgToMove: avg(advanced.map((r) => r.p.daysToFirstMove)),
      avgToUpgrade: avg(pool.map((p) => p.daysToFirstUpgrade)),
      avgToTransition: avg(pool.map((p) => p.daysToFirstTransition)),
      pct1yr: tracked ? Math.round((within(365) / tracked) * 100) : 0,
      pct2yr: tracked ? Math.round((within(730) / tracked) * 100) : 0,
      topPaths: [...paths.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count).slice(0, 6)
    };
  }, [upgrades.pilots, scope, tenure, year]);

  const tiles: { key: Bucket; label: string; value: number; hint?: string }[] = [
    { key: "advanced", label: "Advanced", value: s.advanced, hint: "≥ 1 move" },
    { key: "once", label: "Once", value: s.once, hint: "1 move" },
    { key: "twice", label: "Twice or more", value: s.twice, hint: "≥ 2 moves" },
    { key: "thrice", label: "3× or more", value: s.thrice, hint: "≥ 3 moves" },
    { key: "captain", label: "Made Captain", value: s.madeCaptain, hint: "FO → Captain" }
  ];
  const maxTile = Math.max(...tiles.map((t) => t.value), 1);

  const bucketTest = (r: { moves: number; up: number }) =>
    bucket === "once" ? r.moves === 1 : bucket === "twice" ? r.moves >= 2 : bucket === "thrice" ? r.moves >= 3 : bucket === "captain" ? r.up >= 1 : r.moves >= 1;
  const filtered = s.rows.filter(bucketTest);
  const activeTile = tiles.find((t) => t.key === bucket);
  const tenureLabel = tenure === 365 ? "1+ yr" : tenure === 730 ? "2+ yr" : tenure === 1825 ? "5+ yr" : null;
  const denomLabel =
    (year === "all" ? `${scope === "active" ? "active" : "all"} pilots` : `pilots on staff in ${year}${scope === "active" ? " (still here)" : ""}`) +
    (tenureLabel ? ` with ${tenureLabel} tenure` : "");

  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Fleet progression</p>
          <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">Upgrades &amp; transitions</h2>
          <p className="mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400">
            {s.advanced} of {s.tracked} {denomLabel} ({s.pctAdvanced}%) upgraded or transitioned{year === "all" ? "" : ` in ${year}`}. An{" "}
            <span className="font-medium text-brand-eden dark:text-slate-300">upgrade</span> is FO → Captain on the same aircraft; a{" "}
            <span className="font-medium text-brand-eden dark:text-slate-300">transition</span> is a move to a new aircraft.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="inline-flex rounded border border-brand-lea/15 p-0.5 text-xs font-semibold dark:border-white/10">
            {(["active", "all"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setScope(v)}
                aria-pressed={scope === v}
                className={clsx("rounded px-3 py-1.5 transition", scope === v ? "bg-brand-lea text-white" : "text-brand-grey hover:text-brand-lea dark:text-slate-400")}
              >
                {v === "active" ? "Active pilots" : "All pilots"}
              </button>
            ))}
          </div>
          <select
            value={tenure}
            onChange={(e) => setTenure(Number(e.target.value) as 0 | 365 | 730 | 1825)}
            aria-label="Filter by tenure"
            className="rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
          >
            <option value={0}>Any tenure</option>
            <option value={365}>1+ yr tenure</option>
            <option value={730}>2+ yr tenure</option>
            <option value={1825}>5+ yr tenure</option>
          </select>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value === "all" ? "all" : Number(e.target.value))}
            aria-label="Filter by year"
            className="rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
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
          <div className="mt-4 rounded bg-brand-lea p-4 text-white">
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
              { label: "Avg time to advance", value: fmtSpan(s.avgToMove), sub: "hire → first move" },
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

          {/* Secondary timing */}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Avg to first upgrade", value: fmtSpan(s.avgToUpgrade) },
              { label: "Avg to first transition", value: fmtSpan(s.avgToTransition) },
              { label: "Advanced within 1 yr", value: `${s.pct1yr}%` },
              { label: "Advanced within 2 yr", value: `${s.pct2yr}%` }
            ].map((c) => (
              <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
                <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{c.value}</div>
              </div>
            ))}
          </div>

          {/* The climb graph */}
          <div className="mt-5 rounded border border-brand-lea/10 bg-gradient-to-b from-brand-cloudDancer/40 to-transparent p-4 dark:border-white/10 dark:from-white/5">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
              Cumulative upgrades + transitions over time
            </div>
            <div className="mt-2">
              <ClimbChart pilots={s.poolNoYear} />
            </div>
          </div>

          {/* Clickable buckets */}
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t) => {
              const active = t.key === bucket;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setBucket(t.key)}
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
                  <span className={clsx("text-[10px]", active ? "text-white/70" : "text-brand-grey dark:text-slate-400")}>{t.hint}</span>
                  <span className={clsx("mt-2 h-1 rounded-full", active ? "bg-brand-gold/30" : "bg-brand-gold/20")}>
                    <span className="block h-1 rounded-full bg-brand-gold" style={{ width: `${Math.max(8, (t.value / maxTile) * 100)}%` }} />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Roster drill-down */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                {activeTile?.label} — {filtered.length} {filtered.length === 1 ? "pilot" : "pilots"}
              </p>
              <p className="text-[11px] text-brand-grey dark:text-slate-400"><span className="font-semibold text-brand-gold">↗ upgrade</span> · <span className="font-semibold text-brand-eden dark:text-slate-300">→ transition</span></p>
            </div>
            <div className="mt-2 max-h-[560px] space-y-2 overflow-y-auto pr-1 print:max-h-none print:overflow-visible">
              {filtered.length === 0 ? (
                <p className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-6 text-center text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  No pilots in this group yet.
                </p>
              ) : (
                filtered.map(({ p, up, tr }) => (
                  <div key={p.hireId} className="rounded border border-brand-lea/10 bg-white p-3 transition hover:border-brand-gold/40 dark:border-white/10 dark:bg-white/5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Link
                        href={`/people/${p.hireId}`}
                        className="font-semibold text-brand-lea transition hover:text-brand-eden hover:drop-shadow-[0_0_6px_rgba(234,170,0,0.5)] dark:text-slate-100"
                      >
                        {p.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {up > 0 && (
                          <span className="rounded-full bg-brand-gold/20 px-2 py-0.5 font-semibold text-brand-lea dark:text-brand-gold">
                            {up} upgrade{up === 1 ? "" : "s"}
                          </span>
                        )}
                        {tr > 0 && (
                          <span className="rounded-full bg-brand-eden/10 px-2 py-0.5 font-semibold text-brand-eden dark:bg-white/5 dark:text-slate-300">
                            {tr} transition{tr === 1 ? "" : "s"}
                          </span>
                        )}
                        <span className="text-brand-grey dark:text-slate-400">{fmtSpan(p.daysToFirstMove)} to 1st</span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <PilotJourney steps={p.steps} />
                    </div>
                  </div>
                ))
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

function TravelSpend({ travel }: { travel: ReportsData["travelSpend"] }) {
  const [openPurpose, setOpenPurpose] = useState<string | null>(travel.byPurpose[0]?.purpose ?? null);

  const hiredPct = travel.totalSpend > 0 ? (travel.hiredSpend / travel.totalSpend) * 100 : 0;
  const notHiredPct = travel.totalSpend > 0 ? (travel.notHiredSpend / travel.totalSpend) * 100 : 0;
  const otherPct = Math.max(0, 100 - hiredPct - notHiredPct);
  const maxPurpose = Math.max(...travel.byPurpose.map((p) => p.spend), 1);

  return (
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
          <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-brand-cloudDancer dark:bg-white/10">
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
                    <div className="mt-2 h-1.5 rounded-full bg-brand-lea/5 dark:bg-white/10">
                      <div className="h-1.5 rounded-full" style={{ width: `${Math.max(6, (p.spend / maxPurpose) * 100)}%`, backgroundColor: color }} />
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
                                    className="text-sm font-semibold text-brand-lea transition hover:text-brand-eden hover:drop-shadow-[0_0_6px_rgba(234,170,0,0.5)] dark:text-slate-100"
                                  >
                                    {t.travelerName}
                                  </Link>
                                ) : (
                                  <span className="text-sm font-semibold text-brand-grey dark:text-slate-400">{t.travelerName}</span>
                                )}
                                <span className="ml-2 text-xs text-brand-grey dark:text-slate-400">
                                  {t.route ?? "route TBD"} · {fmtDate(t.startsAt)}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span
                                  className={clsx(
                                    "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
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
  );
}

function DocumentCurrency({ dc }: { dc: ReportsData["documentCurrency"] }) {
  return (
    <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
      <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Document currency</p>
      <h2 className="text-base font-semibold text-brand-lea dark:text-slate-100">Expiring &amp; expired candidate documents</h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Expired", value: dc.counts.expired, tone: "text-red-600" },
          { label: "Due ≤ 30 days", value: dc.counts.due30, tone: "text-amber-600" },
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
        <div className="mt-4 overflow-x-auto">
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
                const tone = item.status === "expired" ? "text-red-600" : item.status === "due30" ? "text-amber-600" : "text-brand-lea dark:text-slate-100";
                return (
                  <tr key={i} className="transition hover:bg-brand-sweet/10">
                    <td className="px-3 py-2">
                      <Link href={`/candidates/${item.candidateId}`} className="font-semibold text-brand-lea transition hover:text-brand-eden dark:text-slate-100">
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
              tab === t.id
                ? "bg-brand-lea text-white shadow-sm"
                : "text-brand-grey hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/5"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "progression" ? <PilotProgressions upgrades={data.pilotUpgrades} /> : null}
      {tab === "travel" ? <TravelSpend travel={data.travelSpend} /> : null}
      {tab === "documents" ? <DocumentCurrency dc={data.documentCurrency} /> : null}
    </div>
  );
}
