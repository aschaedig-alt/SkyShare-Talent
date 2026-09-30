"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import { clsx } from "clsx";
import type { HeadcountHistory, HeadcountYear, SpanCount } from "@/lib/data/headcount-history";
import { EMPLOYMENT_TYPE_LABEL, rosterOf, type EmploymentType } from "@/lib/reports/headcount-roster";
import { R } from "@/components/reports/report-ui";

// The Reports "Headcount & Tenure" tab. Aimee's ask of 2026-09-29, in her words:
// "i want to be able to say 'in 2020 we had xx employees, xx of them were pilots,
// xx of those employees are still here.'" The navy strip is exactly that, for
// whichever year is picked - from the menu, a chart or a table.
//
// Built from components/reports/report-ui.ts, the Fleet Progression spec, and laid
// out the way Fleet Progression is: ONE panel - header and controls, the navy
// headline, two rows of four tiles, then boxed charts and tables. His rule, same
// day: match it exactly, no sizes of its own. The data and every definition
// behind it are in lib/data/headcount-history.ts.

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

const avg = (n: number) => n.toFixed(1);

/** More than half of a year's departures dated Dec 31: a yearly roster's "gone by next year". */
function yearEndDated(y: HeadcountYear): boolean {
  return y.left > 0 && y.leftOnDec31 * 2 > y.left;
}

const OTHER_TYPES: EmploymentType[] = ["DAY_RATE", "TEMP", "LEAVE", "INTERN"];

