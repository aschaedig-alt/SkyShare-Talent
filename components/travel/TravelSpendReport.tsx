"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { ChevronDown, ChevronUp, ChevronsUpDown, Download } from "lucide-react";
import { TravelSpendYear } from "@/components/travel/TravelSpendYear";
import { CANDIDATE_DEPARTMENTS, type CandidateDepartmentKey } from "@/lib/candidates/departments";
import {
  TRAVEL_PURPOSES,
  formatUsd,
  travelPurposeLabel,
  travelStatusLabel,
  travelTabHref
} from "@/lib/travel/constants";
import {
  MONTH_LABELS,
  MONTH_NAMES,
  SPEND_OUTCOME_LABELS,
  buildTravelSpendByMonth,
  spendDepartmentLabel,
  spendOutcome,
  spendPeriodLabel,
  type TravelSpendOutcome,
  type TravelSpendRow
} from "@/lib/travel/spend";

/**
 * The Reports travel tab, rebuilt as ONE executive report (feedback, Sep 11).
 *
 * WHO IT IS FOR, which is what changed the design: the President, deciding
 * whether too much is being spent bringing people in, whether orientation
 * should be remote, and what hiring somebody really costs — and hiring managers
 * weighing a raise against a new hire. Her words: "I just want to make sure that
 * this shows the way an executive would want to view travel spend reporting
 * info."
 *
 * WHAT IT REPLACED: the year chart with its four tiles, and under it a second
 * panel whose four tiles repeated the first four and whose purpose list could
 * not be sorted or cut by department. Now there is one set of tiles, and ONE
 * slice: the filter row at the top (year, month, department, hired or not,
 * purpose) scopes everything below it — the chart, the tiles, both breakdowns
 * and the trip table — so no two numbers on the tab can disagree about what
 * they are counting.
 *
 * Two deliberate exceptions to "the filter scopes everything":
 *   - the chart always draws the whole YEAR, with the chosen month highlighted,
 *     because it is also the control for choosing a month; and
 *   - each breakdown ignores its OWN dimension (the purpose list ignores the
 *     purpose filter, the department list the department filter). Otherwise
 *     choosing Flight Ops would shrink the department list to one line reading
 *     100%, and the other departments — the comparison — would vanish.
 *
 * DEFAULTS, all chosen to open on the question most often asked:
 *   - year: the most recent year with travel (not read off the clock, the same
 *     choice TravelSpendYear makes, so a January with no trips yet does not
 *     open on an empty chart);
 *   - month: none — the whole year, until somebody clicks a month;
 *   - department, hired or not, purpose: all;
 *   - table order: cost, highest first — "where did the money go" is the first
 *     thing anybody reading spend asks. Every column sorts.
 *
 * PRIVATE. Travel spend is for HR and the executive team only. This renders
 * inside /reports behind its module check and is handed rows by
 * getTravelSpendReport; nothing here widens who can see it, and the CSV is built
 * in the browser from rows already on the page, so it reaches nobody the page
 * did not.
 *
 * STILL A FLOOR, and still saying so: some booked items carry no cost, and some
 * trips have no dates so their month is estimated. TravelSpendYear states both
 * for the period on screen, and the table marks the rows they apply to.
 */

type OutcomeFilter = "ALL" | TravelSpendOutcome;
type SortKey = "traveler" | "department" | "purpose" | "outcome" | "month" | "cost";
type SortState = { key: SortKey; dir: "asc" | "desc" };

const OUTCOME_ORDER: Record<TravelSpendOutcome, number> = { hired: 0, notHired: 1, none: 2 };

/** The direction a column sorts in on its FIRST click: money and nothing else
 *  starts highest-first. Names, labels and months read naturally A to Z and
 *  January to December. */
const FIRST_DIR: Record<SortKey, "asc" | "desc"> = {
  traveler: "asc",
  department: "asc",
  purpose: "asc",
  outcome: "asc",
  month: "asc",
  cost: "desc"
};

const selectClass =
  "rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-sm text-brand-lea outline-none transition hover:shadow-glow focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100 dark:[color-scheme:dark]";

