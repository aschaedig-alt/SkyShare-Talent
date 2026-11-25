import type { TurnoverDepartment } from "@/lib/reports/turnover-departments";

// Rolling 12-month turnover, the arithmetic only. Client-safe: no Prisma.
//
// The loader (lib/data/rolling-turnover.ts) counts each month once - month-end
// headcount, exits, and exits to leave out - from the start of Journey's history to
// today. Everything rolling is worked out from those counts, here, so the Turnover
// report can move its window to any month (his ask, 2026-11-24: "filter it by month
// and year like in the example link", the Turnover Manager Dashboard's Month and Year
// pickers) without going back to the server, and At a glance shows the same numbers.

export type MonthCell = { head: number; exits: number; exitsLeftOut: number };

export type TurnoverMonth = {
  /** YYYY-MM */
  key: string;
  /** "Dec '25", for chart axes. */
  label: string;
  /** "December 2025" */
  long: string;
};

export type TurnoverHistory = {
  /** Today, YYYY-MM-DD: the last month ends here. */
  asOf: string;
  /** Oldest first; the last is this month. */
  months: TurnoverMonth[];
  company: MonthCell[];
  departments: Array<{ name: TurnoverDepartment; cells: MonthCell[] }>;
  /** People Journey could not place in a department (the dashboard's N/A, never charted). */
  unplaced: MonthCell[];
};

export type TurnoverSeries = {
  /** Rolling turnover at each of the 12 points, in percent, one decimal. */
  rate: number[];
  /** The same, leaving out layoffs, moves, retirement and business-caused exits. */
  leaveOut: number[];
  /** Average month-end headcount behind each point. */
  heads: number[];
  /** Exits in the 12 months up to the last point. */
  exits: number;
  exitsLeftOut: number;
  /** Average month-end headcount over the 12 months up to the last point. */
  avgHeadcount: number;
};

/** One window ending at a month: the shape the report and At a glance draw. */
export type RollingTurnover = {
  asOf: string;
  /** True when the window ends this month, which ends today. */
  endsToday: boolean;
  points: TurnoverMonth[];
  company: TurnoverSeries;
  departments: Array<{ name: TurnoverDepartment; series: TurnoverSeries }>;
  unplaced: { avgHeadcount: number; exits: number };
};

export const WINDOW = 12;
/** Points on a chart: the 12 rolling values ending at the chosen month, as the dashboard draws them. */
export const POINTS = 12;
/** The first month a chart can end on: its first point needs 12 months behind it. */
export const FIRST_END = WINDOW - 1 + (POINTS - 1);

const round1 = (n: number) => Math.round(n * 10) / 10;

/** The 12 rolling points ending at month index `end`. */
export function seriesAt(cells: MonthCell[], end: number): TurnoverSeries {
  const at = (i: number) => {
    const w = cells.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const avg = w.reduce((s, c) => s + c.head, 0) / WINDOW;
    const exits = w.reduce((s, c) => s + c.exits, 0);
    const leftOut = w.reduce((s, c) => s + c.exitsLeftOut, 0);
    return { avg, exits, leftOut };
  };
  const rate: number[] = [];
  const leaveOut: number[] = [];
  const heads: number[] = [];
  for (let i = end - POINTS + 1; i <= end; i++) {
    const w = at(i);
    rate.push(w.avg ? round1((w.exits / w.avg) * 100) : 0);
    leaveOut.push(w.avg ? round1(((w.exits - w.leftOut) / w.avg) * 100) : 0);
    heads.push(round1(w.avg));
  }
  const last = at(end);
  return { rate, leaveOut, heads, exits: last.exits, exitsLeftOut: last.leftOut, avgHeadcount: round1(last.avg) };
}

/** The window ending at month index `end`, clamped to the months there are. */
export function rollingAt(h: TurnoverHistory, end: number): RollingTurnover {
  const e = Math.min(Math.max(end, Math.min(FIRST_END, h.months.length - 1)), h.months.length - 1);
  const na = seriesAt(h.unplaced, e);
  return {
    asOf: h.asOf,
    endsToday: e === h.months.length - 1,
    points: h.months.slice(e - POINTS + 1, e + 1),
    company: seriesAt(h.company, e),
    departments: h.departments.map((d) => ({ name: d.name, series: seriesAt(d.cells, e) })),
    unplaced: { avgHeadcount: na.avgHeadcount, exits: na.exits }
  };
}