/** Day-rate, temp, on leave and intern together - a handful a year, one column. */
function otherTypes(counts: Record<EmploymentType | "notRecorded", number>): number {
  return OTHER_TYPES.reduce((s, t) => s + counts[t], 0);
}
function otherSpan(span: HeadcountYear["span"]): SpanCount {
  return {
    people: OTHER_TYPES.reduce((s, t) => s + span.byType[t].people, 0),
    average: Math.round(OTHER_TYPES.reduce((s, t) => s + span.byType[t].average, 0) * 10) / 10
  };
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
      <section className={R.panel}>
        <p className={R.eyebrow}>Headcount &amp; tenure</p>
        <p className={R.lede}>No employment dates are on file yet, so there is nothing to count.</p>
      </section>
    );
  }

  const index = years.findIndex((y) => y.year === sel.year);
  const step = (d: -1 | 1) => {
    const next = years[index + d];
    if (next) setSelected(next.year);
  };
  const when = sel.isToday ? "today" : `at the end of ${sel.year}`;
  const period = sel.isToday ? `${sel.year} so far` : String(sel.year);
  const other = otherTypes(sel.byType);

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div>
          <p className={R.eyebrow}>Headcount &amp; tenure</p>
          <h2 className={R.title}>Who was here, year by year</h2>
          <p className={R.lede}>
            Employees on staff at each year-end, how many were pilots, and how many are still here — and, across each year, how many different
            people worked here against how many were on staff at once. A <span className={R.term}>contractor</span> is counted apart, never as an
            employee.
          </p>
        </div>
        <div className={R.controls}>
          <div className={R.segmentGroup}>
            <button type="button" onClick={() => step(-1)} disabled={index <= 0} aria-label="Previous year" className={clsx(R.segment, R.segmentOff, "disabled:opacity-40")}>
              ‹
            </button>
            <button type="button" onClick={() => step(1)} disabled={index >= years.length - 1} aria-label="Next year" className={clsx(R.segment, R.segmentOff, "disabled:opacity-40")}>
              ›
            </button>
          </div>
          <select value={sel.year} onChange={(e) => setSelected(Number(e.target.value))} aria-label="Year" className={R.select}>
            {[...years].reverse().map((y) => (
              <option key={y.year} value={y.year}>
                {y.isToday ? `${y.year} · today` : `End of ${y.year}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Her sentence, filled in. Employees only: a contractor is not one of her
          "xx employees", and counting them in is what the first version got wrong. */}
      <div className={R.hero}>
        <div className={R.heroRow}>
          <span className={R.heroFigure}>{sel.employees}</span>
          <span className={R.heroText}>
            {sel.employees === 1 ? "employee" : "employees"} {when} — {sel.pilots} of them {sel.pilots === 1 ? "a pilot" : "pilots"}
            {!sel.isToday ? `, and ${sel.stillHere} of those ${sel.employees} still here today` : ""}
          </span>
        </div>
        <p className={R.heroSub}>
          {[
            !sel.isToday ? `${pct(sel.stillHere, sel.employees)} still here` : null,
            !sel.isToday ? `${sel.pilotsStillHere} of the ${sel.pilots} pilots` : null,
            sel.contractors ? `not counted: ${plural(sel.contractors, "contractor")}` : null,
            sel.roleUnknown ? `${sel.roleUnknown} with no role recorded` : null
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <div className={R.tiles}>
        {[
          { label: sel.isToday ? "Employees today" : `Employees, end of ${sel.year}`, value: String(sel.employees), sub: `${sel.joined} joined · ${sel.left} left that year` },
          { label: "Pilots", value: String(sel.pilots), sub: `${sel.others} in Support Roles${sel.roleUnknown ? ` · ${sel.roleUnknown} not recorded` : ""}` },
          {
            label: "Still here today",
            value: sel.isToday ? "—" : String(sel.stillHere),
            sub: sel.isToday ? "everybody, by definition" : `${pct(sel.stillHere, sel.employees)} of them · ${plural(sel.pilotsStillHere, "pilot")}`
          },
          { label: "Contractors", value: String(sel.contractors), sub: "on contract, not in the employee figures" }
        ].map((c) => (
          <div key={c.label} className={R.tile}>
            <div className={R.tileLabel}>{c.label}</div>
            <div className={R.tileValue}>{c.value}</div>
            <div className={R.tileSub}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div className={R.tiles}>
        {[
          {
            label: `Worked here during ${period}`,
            value: String(sel.span.employees.people),
            sub: `different people, each counted once${yearEndDated(sel) ? " †" : ""}`
          },
          { label: "On staff at once", value: avg(sel.span.employees.average), sub: `on average, every day of ${period}` },
          {
            label: "Full-time · part-time",
            value: `${sel.byType.FULL_TIME} · ${sel.byType.PART_TIME}`,
            sub: [other ? `${other} day-rate, temp or on leave` : null, sel.byType.notRecorded ? `${sel.byType.notRecorded} not recorded` : null, `${when}`]
              .filter(Boolean)
              .join(" · ")
          },
          { label: "Median tenure then", value: yrs(sel.medianTenureYears), sub: "employees' time at SkyShare that day" }
        ].map((c) => (
          <div key={c.label} className={R.tile}>
            <div className={R.tileLabel}>{c.label}</div>
            <div className={R.tileValue}>{c.value}</div>
            <div className={R.tileSub}>{c.sub}</div>
          </div>
        ))}
      </div>
      {yearEndDated(sel) ? (
        <p className={R.footnote}>
          † {sel.year} comes from a year-end staff list: it shows who was here on December 31, so somebody who joined and left between two lists is not
          in it at all. From 2022 the records carry real start and end dates, and the gap between these two numbers is the turnover.
        </p>
      ) : null}

      <div className={R.box}>
        <div className={R.sectionLabel}>Employees at each year-end</div>
        <div className="mt-2">
          <HeadcountChart years={years} selected={sel.year} onSelect={setSelected} />
        </div>
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>Across each year — on staff at once, by type, against different people</div>
        <div className="mt-2">
          <SpanChart years={years} selected={sel.year} onSelect={setSelected} />
        </div>
      </div>

      <div className="mt-5">
        <div className={R.sectionLabel}>Year by year, at each year-end</div>
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[860px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Year</th>
                <th className={clsx(R.th, "text-right")}>Employees</th>
                <th className={clsx(R.th, "text-right")}>Pilots</th>
                <th className={clsx(R.th, "text-right")}>Support Roles</th>
                <th className={clsx(R.th, "text-right")}>Role not recorded</th>
                <th className={clsx(R.th, "text-right")}>Joined</th>
                <th className={clsx(R.th, "text-right")}>Left</th>
                <th className={clsx(R.th, "text-right")}>Still here today</th>
                <th className={clsx(R.th, "text-right")}>Contractors</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {[...years].reverse().map((y) => (
                <tr key={y.year} className={clsx(R.tr, y.year === sel.year && "bg-brand-gold/10")}>
                  <td className={R.td}>
                    <YearButton y={y} selected={y.year === sel.year} onSelect={setSelected} />
                  </td>
                  <td className={clsx(R.num, "font-semibold text-brand-lea dark:text-slate-100")}>{y.employees}</td>
                  <td className={R.num}>{y.pilots}</td>
                  <td className={R.num}>{y.others}</td>
                  <td className={clsx(R.num, !y.roleUnknown && R.muted)}>{y.roleUnknown}</td>
                  <td className={R.num}>{y.joined}</td>
                  <td className={R.num}>
                    {y.left}
                    {yearEndDated(y) ? <span title="Most of these are dated Dec 31 - imported from yearly lists, so they left some time after that year's list"> †</span> : null}
                  </td>
                  <td className={R.num}>{y.isToday ? "—" : `${y.stillHere} (${pct(y.stillHere, y.employees)})`}</td>
                  <td className={clsx(R.num, !y.contractors && R.muted)}>{y.contractors}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5">
        <div className={R.sectionLabel}>Year by year, across the whole year — different people · on staff at once</div>
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[860px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Year</th>
                <th className={clsx(R.th, "text-right")}>Employees</th>
                <th className={clsx(R.th, "text-right")}>Full-time</th>
                <th className={clsx(R.th, "text-right")}>Part-time</th>
                <th className={clsx(R.th, "text-right")}>Day-rate, temp, leave</th>
                <th className={clsx(R.th, "text-right")}>Type not recorded</th>
                <th className={clsx(R.th, "text-right")}>Contractors</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {[...years].reverse().map((y) => (
                <tr key={y.year} className={clsx(R.tr, y.year === sel.year && "bg-brand-gold/10")}>
                  <td className={R.td}>
                    <YearButton y={y} selected={y.year === sel.year} onSelect={setSelected} />
                    {yearEndDated(y) ? <span className={R.muted} title="A year-end list: short stints between two lists are not in it"> †</span> : null}
                  </td>
                  <SpanCell c={y.span.employees} strong />
                  <SpanCell c={y.span.byType.FULL_TIME} />
                  <SpanCell c={y.span.byType.PART_TIME} />
                  <SpanCell c={otherSpan(y.span)} />
                  <SpanCell c={y.span.byType.notRecorded} />
                  <SpanCell c={y.span.contractors} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={clsx(R.box, "grid gap-6 lg:grid-cols-[1.1fr_1fr]")}>
        <TenureToday tenure={history.tenure} />
        <div>
          <div className={R.sectionLabel}>Longest serving today</div>
          <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
            {history.tenure.longest.map((p) => (
              <li key={p.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className="min-w-0">
                  <Link href={`/people/${p.id}`} className={R.link}>
                    {p.name}
                  </Link>
                  <span className={clsx("block truncate text-[11px]", R.muted)}>{p.role ?? "Role not recorded"}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold tabular-nums text-brand-lea dark:text-slate-100">{p.years.toFixed(1)} yr</span>
                  <span className={clsx("block text-[11px]", R.muted)}>since {monthYear(p.since)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="mt-5">
        <summary className={clsx(R.listTitle, "cursor-pointer marker:text-brand-gold")}>
          The {plural(sel.employees, "employee")}
          {sel.contractors ? ` and ${plural(sel.contractors, "contractor")}` : ""} {when}
        </summary>
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[620px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Name</th>
                <th className={R.th}>Role {sel.isToday ? "today" : "that day"}</th>
                <th className={R.th}>Type</th>
                <th className={clsx(R.th, "text-right")}>At SkyShare then</th>
                <th className={clsx(R.th, "text-right")}>Still here</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {rosterOf(history, sel.roster).map((p, i, all) => (
                <Fragment key={p.id}>
                  {/* Employees come first, then contractors under their own heading. */}
                  {p.contractor && !all[i - 1]?.contractor ? (
                    <tr className="bg-brand-cloudDancer/40 dark:bg-white/5">
                      <td colSpan={5} className={clsx(R.td, R.tileLabel)}>
                        Contractors — not counted as employees
                      </td>
                    </tr>
                  ) : null}
                  <tr className={R.tr}>
                    <td className={R.td}>
                      <Link href={`/people/${p.id}`} className={R.link}>
                        {p.name}
                      </Link>
                      {p.pilot ? <span className={clsx(R.chip, "ml-1.5")}>pilot</span> : null}
                    </td>
                    <td className={clsx(R.td, p.role ? "text-brand-black/80 dark:text-slate-300" : clsx("italic", R.muted))}>{p.role ?? "Not recorded"}</td>
                    <td className={clsx(R.td, R.muted)}>{p.contractor ? "Contractor" : p.type ? EMPLOYMENT_TYPE_LABEL[p.type] : "Not recorded"}</td>
                    <td className={R.num}>{yrs(p.tenureYears)}</td>
                    <td className={clsx(R.td, "text-right")}>{p.stillHere ? "Yes" : <span className={R.muted}>No</span>}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className={clsx(R.footnote, "mt-5")}>
        History on file starts in {history.firstYear}.
        {history.coverage.earliestPilotRole ? (
          <>
            {" "}
            No pilot role on file starts before {monthYear(history.coverage.earliestPilotRole)}, and {history.coverage.unknownBeforePilots} people on
            staff at a year-end before then have no role recorded — so pilot counts before {new Date(history.coverage.earliestPilotRole).getUTCFullYear()}{" "}
            are incomplete, not zero.
          </>
        ) : null}{" "}
        {history.coverage.undated ? `${history.coverage.undated} record${history.coverage.undated === 1 ? " has" : "s have"} no dates at all and cannot be placed in any year. ` : ""}
        Contractors come from the Employee Roster MASTER workbook&apos;s TYPE column (its lists run from 2018 to August 2024) and, for today, each
        person&apos;s status. Full-time and part-time come from the same lists, 2017 to August 2024: the 2010–2016 lists record salaried or hourly
        instead, and nothing records it after August 2024, so those people are &ldquo;not recorded&rdquo; rather than guessed; day-rate pilots are
        employees, as the workbook&apos;s own totals count them. 2018 to 2021 come from year-end lists (†). A missing role or date is added on the
        person&apos;s own page and counts here straight away.
      </p>
    </section>
  );
}

function YearButton({ y, selected, onSelect }: { y: HeadcountYear; selected: boolean; onSelect: (y: number) => void }) {
  return (
    <button type="button" onClick={() => onSelect(y.year)} aria-pressed={selected} className={clsx(R.link, "underline-offset-2 hover:underline")}>
      {y.isToday ? `${y.year} · today` : y.year}
    </button>
  );
}

function SpanCell({ c, strong = false }: { c: SpanCount; strong?: boolean }) {
  if (!c.people) return <td className={clsx(R.num, R.muted)}>—</td>;
  return (
    <td className={R.num}>
      <span className={strong ? "font-semibold text-brand-lea dark:text-slate-100" : undefined}>{c.people}</span>
      <span className={R.muted}> · {avg(c.average)}</span>
    </td>
  );
}

/** Hatched grey for "not recorded": missing data should look missing, and gold already means the selected year. */
function Hatch({ id }: { id: string }) {
  return (
    <pattern id={id} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="6" height="6" className="fill-slate-200 dark:fill-white/10" />
      <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2.5" className="stroke-slate-400 dark:stroke-white/35" />
    </pattern>
  );
}

const HATCH_SWATCH = { backgroundImage: "repeating-linear-gradient(45deg, rgb(148 163 184) 0 1.5px, transparent 1.5px 4px)" };

type Segment = { v: number; cls: string; fill?: string };

/** Bars over years, stacked, clickable; the shared frame of both charts below. Drawn to R.chart so its text renders at Fleet's size. */
function YearBars({
  years,
  selected,
  onSelect,
  label,
  segments,
  top,
  overlay,
  title,
  ariaLabel,
  defs
}: {
  years: HeadcountYear[];
  selected: number;
  onSelect: (y: number) => void;
  label: string;
  segments: (y: HeadcountYear) => Segment[];
  top: number;
  overlay: (ctx: { x: (i: number) => number; y: (v: number) => number }) => ReactNode;
  title: (y: HeadcountYear) => string;
  ariaLabel: (y: HeadcountYear) => string;
  defs?: ReactNode;
}) {
  const { W, H, padL, padR, padT, padB } = R.chart;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const stepY = top > 150 ? 50 : top > 60 ? 25 : top > 20 ? 10 : 5;
  const maxY = Math.max(stepY, Math.ceil(top / stepY) * stepY);
  const y = (v: number) => padT + plotH - (v / maxY) * plotH;
  const band = plotW / years.length;
  const barW = Math.min(30, band * 0.62);
  const cx = (i: number) => padL + i * band + band / 2;
  const labelEvery = years.length > 12 ? 2 : 1;
  return (
    <div className="w-full overflow-x-auto overflow-y-hidden">
      <svg viewBox={`0 0 ${W} ${H}`} className={R.chart.svg} role="img" aria-label={label}>
        <defs>{defs}</defs>
        {Array.from({ length: maxY / stepY + 1 }, (_, i) => i * stepY).map((v) => (
          <g key={v}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="currentColor" className={R.chart.gridLine} strokeWidth={1} />
            <text x={padL - 8} y={y(v) + 4} textAnchor="end" className={R.chart.axisText}>
              {v}
            </text>
          </g>
        ))}
        {years.map((yr, i) => {
          const isSel = yr.year === selected;
          let base = 0;
          return (
            <g
              key={yr.year}
              role="button"
              tabIndex={0}
              aria-label={ariaLabel(yr)}
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
              {segments(yr).map((s, k) => {
                const h = (s.v / maxY) * plotH;
                const dashed = s.cls === "contract";
                const rect = dashed ? (
                  s.v > 0 ? (
                    <rect
                      key={k}
                      x={cx(i) - barW / 2 + 0.75}
                      y={y(base + s.v) + 0.75}
                      width={barW - 1.5}
                      height={Math.max(0, h - 1.5)}
                      fill="none"
                      strokeWidth={1.5}
                      strokeDasharray="3 2"
                      className="stroke-brand-eden dark:stroke-slate-300"
                    />
                  ) : null
                ) : (
                  <rect key={k} x={cx(i) - barW / 2} y={y(base + s.v)} width={barW} height={Math.max(0, h)} className={s.cls} fill={s.fill} />
                );
                base += s.v;
                return rect;
              })}
              <title>{title(yr)}</title>
              {(i % labelEvery === 0 || isSel || i === years.length - 1) && (
                <text
                  x={cx(i)}
                  y={H - 10}
                  textAnchor="middle"
                  className={clsx("text-[11px]", isSel ? "fill-brand-lea font-bold dark:fill-brand-gold" : "fill-brand-grey dark:fill-slate-400")}
                >
                  {yr.year}
                </text>
              )}
            </g>
          );
        })}
        {overlay({ x: cx, y })}
      </svg>
    </div>
  );
}

/**
 * Employees at each year-end, stacked pilots / Support Roles / role not recorded,
 * with that year's contractors on top in dashed outline - visible without reading as
 * staff. The gold line is how many of that year's employees are still here today.
 */
function HeadcountChart({ years, selected, onSelect }: { years: HeadcountYear[]; selected: number; onSelect: (y: number) => void }) {
  return (
    <>
      <YearBars
        years={years}
        selected={selected}
        onSelect={onSelect}
        label="Employees at each year-end, split into pilots, Support Roles and role not recorded, with that year's contractors on top in outline and how many of the employees are still here today"
        defs={<Hatch id="hc-unknown" />}
        top={Math.max(1, ...years.map((y) => y.employees + y.contractors))}
        segments={(yr) => [
          { v: yr.pilots, cls: "fill-brand-lea dark:fill-brand-sweet" },
          { v: yr.others, cls: "fill-brand-eden/70 dark:fill-slate-500" },
          { v: yr.roleUnknown, cls: "", fill: "url(#hc-unknown)" },
          { v: yr.contractors, cls: "contract" }
        ]}
        ariaLabel={(yr) => `${yr.year}: ${yr.employees} employees, ${yr.pilots} pilots, ${yr.stillHere} still here today, plus ${yr.contractors} contractors`}
        title={(yr) =>
          `${yr.isToday ? `${yr.year} (today)` : `End of ${yr.year}`}: ${yr.employees} employees - ${yr.pilots} pilots, ${yr.others} in Support Roles${yr.roleUnknown ? `, ${yr.roleUnknown} not recorded` : ""}. ${yr.stillHere} still here today.${yr.contractors ? ` Plus ${yr.contractors} contractor${yr.contractors === 1 ? "" : "s"}, not counted.` : ""}`
        }
        overlay={({ x, y }) => (
          <>
            <polyline points={years.map((yr, i) => `${x(i)},${y(yr.stillHere)}`).join(" ")} fill="none" stroke="#eaaa00" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
            {years.map((yr, i) => (
              <circle key={yr.year} cx={x(i)} cy={y(yr.stillHere)} r={yr.year === selected ? 4.5 : 3} fill="#eaaa00" pointerEvents="none" />
            ))}
          </>
        )}
      />
      <div className={R.legend}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-brand-lea dark:bg-brand-sweet" /> Pilots
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-brand-eden/70 dark:bg-slate-500" /> Support Roles
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-slate-200 dark:bg-white/10" style={HATCH_SWATCH} /> Role not recorded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm border-[1.5px] border-dashed border-brand-eden dark:border-slate-300" /> Contractors, not counted
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-[#eaaa00]" /> Of the employees, still here today
        </span>
      </div>
    </>
  );
}

/**
 * Across each year: the bar is how many were on staff at once, averaged over every
 * day of it, stacked by type; the ring is how many DIFFERENT people were employees
 * at some point in it. His question, Sep 29: two people with four months each,
 * never together, are 2 people but not 2 on staff - the space between the ring and
 * the bar is that turnover.
 */
function SpanChart({ years, selected, onSelect }: { years: HeadcountYear[]; selected: number; onSelect: (y: number) => void }) {
  return (
    <>
      <YearBars
        years={years}
        selected={selected}
        onSelect={onSelect}
        label="Across each year: employees on staff at once, averaged over the year and split into full-time, part-time, other types and not recorded, contractors on top in outline, and a ring for how many different people were employees at some point in the year"
        defs={<Hatch id="hc-type-unknown" />}
        top={Math.max(1, ...years.map((y) => Math.max(y.span.employees.people, y.span.employees.average + y.span.contractors.average)))}
        segments={(yr) => [
          { v: yr.span.byType.FULL_TIME.average, cls: "fill-brand-lea dark:fill-brand-sweet" },
          { v: yr.span.byType.PART_TIME.average, cls: "fill-brand-eden/70 dark:fill-slate-500" },
          { v: otherSpan(yr.span).average, cls: "fill-brand-sweet dark:fill-slate-300" },
          { v: yr.span.byType.notRecorded.average, cls: "", fill: "url(#hc-type-unknown)" },
          { v: yr.span.contractors.average, cls: "contract" }
        ]}
        ariaLabel={(yr) => `${yr.year}: ${avg(yr.span.employees.average)} on staff at once on average, ${yr.span.employees.people} different people`}
        title={(yr) =>
          `${yr.isToday ? `${yr.year} so far` : yr.year}: ${yr.span.employees.people} different people worked here; on average ${avg(yr.span.employees.average)} on staff at once - full-time ${avg(yr.span.byType.FULL_TIME.average)}, part-time ${avg(yr.span.byType.PART_TIME.average)}, other ${avg(otherSpan(yr.span).average)}, not recorded ${avg(yr.span.byType.notRecorded.average)}.${yr.span.contractors.people ? ` Contractors: ${yr.span.contractors.people}, ${avg(yr.span.contractors.average)} on average.` : ""}`
        }
        overlay={({ x, y }) =>
          years.map((yr, i) => (
            <circle
              key={yr.year}
              cx={x(i)}
              cy={y(yr.span.employees.people)}
              r={yr.year === selected ? 4.5 : 3.5}
              fill="none"
              stroke="#eaaa00"
              strokeWidth={2}
              pointerEvents="none"
            />
          ))
        }
      />
      <div className={R.legend}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-brand-lea dark:bg-brand-sweet" /> Full-time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-brand-eden/70 dark:bg-slate-500" /> Part-time
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-brand-sweet dark:bg-slate-300" /> Day-rate, temp, leave
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm bg-slate-200 dark:bg-white/10" style={HATCH_SWATCH} /> Type not recorded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-3.5 rounded-sm border-[1.5px] border-dashed border-brand-eden dark:border-slate-300" /> Contractors
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-[#eaaa00]" /> Different people during the year
        </span>
      </div>
    </>
  );
}

function TenureToday({ tenure }: { tenure: HeadcountHistory["tenure"] }) {
  const most = Math.max(1, ...tenure.buckets.map((b) => b.count));
  return (
    <div>
      <div className={R.sectionLabel}>How long today&apos;s employees have been here</div>
      <p className={clsx(R.footnote, "mt-1")}>
        Median {yrs(tenure.medianYears)} · average {yrs(tenure.averageYears)}. A return within three months continues the time; a longer gap starts it
        again. Dark part of each bar: pilots.
      </p>
      <div className="mt-3 space-y-2">
        {tenure.buckets.map((b) => (
          <div key={b.label} className="grid grid-cols-[8.5rem_1fr_3.5rem] items-center gap-2 text-sm">
            <span className="text-brand-black/80 dark:text-slate-300">{b.label}</span>
            <span className="relative h-5 rounded bg-brand-cloudDancer/70 dark:bg-white/5" title={`${b.count} people · ${b.pilots} pilots`}>
              <span className="absolute inset-y-0 left-0 rounded bg-brand-eden/60 dark:bg-slate-500" style={{ width: `${(b.count / most) * 100}%` }} />
              <span className="absolute inset-y-0 left-0 rounded bg-brand-lea dark:bg-brand-sweet" style={{ width: `${(b.pilots / most) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums text-brand-lea dark:text-slate-100">{b.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