const OUTCOME_CHIP: Record<TravelSpendOutcome, string> = {
  hired: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  notHired: "bg-amber-400/20 text-amber-700 dark:text-amber-300",
  none: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400"
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function compareRows(a: TravelSpendRow, b: TravelSpendRow, key: SortKey): number {
  switch (key) {
    case "traveler":
      return a.travelerName.localeCompare(b.travelerName);
    case "department":
      return spendDepartmentLabel(a.department).localeCompare(spendDepartmentLabel(b.department));
    case "purpose":
      return travelPurposeLabel(a.purpose).localeCompare(travelPurposeLabel(b.purpose));
    case "outcome":
      return OUTCOME_ORDER[spendOutcome(a)] - OUTCOME_ORDER[spendOutcome(b)];
    case "month":
      return a.year * 12 + a.month - (b.year * 12 + b.month);
    case "cost":
      return a.total - b.total;
    default:
      return 0;
  }
}

/**
 * One CSV cell.
 *
 * Text that a spreadsheet would run as a FORMULA is kept as text — a traveller
 * name is typed by a person, and "=HYPERLINK(...)" in a CSV cell is a live
 * formula the moment it is opened. Numbers are exempt, or a negative amount (a
 * refund) would arrive as text and drop out of every SUM.
 */
function csvCell(value: string, numeric = false): string {
  const safe = !numeric && /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

type BreakdownLine = {
  key: string;
  label: string;
  trips: number;
  hired: number;
  notHired: number;
  none: number;
  total: number;
};

function breakdownOf(rows: TravelSpendRow[], keyOf: (r: TravelSpendRow) => string, labelOf: (key: string) => string): BreakdownLine[] {
  const byKey = new Map<string, BreakdownLine>();
  for (const r of rows) {
    const key = keyOf(r);
    const line = byKey.get(key) ?? { key, label: labelOf(key), trips: 0, hired: 0, notHired: 0, none: 0, total: 0 };
    const outcome = spendOutcome(r);
    if (outcome === "hired") line.hired += r.total;
    else if (outcome === "notHired") line.notHired += r.total;
    else line.none += r.total;
    line.total += r.total;
    line.trips += 1;
    byKey.set(key, line);
  }
  return [...byKey.values()].sort((a, b) => b.total - a.total || b.trips - a.trips || a.label.localeCompare(b.label));
}

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[10px] font-bold uppercase tracking-[0.14em] text-brand-grey dark:text-slate-400">
      {label}
      {children}
    </label>
  );
}

/**
 * A purpose or department list. Each line is a filter: click it and the whole
 * tab narrows to it; click it again to let go. Selected is navy + gold and hover
 * is the gold glow, per the locked design system; the lines are rectangles.
 *
 * The bar under each line is scaled to the WHOLE list, not to its biggest line,
 * because the lines are exclusive shares of one pool — every trip has exactly
 * one purpose and one department — so the bar can be read as the share it is.
 * It is split hired / not hired / no traveler in the chart's own three colors.
 */
