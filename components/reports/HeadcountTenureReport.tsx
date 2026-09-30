"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { clsx } from "clsx";
import type { HeadcountHistory, HeadcountYear } from "@/lib/data/headcount-history";
import { rosterOf } from "@/lib/reports/headcount-roster";

// The Reports "Headcount & Tenure" tab. Aimee's ask of 2026-09-29, in her words:
// "i want to be able to say 'in 2020 we had xx employees, xx of them were pilots,
// xx of those employees are still here.'" The sentence at the top is exactly that,
// for whichever year is picked - from the menu, the chart or the table. The data
// and every definition behind it are in lib/data/headcount-history.ts.

const PANEL = "rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10";
const EYEBROW = "text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold";

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

function yrs(n: number | null): string {
  if (n === null) return "—";
  return n < 1 ? `${Math.round(n * 12)} mo` : `${n.toFixed(1)} yr`;
}

function monthYear(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

/** More than half of a year's departures dated Dec 31: a yearly roster's "gone by next year". */
function yearEndDated(y: HeadcountYear): boolean {
  return y.left > 0 && y.leftOnDec31 * 2 > y.left;
}

export function HeadcountTenureReport({ history }: { history: HeadcountHistory }) {
  const years = history.years;
  // The last FULL year by default: its question ("who from then is still here")
  // has an answer, where today's is trivially everybody.
  const defaultYear = [...years].reverse().find((y) => !y.isToday)?.year ?? years[years.length - 1]?.year ?? null;
  const [selected, setSelected] = useState<number | null>(defaultYear);
  const sel = years.find((y) => y.year === selected) ?? null;

  if (!sel) {
    return (
      <section className={PANEL}>
        <p className={EYEBROW}>Headcount &amp; tenure</p>
        <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">No employment dates are on file yet, so there is nothing to count.</p>
      </section>
    );
  }

  const index = years.findIndex((y) => y.year === sel.year);
  const step = (d: -1 | 1) => {
    const next = years[index + d];
    if (next) setSelected(next.year);
  };

  return (
    <div className="space-y-4">
      <section className={PANEL}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className={EYEBROW}>Headcount &amp; tenure</p>
            <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">Who was here, year by year</h2>
          </div>
          <div className="flex items-center gap-1.5 print:hidden">
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={index <= 0}
              aria-label="Previous year"
              className="rounded border border-brand-lea/15 px-2.5 py-1.5 text-sm font-semibold text-brand-lea transition hover:shadow-glow disabled:opacity-40 dark:border-white/10 dark:text-slate-100"
            >
              ‹
            </button>
            <select
              value={sel.year}
              onChange={(e) => setSelected(Number(e.target.value))}
              aria-label="Year"
              className="rounded border border-brand-lea/15 bg-white px-2 py-1.5 text-sm font-semibold text-brand-lea dark:border-white/10 dark:bg-brand-field dark:text-slate-100"
            >
              {[...years].reverse().map((y) => (
                <option key={y.year} value={y.year}>
                  {y.isToday ? `${y.year} · today` : `End of ${y.year}`}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={index >= years.length - 1}
              aria-label="Next year"
              className="rounded border border-brand-lea/15 px-2.5 py-1.5 text-sm font-semibold text-brand-lea transition hover:shadow-glow disabled:opacity-40 dark:border-white/10 dark:text-slate-100"
            >
              ›
            </button>
          </div>
        </div>

        {/* Her sentence, filled in. Employees only: a contractor is not one of her
            "xx employees", and counting them in is what the first version got wrong. */}
        <p className="mt-4 max-w-4xl text-lg leading-8 text-brand-black dark:text-slate-200">
          {sel.isToday ? "Today SkyShare has " : `At the end of ${sel.year}, SkyShare had `}
          <b className="text-brand-lea dark:text-slate-100">{sel.employees}</b> {sel.employees === 1 ? "employee" : "employees"} —{" "}
          <b className="text-brand-lea dark:text-slate-100">{sel.pilots}</b> of them pilots.
          {!sel.isToday ? (
            <>
              {" "}
              <b className="text-brand-lea dark:text-slate-100">{sel.stillHere}</b> of those {sel.employees} are still here today (
              {pct(sel.stillHere, sel.employees)}), {sel.pilotsStillHere} of the {sel.pilots} pilots among them.
            </>
          ) : null}
        </p>
        {sel.contractors > 0 ? (
          <p className="mt-1 text-[12.5px] text-brand-grey dark:text-slate-400">
            Not counted as employees: {plural(sel.contractors, "contractor")} working for SkyShare {sel.isToday ? "today" : "that day"}.
          </p>
        ) : null}
        {sel.roleUnknown > 0 ? (
          <p className="mt-1 text-[12.5px] text-brand-grey dark:text-slate-400">
            {sel.roleUnknown} of the {sel.employees} {sel.roleUnknown === 1 ? "has" : "have"} no role recorded for{" "}
            {sel.isToday ? "today" : "that date"}, so they count as neither a pilot nor not.
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {[
            { label: sel.isToday ? "Employees today" : `Employees, end of ${sel.year}`, value: String(sel.employees), sub: `${sel.joined} joined · ${sel.left} left that year` },
            { label: "Pilots", value: String(sel.pilots), sub: `${sel.others} in other roles${sel.roleUnknown ? ` · ${sel.roleUnknown} not recorded` : ""}` },
            {
              label: "Still here today",
              value: sel.isToday ? "—" : String(sel.stillHere),
              sub: sel.isToday ? "everybody, by definition" : `${pct(sel.stillHere, sel.employees)} of them · ${plural(sel.pilotsStillHere, "pilot")}`
            },
            { label: "Contractors", value: String(sel.contractors), sub: "on contract - not in the employee figures" },
            { label: "Median tenure then", value: yrs(sel.medianTenureYears), sub: "employees' time at SkyShare that day" }
          ].map((c) => (
            <div key={c.label} className="rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{c.label}</div>
              <div className="mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100">{c.value}</div>
              <div className="text-[11px] text-brand-grey dark:text-slate-400">{c.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <section className={PANEL}>
        <p className={EYEBROW}>Employees at each year-end</p>
        <p className="mt-1 text-[12.5px] text-brand-grey dark:text-slate-400">
          Contractors sit on top in outline and are in none of the figures. Click a year to read it above.
        </p>
        <HeadcountChart years={years} selected={sel.year} onSelect={setSelected} />
      </section>

      <section className={PANEL}>
        <p className={EYEBROW}>Year by year</p>
        <div className="mt-3 overflow-x-auto overflow-y-hidden">
          <table className="w-full min-w-[800px] border-collapse text-left text-sm">
            <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.14em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
              <tr>
                <th className="px-3 py-2 font-bold">Year</th>
                <th className="px-3 py-2 text-right font-bold">Employees</th>
                <th className="px-3 py-2 text-right font-bold">Contractors</th>
                <th className="px-3 py-2 text-right font-bold">Pilots</th>
                <th className="px-3 py-2 text-right font-bold">Other roles</th>
                <th className="px-3 py-2 text-right font-bold">Role not recorded</th>
                <th className="px-3 py-2 text-right font-bold">Joined</th>
                <th className="px-3 py-2 text-right font-bold">Left</th>
                <th className="px-3 py-2 text-right font-bold">Still here today</th>
              </tr>
            </thead>
            <tbody>
              {[...years].reverse().map((y) => (
                <tr
                  key={y.year}
                  className={clsx(
                    "border-t border-brand-lea/10 dark:border-white/10",
                    y.year === sel.year ? "bg-brand-gold/10" : "hover:bg-brand-cloudDancer/40 dark:hover:bg-white/5"
                  )}
                >
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      onClick={() => setSelected(y.year)}
                      aria-pressed={y.year === sel.year}
                      className="font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100"
                    >
                      {y.isToday ? `${y.year} · today` : y.year}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-brand-lea dark:text-slate-100">{y.employees}</td>
                  <td className={clsx("px-3 py-2 text-right tabular-nums", !y.contractors && "text-brand-grey dark:text-slate-500")}>{y.contractors}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{y.pilots}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{y.others}</td>
                  <td className={clsx("px-3 py-2 text-right tabular-nums", y.roleUnknown ? "text-amber-700 dark:text-amber-300" : "text-brand-grey dark:text-slate-500")}>
                    {y.roleUnknown}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{y.joined}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {y.left}
                    {yearEndDated(y) ? <span title="Most of these are dated Dec 31 - imported from yearly lists, so they left some time after that year's list"> †</span> : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {y.isToday ? "—" : `${y.stillHere} (${pct(y.stillHere, y.employees)})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {years.some(yearEndDated) ? (
          <p className="mt-2 text-[11.5px] text-brand-grey dark:text-slate-400">
            † Most departures that year are dated December 31: that history came from yearly staff lists, so it says who was gone by the
            next list rather than the day they left.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
        <TenureToday tenure={history.tenure} />
        <section className={PANEL}>
          <p className={EYEBROW}>Longest serving today</p>
          <ul className="mt-3 divide-y divide-brand-lea/10 dark:divide-white/10">
            {history.tenure.longest.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <Link href={`/people/${p.id}`} className="font-semibold text-brand-lea underline-offset-2 hover:underline dark:text-slate-100">
                    {p.name}
                  </Link>
                  <span className="block truncate text-[12px] text-brand-grey dark:text-slate-400">{p.role ?? "Role not recorded"}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold tabular-nums text-brand-lea dark:text-slate-100">{p.years.toFixed(1)} yr</span>
                  <span className="block text-[11.5px] text-brand-grey dark:text-slate-400">since {monthYear(p.since)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className={PANEL}>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-brand-lea marker:text-brand-gold dark:text-slate-100">
            The {plural(sel.employees, "employee")}
            {sel.contractors ? ` and ${plural(sel.contractors, "contractor")}` : ""} {sel.isToday ? "today" : `at the end of ${sel.year}`}
          </summary>
          <div className="mt-3 overflow-x-auto overflow-y-hidden">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.14em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="px-3 py-2 font-bold">Name</th>
                  <th className="px-3 py-2 font-bold">Role {sel.isToday ? "today" : "that day"}</th>
                  <th className="px-3 py-2 text-right font-bold">At SkyShare then</th>
                  <th className="px-3 py-2 text-right font-bold">Still here</th>
                </tr>
              </thead>
              <tbody>
                {rosterOf(history, sel.roster).map((p, i, all) => (
                  <Fragment key={p.id}>
                    {/* Employees come first, then contractors under their own heading. */}
                    {p.contractor && !all[i - 1]?.contractor ? (
                      <tr className="border-t border-brand-lea/10 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5">
                        <td colSpan={4} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
                          Contractors - not counted as employees
                        </td>
                      </tr>
                    ) : null}
                    <tr className="border-t border-brand-lea/10 dark:border-white/10">
                      <td className="px-3 py-1.5">
                        <Link href={`/people/${p.id}`} className="font-medium text-brand-lea underline-offset-2 hover:underline dark:text-slate-100">
                          {p.name}
                        </Link>
                        {p.pilot ? <span className="ml-1.5 rounded bg-sky-50 px-1 text-[10px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">pilot</span> : null}
                        {p.contractor ? (
                          <span className="ml-1.5 rounded border border-dashed border-brand-eden/60 px-1 text-[10px] font-semibold text-brand-eden dark:border-slate-400 dark:text-slate-300">
                            contractor
                          </span>
                        ) : null}
                      </td>
                      <td className={clsx("px-3 py-1.5", p.role ? "text-brand-black dark:text-slate-200" : "italic text-amber-700 dark:text-amber-300")}>
                        {p.role ?? "Not recorded"}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums">{yrs(p.tenureYears)}</td>
                      <td className="px-3 py-1.5 text-right">{p.stillHere ? "Yes" : <span className="text-brand-grey dark:text-slate-500">No</span>}</td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <p className="px-1 text-[12px] leading-5 text-brand-grey dark:text-slate-400">
        History on file starts in {history.firstYear}.
        {history.coverage.earliestPilotRole ? (
          <>
            {" "}
            No pilot role on file starts before {monthYear(history.coverage.earliestPilotRole)}, and{" "}
            {history.coverage.unknownBeforePilots} people on staff at a year-end before then have no role recorded — so pilot counts before{" "}
            {new Date(history.coverage.earliestPilotRole).getUTCFullYear()} are incomplete, not zero.
          </>
        ) : null}{" "}
        {history.coverage.undated ? `${history.coverage.undated} record${history.coverage.undated === 1 ? " has" : "s have"} no dates at all and cannot be placed in any year. ` : ""}
        Contractors are counted apart from employees, never inside them. Who was a contractor when comes from the Employee Roster MASTER
        workbook&apos;s TYPE column (its lists run from 2018 to August 2024) and, for today, each person&apos;s status; day-rate pilots count as
        employees, as the workbook&apos;s own totals do. A missing role or employment date is added on the person&apos;s own page and counts here
        straight away.
      </p>
    </div>
  );
}

/**
 * Stacked bars, one per year-end: pilots, other roles, role not recorded - the
 * employees - with that year's contractors on top in dashed outline, so they are
 * visible without reading as staff. The gold line is how many of that year's
 * employees are still here today. Hand-drawn SVG like the rest of Reports - no
 * chart library in this app.
 */
function HeadcountChart({ years, selected, onSelect }: { years: HeadcountYear[]; selected: number; onSelect: (y: number) => void }) {
  const W = 760;
  const H = 290;
  const padL = 40;
  const padR = 14;
  const padT = 14;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const top = Math.max(1, ...years.map((y) => y.employees + y.contractors));
  const stepY = top > 150 ? 50 : top > 60 ? 25 : top > 20 ? 10 : 5;
  const maxY = Math.ceil(top / stepY) * stepY;
  const y = (v: number) => padT + plotH - (v / maxY) * plotH;
  const band = plotW / years.length;
  const barW = Math.min(34, band * 0.62);
  const cx = (i: number) => padL + i * band + band / 2;
  const labelEvery = years.length > 12 ? 2 : 1;
  const linePoints = years.map((yr, i) => `${cx(i)},${y(yr.stillHere)}`).join(" ");

  return (
    <div className="mt-3 w-full overflow-x-auto overflow-y-hidden">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full min-w-[520px]"
        role="img"
        aria-label="Employees at each year-end, split into pilots, other roles and role not recorded, with that year's contractors on top in outline and how many of the employees are still here today"
      >
        {/* Hatched grey for "role not recorded": missing data should look missing,
            and gold already means the selected year and "still here". */}
        <defs>
          <pattern id="hc-unknown" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" className="fill-slate-200 dark:fill-white/10" />
            <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2.5" className="stroke-slate-400 dark:stroke-white/35" />
          </pattern>
        </defs>
        {Array.from({ length: maxY / stepY + 1 }, (_, i) => i * stepY).map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="currentColor" className="text-brand-lea/10 dark:text-white/10" strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="fill-brand-grey text-[11px] dark:fill-slate-400">
              {v}
            </text>
          </g>
        ))}

        {years.map((yr, i) => {
          const x0 = cx(i) - barW / 2;
          const isSel = yr.year === selected;
          const segs = [
            { v: yr.pilots, cls: "fill-brand-lea dark:fill-brand-sweet" },
            { v: yr.others, cls: "fill-brand-eden/70 dark:fill-slate-500" },
            { v: yr.roleUnknown, cls: "", fill: "url(#hc-unknown)" }
          ];
          let base = 0;
          return (
            <g
              key={yr.year}
              role="button"
              tabIndex={0}
              aria-label={`${yr.year}: ${yr.employees} employees, ${yr.pilots} pilots, ${yr.stillHere} still here today, plus ${yr.contractors} contractors`}
              onClick={() => onSelect(yr.year)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelect(yr.year);
                }
              }}
              className="cursor-pointer outline-none"
            >
              <rect x={cx(i) - band / 2} y={padT} width={band} height={plotH} className={isSel ? "fill-brand-gold/15" : "fill-transparent hover:fill-brand-gold/10"} />
              {segs.map((s, k) => {
                const h = (s.v / maxY) * plotH;
                const rect = <rect key={k} x={x0} y={y(base + s.v)} width={barW} height={Math.max(0, h)} className={s.cls} fill={"fill" in s ? s.fill : undefined} />;
                base += s.v;
                return rect;
              })}
              {yr.contractors > 0 ? (
                <rect
                  x={x0 + 0.75}
                  y={y(base + yr.contractors) + 0.75}
                  width={barW - 1.5}
                  height={Math.max(0, (yr.contractors / maxY) * plotH - 1.5)}
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="3 2"
                  className="stroke-brand-eden dark:stroke-slate-300"
                />
              ) : null}
              <title>{`${yr.isToday ? `${yr.year} (today)` : `End of ${yr.year}`}: ${yr.employees} employees - ${yr.pilots} pilots, ${yr.others} other roles${yr.roleUnknown ? `, ${yr.roleUnknown} not recorded` : ""}. ${yr.stillHere} still here today.${yr.contractors ? ` Plus ${yr.contractors} contractor${yr.contractors === 1 ? "" : "s"}, not counted.` : ""}`}</title>
              {(i % labelEvery === 0 || isSel || i === years.length - 1) && (
                <text
                  x={cx(i)}
                  y={H - 12}
                  textAnchor="middle"
                  className={clsx("text-[11px]", isSel ? "fill-brand-lea font-bold dark:fill-brand-gold" : "fill-brand-grey dark:fill-slate-400")}
                >
                  {yr.year}
                </text>
              )}
            </g>
          );
        })}

        <polyline points={linePoints} fill="none" stroke="#eaaa00" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
        {years.map((yr, i) => (
          <circle key={yr.year} cx={cx(i)} cy={y(yr.stillHere)} r={yr.year === selected ? 4.5 : 3} fill="#eaaa00" pointerEvents="none" />
        ))}
      </svg>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[11px] font-medium text-brand-grey dark:text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-brand-lea dark:bg-brand-sweet" /> Pilots
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-brand-eden/70 dark:bg-slate-500" /> Other roles
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-3.5 rounded-sm bg-slate-200 dark:bg-white/10"
            style={{ backgroundImage: "repeating-linear-gradient(45deg, rgb(148 163 184) 0 1.5px, transparent 1.5px 4px)" }}
          />{" "}
          Role not recorded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm border-[1.5px] border-dashed border-brand-eden dark:border-slate-300" /> Contractors, not counted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-[#eaaa00]" /> Of the employees, still here today
        </span>
      </div>
    </div>
  );
}

function TenureToday({ tenure }: { tenure: HeadcountHistory["tenure"] }) {
  const most = Math.max(1, ...tenure.buckets.map((b) => b.count));
  return (
    <section className={PANEL}>
      <p className={EYEBROW}>How long today&apos;s employees have been here</p>
      <p className="mt-1 text-[12.5px] text-brand-grey dark:text-slate-400">
        Median {yrs(tenure.medianYears)} · average {yrs(tenure.averageYears)}. A return within three months continues the time; a longer gap
        starts it again.
      </p>
      <div className="mt-3 space-y-2">
        {tenure.buckets.map((b) => (
          <div key={b.label} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-2 text-sm">
            <span className="text-brand-black dark:text-slate-200">{b.label}</span>
            <span className="relative h-5 rounded bg-brand-cloudDancer/70 dark:bg-white/5" title={`${b.count} people · ${b.pilots} pilots`}>
              <span className="absolute inset-y-0 left-0 rounded bg-brand-eden/60 dark:bg-slate-500" style={{ width: `${(b.count / most) * 100}%` }} />
              <span className="absolute inset-y-0 left-0 rounded bg-brand-lea dark:bg-brand-sweet" style={{ width: `${(b.pilots / most) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums text-brand-lea dark:text-slate-100">{b.count}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-brand-grey dark:text-slate-400">Dark part of each bar: pilots.</p>
    </section>
  );
}
