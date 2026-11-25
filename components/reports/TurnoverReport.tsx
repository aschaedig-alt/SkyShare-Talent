"use client";

import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { R } from "@/components/reports/report-ui";
import { TurnoverChart, TurnoverLegend } from "@/components/reports/TurnoverChart";
import { formatCalendarDay } from "@/lib/dates/display";
import { FIRST_END, WINDOW, rollingAt, type TurnoverHistory, type TurnoverSeries } from "@/lib/reports/rolling-turnover-math";

// People > Turnover: the Turnover Manager Dashboard's charts, on Journey's data.
// Every one of the dashboard's 13 departments is shown, however small (his rule,
// 2026-11-24) - the note under the small charts says why a small one jumps.
//
// Month and Year pick the month the window ends, as the dashboard's pickers do (his
// ask, 2026-11-24): the figures are the 12 months up to it, the charts the 12 rolling
// points ending at it. The pick rides in the URL (?end=YYYY-MM), so Copy link keeps it.

type Mode = "all" | "leaveOut";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const pts = (a: number, b: number) => {
  const d = Math.round((b - a) * 10) / 10;
  return d === 0 ? "no change" : `${d < 0 ? "down" : "up"} ${Math.abs(d).toFixed(1)} pts`;
};
const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const shortOf = (key: string) => `${SHORT[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

export function ExitsToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className={clsx(R.segmentGroup, "max-w-full")} role="group" aria-label="Which exits count">
      <button type="button" onClick={() => onChange("all")} aria-pressed={mode === "all"} className={clsx(R.segment, mode === "all" ? R.segmentOn : R.segmentOff)}>
        All exits
      </button>
      <button
        type="button"
        onClick={() => onChange("leaveOut")}
        aria-pressed={mode === "leaveOut"}
        className={clsx(R.segment, mode === "leaveOut" ? R.segmentOn : R.segmentOff)}
      >
        Leave out layoffs, moves, retirement
      </button>
    </div>
  );
}

export const valuesFor = (s: TurnoverSeries, mode: Mode) => (mode === "all" ? s.rate : s.leaveOut);
export const exitsFor = (s: TurnoverSeries, mode: Mode) => (mode === "all" ? s.exits : s.exits - s.exitsLeftOut);

export function TurnoverReport({ history, initialEnd }: { history: TurnoverHistory; initialEnd: string | null }) {
  const lastIdx = history.months.length - 1;
  const firstIdx = Math.min(FIRST_END, lastIdx);
  const indexOf = (key: string) => history.months.findIndex((m) => m.key === key);
  const clamp = (i: number) => Math.min(Math.max(i, firstIdx), lastIdx);

  const [mode, setMode] = useState<Mode>("all");
  const [endIdx, setEndIdx] = useState(() => {
    const i = initialEnd ? indexOf(initialEnd) : -1;
    return i < 0 ? lastIdx : clamp(i);
  });
  const data = useMemo(() => rollingAt(history, endIdx), [history, endIdx]);

  const endKey = history.months[endIdx].key;
  const endYear = Number(endKey.slice(0, 4));
  const endMonth = Number(endKey.slice(5, 7));
  const firstKey = history.months[firstIdx].key;
  const lastKey = history.months[lastIdx].key;
  const years = Array.from({ length: Number(lastKey.slice(0, 4)) - Number(firstKey.slice(0, 4)) + 1 }, (_, i) => Number(firstKey.slice(0, 4)) + i);
  const keyOf = (y: number, m: number) => `${y}-${String(m).padStart(2, "0")}`;
  const inRange = (key: string) => key >= firstKey && key <= lastKey;

  const pick = (i: number) => {
    const next = clamp(i);
    setEndIdx(next);
    // The link carries the pick, so Copy link and a refresh keep it. The latest month needs no parameter.
    const url = new URL(window.location.href);
    if (next === lastIdx) url.searchParams.delete("end");
    else url.searchParams.set("end", history.months[next].key);
    window.history.replaceState(window.history.state, "", url);
  };
  const pickMonth = (m: number) => pick(indexOf(keyOf(endYear, m)));
  const pickYear = (y: number) => {
    const want = keyOf(y, endMonth);
    pick(inRange(want) ? indexOf(want) : want < firstKey ? firstIdx : lastIdx);
  };

  const c = data.company;
  const v = valuesFor(c, mode);
  const last = v[v.length - 1] ?? 0;
  const labels = data.points.map((p) => p.label);
  const long = data.points.map((p) => p.long);
  const high = Math.max(...v);
  const windowFrom = history.months[Math.max(0, endIdx - WINDOW + 1)].key;
  const period = `${shortOf(windowFrom)} – ${shortOf(endKey)}`;
  const endLong = history.months[endIdx].long;

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div>
          <p className={R.eyebrow}>People</p>
          <h2 className={R.title}>Turnover</h2>
          <p className={R.lede}>
            People who left in 12 months, against the average headcount over those months. The same measure, and the same 13 departments, as the
            Turnover Manager Dashboard. Pick the month the 12 months end.
          </p>
        </div>
        <div className={clsx(R.controls, "max-w-full")}>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-brand-grey dark:text-slate-400">
            Month
            <select className={R.select} value={endMonth} onChange={(e) => pickMonth(Number(e.target.value))} aria-label="Month the 12 months end">
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i + 1} disabled={!inRange(keyOf(endYear, i + 1))}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-brand-grey dark:text-slate-400">
            Year
            <select className={R.select} value={endYear} onChange={(e) => pickYear(Number(e.target.value))} aria-label="Year the 12 months end">
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          {endIdx !== lastIdx ? (
            <button type="button" onClick={() => pick(lastIdx)} className={R.smallButton}>
              Back to now
            </button>
          ) : null}
          <ExitsToggle mode={mode} onChange={setMode} />
        </div>
      </div>

      <div className={R.hero}>
        <div className={R.heroRow}>
          <span className={R.heroFigure}>{last}%</span>
          <span className={R.heroText}>
            rolling 12-month turnover, {data.endsToday ? `as of ${formatCalendarDay(data.asOf)}` : `12 months to the end of ${endLong}`}
          </span>
        </div>
        <p className={R.heroSub}>
          {period} · {people(exitsFor(c, mode))} left · average headcount {c.avgHeadcount}
          {mode === "leaveOut" ? ` · leaving out ${c.exitsLeftOut} layoffs, moves, retirements and exits the business caused` : ""}
        </p>
      </div>

      <div className={R.tiles}>
        <div className={R.tile}>
          <div className={R.tileLabel}>Turnover, {shortOf(endKey)}</div>
          <div className={R.tileValue}>{last}%</div>
          <div className={R.tileSub}>
            {pts(v[0] ?? 0, last)} since {long[0]}
          </div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Left in the 12 months</div>
          <div className={R.tileValue}>{exitsFor(c, mode)}</div>
          <div className={R.tileSub}>{mode === "all" ? `${c.exitsLeftOut} were layoffs, moves or retirement` : `leaving out ${c.exitsLeftOut}`}</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Average headcount</div>
          <div className={R.tileValue}>{Math.round(c.avgHeadcount)}</div>
          <div className={R.tileSub}>month-ends, {period}</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Highest in the chart</div>
          <div className={R.tileValue}>{high}%</div>
          <div className={R.tileSub}>{long[v.indexOf(high)]}</div>
        </div>
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>Company, rolling 12 months</div>
        <div className="mt-2">
          <TurnoverChart labels={labels} long={long} values={v} label={`Company rolling 12-month turnover, ${long[0]} to ${long[long.length - 1]}`} />
        </div>
        <TurnoverLegend withCompany={false} />
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>By department, against the company</div>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.departments.map(({ name, series }) => {
            const dv = valuesFor(series, mode);
            const nobody = series.heads.every((h) => h === 0) && series.exits === 0;
            return (
              <div key={name} className="min-w-0 rounded border border-brand-lea/10 p-3 dark:border-white/10">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={R.listTitle}>{name}</span>
                  <span className={R.strong}>{nobody ? "—" : `${dv[dv.length - 1]}%`}</span>
                </div>
                {nobody ? (
                  <p className={R.tileSub}>Nobody in this department in Journey for these months.</p>
                ) : (
                  <>
                    <div className={R.tileSub}>
                      about {people(Math.round(series.avgHeadcount))} · {exitsFor(series, mode)} left in the 12 months
                    </div>
                    <div className="mt-1">
                      <TurnoverChart small labels={labels} long={long} values={dv} company={v} label={`${name} rolling turnover against the company`} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <TurnoverLegend withCompany />
        <p className={R.footnote}>
          In a small department one exit moves the line a long way: with about 3 people, a single exit is over 30 points.
          {data.unplaced.avgHeadcount || data.unplaced.exits
            ? ` ${people(Math.round(data.unplaced.avgHeadcount))} on average, and ${data.unplaced.exits} of the exits, have no department in Journey for these months, so they count only in the company line.`
            : ""}
        </p>
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>Every department, {period}</div>
        {/* A table on a wide screen; one row per line on a phone - nothing scrolls sideways. */}
        <div className={clsx(R.tableWrap, "hidden sm:block")}>
          <table className={R.table}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Department</th>
                <th className={clsx(R.th, "text-right")}>Left, 12 months</th>
                <th className={clsx(R.th, "text-right")}>Average headcount</th>
                <th className={clsx(R.th, "text-right")}>Turnover</th>
                <th className={clsx(R.th, "text-right")}>Leaving out layoffs etc.</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {[{ name: "Company", series: c, strong: true }, ...data.departments.map((d) => ({ ...d, strong: false }))].map((row) => (
                <tr key={row.name} className={R.tr}>
                  <td className={clsx(R.td, row.strong && R.strong)}>{row.name}</td>
                  <td className={R.num}>{row.series.exits}</td>
                  <td className={R.num}>{row.series.avgHeadcount}</td>
                  <td className={R.num}>{row.series.rate[row.series.rate.length - 1]}%</td>
                  <td className={R.num}>{row.series.leaveOut[row.series.leaveOut.length - 1]}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className={clsx(R.tbody, "mt-2 sm:hidden")}>
          {[{ name: "Company", series: c }, ...data.departments].map((row) => (
            <li key={row.name} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className={R.strong}>{row.name}</span>
                <span className={clsx(R.tileSub, "block")}>
                  {row.series.exits} left · about {Math.round(row.series.avgHeadcount)} people · {row.series.leaveOut[row.series.leaveOut.length - 1]}% leaving out layoffs etc.
                </span>
              </span>
              <span className={R.strong}>{row.series.rate[row.series.rate.length - 1]}%</span>
            </li>
          ))}
        </ul>
      </div>

      <details className="mt-4">
        <summary className={clsx(R.listTitle, "cursor-pointer marker:text-brand-gold")}>How this is counted</summary>
        <p className={R.lede}>
          For each month: everyone who left in the 12 months up to that month, divided by the average month-end headcount over those 12 months. This
          month ends today. Employees only: contractors, test records and offers that never started are left out, the same as Headcount &amp; tenure.
          A rehire who leaves twice counts twice. &ldquo;Leave out&rdquo; drops layoffs, moves and retirement (Paycom&apos;s reason) and exits marked as
          caused by the business, the same exits Hire quality does not count; exits before 2021 have no Paycom reason, so they are never left out.
          Departments are the dashboard&apos;s: Exec &amp; Exec Support is the leadership team and their assistant, matched by job title, and everyone
          else by their department in Journey today. Different from &ldquo;left in their first year&rdquo; on Hire quality, which follows each hire
          from their start date.
        </p>
        <p className={R.lede}>
          How far back to trust it: from 2021 on, these figures agree with the Turnover Manager Dashboard to within a few points. Before 2021 the
          dashboard shows no exits at all, so there is nothing to check against; Journey&apos;s figures come from the year-end rosters. Before about
          2019 many early employees have no department in Journey, so the department charts there are mostly empty and those people count in the
          company line only.
        </p>
      </details>
    </section>
  );
}
