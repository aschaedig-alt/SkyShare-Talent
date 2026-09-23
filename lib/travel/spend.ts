// Travel spend as rows, and as a year of months — the ONE aggregation behind
// both the Travel page's year chart and the Reports travel tab.
//
// PURE — no Prisma, no React — because the Reports tab re-aggregates in the
// BROWSER. Its filters (department, hired or not, purpose) change the chart, the
// four tiles and the trip table together, and the only way three views of one
// slice cannot disagree is for all three to be built from the same rows by the
// same function. The server calls it too (getTravelSpendByMonth in
// lib/data/travel.ts), so the Travel page's unfiltered chart and an unfiltered
// Reports chart are one computation rather than two that happen to match. The
// loading, and the "was this traveller hired" rule, stay server-side in
// lib/data/travel.ts; this file only ever sees the finished rows.

import { candidateDepartmentLabel, type CandidateDepartmentKey } from "@/lib/candidates/departments";

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

/** One non-canceled trip, as a line in the report. Built by lib/data/travel.ts. */
export type TravelSpendRow = {
  tripId: string;
  travelerName: string;
  /** Their own profile — /people/[id] or /candidates/[id] — or null for a trip attached to nobody. */
  travelerHref: string | null;
  travelerType: "newHire" | "candidate" | "unassigned";
  /** One key per PERSON, so a candidate fly-out and their later orientation
   *  trip count as one traveller. Null when nobody is attached. */
  travelerKey: string | null;
  /** travelerWasHired() in lib/data/travel.ts — the one definition of hired. */
  hired: boolean;
  /** Normalized: a retired value (INTERVIEW) arrives as its replacement. */
  purpose: string;
  /** Whose budget it lands on, in the recruiter's department vocabulary. */
  department: CandidateDepartmentKey;
  /** A candidate who applied to more than one department, with no hire record
   *  to say which — counted under the first, and marked so it is not hidden. */
  departmentAmbiguous: boolean;
  route: string | null;
  status: string;
  year: number;
  /** 0-11. */
  month: number;
  /** The trip has no travel dates of its own, so its month came from its
   *  first booking or, failing that, the day it was logged. */
  monthInferred: boolean;
  total: number;
  /** Booked items on this trip with no amount — its total is a floor. */
  itemsMissingCost: number;
};

/**
 * Which side of the split a trip's money lands on. "none" is a trip attached to
 * nobody: it is neither hired nor not-hired spend, and quietly filing it as
 * not-hired would inflate the number the President is reading this for.
 */
export type TravelSpendOutcome = "hired" | "notHired" | "none";

export function spendOutcome(row: Pick<TravelSpendRow, "hired" | "travelerType">): TravelSpendOutcome {
  if (row.hired) return "hired";
  return row.travelerType === "unassigned" ? "none" : "notHired";
}

export const SPEND_OUTCOME_LABELS: Record<TravelSpendOutcome, string> = {
  hired: "Hired",
  notHired: "Not hired",
  none: "No traveler"
};

export function spendDepartmentLabel(key: CandidateDepartmentKey): string {
  return candidateDepartmentLabel(key);
}

export type TravelSpendMonthPoint = {
  /** 0-11. */
  month: number;
  /** "Jan". */
  label: string;
  hired: number;
  notHired: number;
  /** Trips attached to neither a hire nor a candidate — neither side of the split. */
  unassigned: number;
  total: number;
  trips: number;
  /** Of those trips, how many landed in this month by a fallback date. */
  inferred: number;
  /** Distinct people on each side of the split in this month. */
  hiredTravelers: number;
  notHiredTravelers: number;
  /** Booked items this month with no amount, so this month's total is a floor. */
  itemsMissingCost: number;
};

export type TravelSpendYearSeries = {
  year: number;
  /** Always 12, January to December, zero-filled. */
  months: TravelSpendMonthPoint[];
  hired: number;
  notHired: number;
  unassigned: number;
  total: number;
  tripCount: number;
  hiredTravelers: number;
  notHiredTravelers: number;
  /** Trips with no travel dates of their own, placed by a fallback. */
  inferredTrips: number;
  /** Booked items carrying no amount, so every total above is a FLOOR. */
  itemsMissingCost: number;
};

export type TravelSpendByMonth = {
  /** Every year that has travel (plus any the caller asked for), oldest first. */
  years: TravelSpendYearSeries[];
};

type MonthAcc = Omit<TravelSpendMonthPoint, "hiredTravelers" | "notHiredTravelers"> & {
  hiredKeys: Set<string>;
  notHiredKeys: Set<string>;
};

/**
 * Travel spend by month, split hired vs not hired.
 *
 * `years` forces those years to exist, zero-filled, even when no row falls in
 * them. The Reports tab needs that: filter to a department with no travel in
 * the chosen year and the chart must show an honest empty year, not vanish.
 *
 * A traveller counted as hired anywhere in a period is counted on the hired side
 * only for that period — one person is never both.
 */