function Breakdown({
  title,
  caption,
  lines,
  selected,
  onSelect,
  empty
}: {
  title: string;
  caption: ReactNode;
  lines: BreakdownLine[];
  selected: string | null;
  onSelect: (key: string | null) => void;
  empty: string;
}) {
  const whole = lines.reduce((s, l) => s + l.total, 0);
  const pct = (v: number) => (whole > 0 ? (v / whole) * 100 : 0);

  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">{title}</div>
      <p className="mt-1 text-[11px] leading-snug text-brand-grey dark:text-slate-400">{caption}</p>
      {lines.length === 0 ? (
        <p className="mt-2 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-3 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
          {empty}
        </p>
      ) : (
        <div className="mt-2 space-y-1.5">
          {lines.map((line) => {
            const active = selected === line.key;
            const dimmed = selected !== null && !active;
            return (
              <button
                key={line.key}
                type="button"
                aria-pressed={active}
                onClick={() => onSelect(active ? null : line.key)}
                title={active ? "Showing only this — click again for everything" : "Narrow the whole tab to this"}
                className={clsx(
                  "w-full rounded border p-2.5 text-left transition",
                  active
                    ? "border-brand-gold bg-brand-lea text-white shadow-glow"
                    : "border-brand-lea/10 bg-brand-cloudDancer/40 text-brand-lea hover:border-brand-gold/50 hover:shadow-glow dark:border-white/10 dark:bg-white/5 dark:text-slate-100",
                  dimmed && "opacity-60 hover:opacity-100"
                )}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 text-sm font-semibold">
                    {line.label}
                    <span className={clsx("ml-1.5 font-normal", active ? "text-white/70" : "text-brand-grey dark:text-slate-400")}>
                      · {plural(line.trips, "trip", "trips")}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatUsd(line.total)}
                    <span className={clsx("ml-1.5 text-[11px] font-normal", active ? "text-white/70" : "text-brand-grey dark:text-slate-400")}>
                      {Math.round(pct(line.total))}%
                    </span>
                  </span>
                </div>
                <div className={clsx("mt-2 flex h-1.5 w-full overflow-hidden rounded", active ? "bg-white/15" : "bg-brand-lea/5 dark:bg-white/10")}>
                  <div className="h-full bg-emerald-500" style={{ width: `${pct(line.hired)}%` }} />
                  <div className="h-full bg-amber-400" style={{ width: `${pct(line.notHired)}%` }} />
                  <div className="h-full bg-brand-eden/40" style={{ width: `${pct(line.none)}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
  align = "left"
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={clsx("px-3 py-2", align === "right" ? "text-right" : "text-left")}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={clsx(
          "inline-flex items-center gap-1 font-bold uppercase tracking-[0.14em] transition hover:text-brand-lea dark:hover:text-slate-200",
          active && "text-brand-lea dark:text-slate-100"
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-30" />
        )}
      </button>
    </th>
  );
}

export function TravelSpendReport({ trips }: { trips: TravelSpendRow[] }) {
  const years = useMemo(() => [...new Set(trips.map((t) => t.year))].sort((a, b) => a - b), [trips]);

  const [year, setYear] = useState<number | null>(years[years.length - 1] ?? null);
  const [month, setMonth] = useState<number | null>(null);
  const [department, setDepartment] = useState<CandidateDepartmentKey | null>(null);
  const [outcome, setOutcome] = useState<OutcomeFilter>("ALL");
  const [purpose, setPurpose] = useState<string | null>(null);
  const [sort, setSort] = useState<SortState>({ key: "cost", dir: "desc" });

  // Every non-period filter, with one dimension optionally left out — see the
  // "each breakdown ignores its OWN dimension" note at the top.
  const matches = (r: TravelSpendRow, skip?: "department" | "purpose") =>
    (skip === "department" || department === null || r.department === department) &&
    (skip === "purpose" || purpose === null || r.purpose === purpose) &&
    (outcome === "ALL" || spendOutcome(r) === outcome);
  const inPeriod = (r: TravelSpendRow) => r.year === year && (month === null || r.month === month);

  // The chart's series, rebuilt from the filtered rows with the SAME function the
  // server uses for the Travel page. `years` keeps every year present even when a
  // filter empties one, so the chart shows an honest empty year, not nothing.
  // Not memoized: this is a handful of trips a year, and a memo keyed on the
  // filters is one more place for the key list and the filter to drift apart.
  const chartData = buildTravelSpendByMonth(trips.filter((r) => matches(r)), { years });

  const tableRows = trips.filter((r) => inPeriod(r) && matches(r));
  const periodRows = trips.filter(inPeriod);
  const purposeLines = breakdownOf(
    trips.filter((r) => inPeriod(r) && matches(r, "purpose")),
    (r) => r.purpose,
    (key) => travelPurposeLabel(key)
  );
  const departmentRows = trips.filter((r) => inPeriod(r) && matches(r, "department"));
  const departmentLines = breakdownOf(
    departmentRows,
    (r) => r.department,
    (key) => spendDepartmentLabel(key as CandidateDepartmentKey)
  );
  const ambiguousTravelers = new Set(departmentRows.filter((r) => r.departmentAmbiguous).map((r) => r.travelerKey ?? r.tripId)).size;

  const sorted = [...tableRows].sort((a, b) => {
    const primary = compareRows(a, b, sort.key) * (sort.dir === "asc" ? 1 : -1);
    // Ties fall back to the default order, so the table never shuffles
    // between renders.
    return primary || b.total - a.total || a.travelerName.localeCompare(b.travelerName);
  });
  const shownTotal = tableRows.reduce((s, r) => s + r.total, 0);
  const periodTotal = periodRows.reduce((s, r) => s + r.total, 0);

  // Options come from the data — a department nobody travelled for is noise in
  // a select — except purposes, which list every purpose there is so the new
  // Indoc & orientation line can be picked before a single trip is recoded.
  const departmentOptions = useMemo(() => {
    const present = new Set(trips.map((t) => t.department));
    return CANDIDATE_DEPARTMENTS.filter((d) => present.has(d.key));
  }, [trips]);
  const purposeOptions = useMemo(() => {
    const listed = new Set<string>(TRAVEL_PURPOSES.map((p) => p.value));
    const extra = [...new Set(trips.map((t) => t.purpose))].filter((p) => !listed.has(p));
    return [
      ...TRAVEL_PURPOSES.map((p) => ({ value: p.value as string, label: p.label as string })),
      ...extra.map((p) => ({ value: p, label: travelPurposeLabel(p) }))
    ];
  }, [trips]);
  const hasUnassigned = trips.some((t) => spendOutcome(t) === "none");
  // Trips per month of the chosen year, within the filters — shown in the month
  // picker so an empty month is visible before it is picked.
  const monthTrips = Array.from({ length: 12 }, () => 0);
  for (const r of trips) if (r.year === year && matches(r)) monthTrips[r.month] += 1;

  if (year === null) {
    return (
      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Travel spend</p>
        <p className="mt-2 text-sm text-brand-grey dark:text-slate-400">
          No booked travel yet. Add trips from a candidate or new-hire profile and spend rolls up here.
        </p>
      </section>
    );
  }

  const periodLabel = spendPeriodLabel(year, month);
  const sliceParts = [
    department ? spendDepartmentLabel(department) : null,
    outcome !== "ALL" ? SPEND_OUTCOME_LABELS[outcome] : null,
    purpose ? travelPurposeLabel(purpose) : null
  ].filter((v): v is string => Boolean(v));
  const sliceNote = sliceParts.length ? `Filtered to ${sliceParts.join(" · ")}` : null;
  const anyFilter = month !== null || department !== null || outcome !== "ALL" || purpose !== null;

  function clearFilters() {
    setMonth(null);
    setDepartment(null);
    setOutcome("ALL");
    setPurpose(null);
  }

  function onSort(key: SortKey) {
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: FIRST_DIR[key] }));
  }

  // Exactly what the table is showing: the same rows, in the same order, the
  // same columns — plus the two markers the table carries on a row (an
  // estimated month, unpriced items) as columns of their own, since a mark in a
  // cell does not survive a spreadsheet. Numbers go out bare (1234.50, not
  // "$1,234.50") so the column sums. No total row: a total inside the data is
  // counted twice by the first SUM anybody runs over it.
  function downloadCsv() {
    const header = [
      "Traveler",
      "Route",
      "Status",
      "Department",
      "Purpose",
      "Hired or not",
      "Month",
      "Month estimated",
      "Cost (USD)",
      "Items with no cost"
    ];
    const lines = sorted.map((r) =>
      [
        csvCell(r.travelerName),
        csvCell(r.route ?? ""),
        csvCell(travelStatusLabel(r.status)),
        csvCell(spendDepartmentLabel(r.department)),
        csvCell(travelPurposeLabel(r.purpose)),
        csvCell(SPEND_OUTCOME_LABELS[spendOutcome(r)]),
        csvCell(`${MONTH_LABELS[r.month]} ${r.year}`),
        r.monthInferred ? "Yes" : "",
        csvCell(r.total.toFixed(2), true),
        String(r.itemsMissingCost)
      ].join(",")
    );
    const csv = [header.map((h) => csvCell(h)).join(","), ...lines].join("\r\n");
    // The byte-order mark is for Excel, which otherwise reads UTF-8 as Latin-1
    // and mangles the arrow in every route. Google Sheets ignores it.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    // The filename carries the slice, so three downloads made while comparing
    // departments do not all arrive as travel-spend (1), (2) and (3).
    const outcomeSlug: Record<TravelSpendOutcome, string> = { hired: "hired", notHired: "not-hired", none: "no-traveler" };
    const slug = [
      "travel-spend",
      String(year),
      month !== null ? String(month + 1).padStart(2, "0") : null,
      department,
      outcome !== "ALL" ? outcomeSlug[outcome] : null,
      purpose ? purpose.toLowerCase() : null
    ]
      .filter(Boolean)
      .join("-")
      .replace(/_/g, "-");
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Not in the same tick as the click: Firefox and Safari can cancel a download
    // whose object URL is revoked before they have started reading it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="space-y-4">
      {/* ONE filter row, above everything it scopes. */}
      <section className="rounded bg-white p-4 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Year">
            <select
              value={year}
              onChange={(e) => {
                setYear(Number(e.target.value));
                // A month belongs to a year: keeping "September" while the year
                // changes would silently show a different September.
                setMonth(null);
              }}
              className={selectClass}
            >
              {[...years].reverse().map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </FilterField>
          {/* The same state the chart's month buttons set — a click on a bar
              and a pick here are one choice, shown in two places. */}
          <FilterField label="Month">
            <select
              value={month === null ? "" : String(month)}
              onChange={(e) => setMonth(e.target.value === "" ? null : Number(e.target.value))}
              className={selectClass}
            >
              <option value="">Whole year</option>
              {MONTH_NAMES.map((name, i) => (
                <option key={name} value={i}>
                  {monthTrips[i] ? `${name} · ${plural(monthTrips[i], "trip", "trips")}` : name}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Department">
            <select
              value={department ?? ""}
              onChange={(e) => setDepartment(e.target.value === "" ? null : (e.target.value as CandidateDepartmentKey))}
              className={selectClass}
            >
              <option value="">All departments</option>
              {departmentOptions.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Hired or not">
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as OutcomeFilter)} className={selectClass}>
              <option value="ALL">Hired and not hired</option>
              <option value="hired">Hired</option>
              <option value="notHired">Not hired</option>
              {hasUnassigned ? <option value="none">No traveler on the trip</option> : null}
            </select>
          </FilterField>
          <FilterField label="Purpose">
            <select value={purpose ?? ""} onChange={(e) => setPurpose(e.target.value === "" ? null : e.target.value)} className={selectClass}>
              <option value="">All purposes</option>
              {purposeOptions.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </FilterField>
          {anyFilter ? (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:border-brand-gold/50 hover:shadow-glow dark:border-white/10 dark:text-slate-200"
            >
              Clear filters
            </button>
          ) : null}
          {/* A real link: it changes the whole screen, so it is ctrl-clickable
              into a new tab like every other way off this page. */}
          <Link
            href="/travel"
            className="ml-auto self-center text-[12px] font-semibold text-brand-eden transition hover:text-brand-lea dark:text-brand-edenOnDark dark:hover:text-slate-100"
          >
            Open the Travel hub &rarr;
          </Link>
        </div>
      </section>

      <TravelSpendYear
        data={chartData}
        year={year}
        month={month}
        onYearChange={(y) => {
          setYear(y);
          setMonth(null);
        }}
        onMonthChange={setMonth}
        sliceNote={sliceNote}
      />

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Where it went</p>
        <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">{periodLabel}, by purpose and by department</h2>
        <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
          Click a line to narrow the whole tab to it — chart, tiles and table — and click it again to let go.
        </p>

        <div className="mt-4 grid gap-5 lg:grid-cols-2">
          <Breakdown
            title="By purpose"
            caption={
              // Her billing rule, said where the numbers are (feedback, Sep 11):
              // "If it's just an orientation cost, it's on the HR side. If it's an
              // in-dock cost, that's on the pilot hiring side".
              <>
                Orientation-only costs sit with HR and indoc costs with pilot hiring, so a trip that covered both is its
                own line, <span className="font-semibold text-brand-lea dark:text-slate-200">Indoc &amp; orientation</span>
                , and is never counted as either.
              </>
            }
            lines={purposeLines}
            selected={purpose}
            onSelect={setPurpose}
            empty={`No trips in ${periodLabel}${sliceParts.length ? " with these filters" : ""}.`}
          />
          <Breakdown
            title="By department"
            caption={
              <>
                The department they were hired into; for a candidate, the department of the job they applied to.
                {ambiguousTravelers > 0
                  ? ` ${plural(ambiguousTravelers, "traveler", "travelers")} applied to more than one department with no hire to settle it, and ${ambiguousTravelers === 1 ? "is" : "are"} counted under the first.`
                  : ""}
              </>
            }
            lines={departmentLines}
            selected={department}
            onSelect={(key) => setDepartment(key as CandidateDepartmentKey | null)}
            empty={`No trips in ${periodLabel}${sliceParts.length ? " with these filters" : ""}.`}
          />
        </div>
      </section>

      <section className="rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Every trip</p>
            <h2 className="text-xl font-semibold text-brand-lea dark:text-slate-100">
              {plural(tableRows.length, "trip", "trips")} in {periodLabel}
            </h2>
            {sliceNote ? <p className="mt-0.5 text-sm text-brand-grey dark:text-slate-400">{sliceNote}.</p> : null}
          </div>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={sorted.length === 0}
            className="inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-1.5 text-sm font-semibold text-brand-lea transition hover:border-brand-gold/50 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50 print:hidden dark:border-white/10 dark:text-slate-200"
            title="Downloads exactly the rows below, in this order"
          >
            <Download className="h-4 w-4" /> Download CSV
          </button>
        </div>

        {/* Wide on purpose: six columns do not fit a phone, so below ~760px the
            TABLE scrolls sideways — the last rung of the scrollbar ladder — and
            the page keeps the only vertical scrollbar. overflow-y is pinned
            because setting x alone computes y to auto. No height cap: the
            table grows with the trips and the page scrolls. */}
        <div className="mt-3 overflow-x-auto overflow-y-hidden">
          <table className="w-full min-w-[760px] border-collapse text-left text-sm">
            <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.14em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
              <tr>
                <SortableTh label="Traveler" sortKey="traveler" sort={sort} onSort={onSort} />
                <SortableTh label="Department" sortKey="department" sort={sort} onSort={onSort} />
                <SortableTh label="Purpose" sortKey="purpose" sort={sort} onSort={onSort} />
                <SortableTh label="Hired or not" sortKey="outcome" sort={sort} onSort={onSort} />
                <SortableTh label="Month" sortKey="month" sort={sort} onSort={onSort} />
                <SortableTh label="Cost" sortKey="cost" sort={sort} onSort={onSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-sm text-brand-grey dark:text-slate-400">
                    {periodRows.length === 0 ? `No trips in ${periodLabel}.` : "No trips match these filters."}
                  </td>
                </tr>
              ) : (
                sorted.map((r) => {
                  const rowOutcome = spendOutcome(r);
                  return (
                    <tr key={r.tripId} className="row-wash">
                      <td className="px-3 py-2">
                        {/* Straight to THIS trip on their own Travel tab — the
                            individual detail she said is good to reach from
                            here. A real link, so it opens in a new tab too. */}
                        {r.travelerHref ? (
                          <Link
                            href={travelTabHref(r.travelerHref, r.tripId)}
                            title={`Open this trip on ${r.travelerName}'s Travel tab`}
                            className="font-semibold text-brand-lea transition hover:text-brand-eden hover:drop-shadow-[0_0_6px_rgba(234,170,0,0.5)] dark:text-slate-100 dark:hover:text-brand-edenOnDark"
                          >
                            {r.travelerName}
                          </Link>
                        ) : (
                          <span className="font-semibold text-brand-grey dark:text-slate-400">{r.travelerName}</span>
                        )}
                        <div className="text-[11px] text-brand-grey dark:text-slate-400">
                          {r.route ?? "Route not set"} · {travelStatusLabel(r.status)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-brand-black/80 dark:text-slate-300">
                        {spendDepartmentLabel(r.department)}
                        {r.departmentAmbiguous ? (
                          <span
                            className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-500"
                            title="Applied to more than one department and no hire record says which — counted under the first"
                          >
                            (first of several)
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-brand-black/80 dark:text-slate-300">{travelPurposeLabel(r.purpose)}</td>
                      <td className="px-3 py-2">
                        <span className={clsx("rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", OUTCOME_CHIP[rowOutcome])}>
                          {SPEND_OUTCOME_LABELS[rowOutcome]}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-brand-black/80 dark:text-slate-300">
                        {MONTH_LABELS[r.month]} {r.year}
                        {r.monthInferred ? (
                          <span
                            className="ml-1.5 rounded bg-brand-cloudDancer px-1 py-px text-[10px] font-semibold text-brand-grey dark:bg-white/10 dark:text-slate-400"
                            title="This trip has no travel dates of its own, so its month comes from its first booking or, failing that, the day it was logged."
                          >
                            est.
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-brand-lea dark:text-slate-100">
                        {formatUsd(r.total)}
                        {r.itemsMissingCost > 0 ? (
                          <div
                            className="text-[10px] font-normal text-brand-grey dark:text-slate-400"
                            title="Booked items on this trip with no amount recorded — this cost is a floor"
                          >
                            + {plural(r.itemsMissingCost, "item", "items")} unpriced
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {sorted.length > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-brand-lea/15 bg-brand-cloudDancer/40 dark:border-white/10 dark:bg-white/5">
                  <td colSpan={5} className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-brand-grey dark:text-slate-400">
                    {plural(sorted.length, "trip", "trips")} shown · total
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-brand-lea dark:text-slate-100">
                    {formatUsd(shownTotal)}
                    {/* The share of the period this slice is — "Flight Ops was 44%
                        of the year" is the sentence the filter is usually asked
                        to produce. */}
                    {sliceNote && periodTotal > 0 ? (
                      <div className="text-[10px] font-normal text-brand-grey dark:text-slate-400">
                        {Math.round((shownTotal / periodTotal) * 100)}% of {formatUsd(periodTotal)} in {periodLabel}
                      </div>
                    ) : null}
                  </td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>
      </section>
    </div>
  );
}
