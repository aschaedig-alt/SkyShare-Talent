"use client";

import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { R } from "@/components/reports/report-ui";
import { TurnoverChart, TurnoverLegend } from "@/components/reports/TurnoverChart";
import { ExitsToggle, exitsFor, valuesFor } from "@/components/reports/TurnoverReport";
import { formatCalendarDay } from "@/lib/dates/display";
import { REPORTS } from "@/lib/reports/catalog";
import type { RollingTurnover } from "@/lib/data/rolling-turnover";

// Reports > At a glance: the one number from each report, each card a real link to
// the report it came from. Rolling turnover leads, with the dashboard's chart.

export type GlanceData = {
  turnover: RollingTurnover;
  headcount: { today: number; pilots: number; others: number; change: number; sinceYear: number } | null;
  seats: { filled: number; target: number; open: number; training: number } | null;
  travel: { year: number; total: number; trips: number; hiredShare: number | null } | null;
  /** HR only: null for everyone else. */
  quality: { leftEarly: { left: number; of: number }; since: number | null; good: number; bad: number; regretted: number; decided: number } | null;
};

const hrefOf = (id: string) => REPORTS.find((r) => r.id === id)?.href ?? "/reports";
const titleOf = (id: string) => REPORTS.find((r) => r.id === id)?.title ?? "";
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function Card({ id, label, value, detail, extra, hr }: { id: string; label: string; value: string; detail: string; extra?: React.ReactNode; hr?: boolean }) {
  return (
    <Link href={hrefOf(id)} className={clsx(R.tile, "flex flex-col gap-1 transition hover:shadow-glow")}>
      <span className={clsx(R.tileLabel, "flex items-center justify-between gap-2")}>
        {label}
        {hr ? <span className={R.chip}>HR</span> : null}
      </span>
      <span className={R.tileValue}>{value}</span>
      <span className="text-sm text-brand-black/80 dark:text-slate-300">{detail}</span>
      {extra}
      <span className="mt-auto pt-1 text-xs font-semibold text-brand-eden dark:text-brand-edenOnDark">Open {titleOf(id)} →</span>
    </Link>
  );
}

export function ReportsGlance({ data }: { data: GlanceData }) {
  const [mode, setMode] = useState<"all" | "leaveOut">("all");
  const t = data.turnover;
  const v = valuesFor(t.company, mode);
  const last = v[v.length - 1] ?? 0;
  const d = Math.round((last - (v[0] ?? 0)) * 10) / 10;
  const labels = t.points.map((p) => p.label);
  const long = t.points.map((p) => p.long);
  const q = data.quality;

  return (
    <section className={R.panel}>
      <p className={R.eyebrow}>Reports</p>
      <h2 className={R.title}>At a glance</h2>
      <p className={R.lede}>The one number from each report, as of {formatCalendarDay(t.asOf)}. Open a card, or pick a report from the list, for the detail.</p>

      <div className={clsx(R.box, "grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]")}>
        <div className="flex min-w-0 flex-col gap-2">
          <span className={R.sectionLabel}>Turnover · rolling 12 months</span>
          <span className="text-3xl font-bold text-brand-lea dark:text-slate-100">{last}%</span>
          <span className="text-sm text-brand-black/80 dark:text-slate-300">
            {exitsFor(t.company, mode)} people left in the last 12 months, out of about {Math.round(t.company.avgHeadcount)}
          </span>
          <span className="text-xs font-semibold text-brand-eden dark:text-brand-edenOnDark">
            {d === 0 ? "no change" : `${d < 0 ? "down" : "up"} ${Math.abs(d).toFixed(1)} pts`} since {long[0]}
          </span>
          <div>
            <ExitsToggle mode={mode} onChange={setMode} />
          </div>
          <Link href={hrefOf("turnover")} className={clsx(R.smallButton, "self-start")}>
            Open Turnover, by department →
          </Link>
        </div>
        <div className="min-w-0">
          <TurnoverChart labels={labels} long={long} values={v} label={`Company rolling 12-month turnover, ${long[0]} to ${long[long.length - 1]}`} />
          <TurnoverLegend withCompany={false} />
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.headcount ? (
          <Card
            id="headcount"
            label="Headcount today"
            value={String(data.headcount.today)}
            detail={`${data.headcount.pilots} pilots · ${data.headcount.others} in support roles`}
            extra={
              <span className="text-xs font-semibold text-brand-eden dark:text-brand-edenOnDark">
                {data.headcount.change >= 0 ? "▲" : "▼"} {Math.abs(data.headcount.change)} since the end of {data.headcount.sinceYear}
              </span>
            }
          />
        ) : null}
        {q ? (
          <Card
            id="quality"
            hr
            label="Left in their first year"
            value={pct(q.leftEarly.left, q.leftEarly.of)}
            detail={`${q.leftEarly.left} of ${q.leftEarly.of} hires${q.since ? ` since ${q.since}` : ""} old enough to tell`}
          />
        ) : null}
        {q ? (
          <Card
            id="quality"
            hr
            label="Good hires"
            value={pct(q.good, q.decided)}
            detail={`of the ${q.decided} hires with a verdict`}
            extra={
              <>
                <span className="mt-1 flex h-1.5 overflow-hidden rounded-sm" role="img" aria-label={`Good ${pct(q.good, q.decided)}, bad ${pct(q.bad, q.decided)}, regretted loss ${pct(q.regretted, q.decided)}`}>
                  <span className="bg-brand-lea dark:bg-brand-sweet" style={{ width: pct(q.good, q.decided) }} />
                  <span className="bg-brand-gold" style={{ width: pct(q.bad, q.decided) }} />
                  <span className="bg-brand-eden" style={{ width: pct(q.regretted, q.decided) }} />
                </span>
                <span className={R.tileSub}>
                  Good {pct(q.good, q.decided)} · Bad {pct(q.bad, q.decided)} · Regretted {pct(q.regretted, q.decided)}
                </span>
              </>
            }
          />
        ) : null}
        {data.seats ? (
          <Card
            id="progression"
            label="Pilot seats filled"
            value={`${data.seats.filled} of ${data.seats.target}`}
            detail={`${data.seats.open} open · ${data.seats.training} in training · all fleets`}
          />
        ) : null}
        {data.travel ? (
          <Card
            id="travel"
            label={`Hiring travel, ${data.travel.year}`}
            value={money(data.travel.total)}
            detail={`${data.travel.trips} trips${data.travel.hiredShare !== null ? ` · ${Math.round(data.travel.hiredShare * 100)}% on people we hired` : ""}`}
          />
        ) : null}
      </div>
    </section>
  );
}