export function buildTravelSpendByMonth(rows: TravelSpendRow[], opts: { years?: number[] } = {}): TravelSpendByMonth {
  const byYear = new Map<number, { months: MonthAcc[]; hiredKeys: Set<string>; notHiredKeys: Set<string> }>();

  const yearAcc = (year: number) => {
    let acc = byYear.get(year);
    if (!acc) {
      acc = {
        months: MONTH_LABELS.map((label, month) => ({
          month,
          label,
          hired: 0,
          notHired: 0,
          unassigned: 0,
          total: 0,
          trips: 0,
          inferred: 0,
          itemsMissingCost: 0,
          hiredKeys: new Set<string>(),
          notHiredKeys: new Set<string>()
        })),
        hiredKeys: new Set<string>(),
        notHiredKeys: new Set<string>()
      };
      byYear.set(year, acc);
    }
    return acc;
  };

  for (const year of opts.years ?? []) yearAcc(year);

  for (const row of rows) {
    const acc = yearAcc(row.year);
    const point = acc.months[row.month];
    if (!point) continue;
    const outcome = spendOutcome(row);
    if (outcome === "hired") point.hired += row.total;
    else if (outcome === "notHired") point.notHired += row.total;
    else point.unassigned += row.total;
    point.total += row.total;
    point.trips += 1;
    if (row.monthInferred) point.inferred += 1;
    point.itemsMissingCost += row.itemsMissingCost;
    if (row.travelerKey) {
      (row.hired ? point.hiredKeys : point.notHiredKeys).add(row.travelerKey);
      (row.hired ? acc.hiredKeys : acc.notHiredKeys).add(row.travelerKey);
    }
  }

  const sum = (months: TravelSpendMonthPoint[], key: "hired" | "notHired" | "unassigned" | "total" | "trips" | "inferred" | "itemsMissingCost") =>
    months.reduce((s, m) => s + m[key], 0);

  const years: TravelSpendYearSeries[] = [...byYear.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, acc]) => {
      const months: TravelSpendMonthPoint[] = acc.months.map(({ hiredKeys, notHiredKeys, ...point }) => ({
        ...point,
        hiredTravelers: hiredKeys.size,
        notHiredTravelers: [...notHiredKeys].filter((k) => !hiredKeys.has(k)).length
      }));
      return {
        year,
        months,
        hired: sum(months, "hired"),
        notHired: sum(months, "notHired"),
        unassigned: sum(months, "unassigned"),
        total: sum(months, "total"),
        tripCount: sum(months, "trips"),
        // A traveler whose fly-out was not hired and whose later trip was (which
        // cannot happen today, but could) is counted on the hired side only.
        hiredTravelers: acc.hiredKeys.size,
        notHiredTravelers: [...acc.notHiredKeys].filter((k) => !acc.hiredKeys.has(k)).length,
        inferredTrips: sum(months, "inferred"),
        itemsMissingCost: sum(months, "itemsMissingCost")
      };
    });

  return { years };
}

/** "September 2026", or "2026" for the whole year. */
export function spendPeriodLabel(year: number, month: number | null): string {
  return month === null ? String(year) : `${MONTH_NAMES[month]} ${year}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export type MonthRank = {
  /** 1 = the highest-spend month of the year. */
  rank: number;
  /** Another month spent exactly the same, to the cent. */
  tied: boolean;
  /** How many months of the year had any spend at all — what the rank is out of. */
  of: number;
};

/**
 * Where one month stands in its year, for the tile that replaced "Biggest
 * month". She asked for it by name (feedback, Sep 11): "Maybe it would say
 * whether it's the biggest month or it's the second-biggest month."
 *
 * Ranked only among months that HAVE spend. Ranking an empty month "9th of 12"
 * would be a number about nothing, so a month with no spend has no rank (null)
 * and the tile says so in words instead. Compared in whole cents, because these
 * totals are sums of floats and two genuinely equal months should read as tied.
 */
export function monthRank(series: TravelSpendYearSeries, month: number): MonthRank | null {
  const cents = (v: number) => Math.round(v * 100);
  const target = series.months[month];
  if (!target || cents(target.total) <= 0) return null;
  const withSpend = series.months.filter((m) => cents(m.total) > 0);
  const above = withSpend.filter((m) => cents(m.total) > cents(target.total)).length;
  const tied = withSpend.some((m) => m.month !== month && cents(m.total) === cents(target.total));
  return { rank: above + 1, tied, of: withSpend.length };
}

/** "Highest month", "2nd-highest", "Tied 3rd-highest". */
export function monthRankLabel(r: MonthRank): string {
  if (r.rank === 1) return r.tied ? "Tied highest" : "Highest month";
  return `${r.tied ? "Tied " : ""}${ordinal(r.rank)}-highest`;
}
