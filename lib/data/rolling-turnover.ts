import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";
import { isTestTagged } from "@/lib/testdata/markers";
import { contractorOn, covers, periodsOf, type Placed } from "@/lib/data/headcount-history";
import { latestBatch, type ExitRow } from "@/lib/quality-of-hire/imports";
import { getSituationalMarks, periodKey } from "@/lib/quality-of-hire/situational";
import { EXIT_MATCH_DAYS } from "@/lib/quality-of-hire/report";
import { LAYOFF_REASONS, NOT_COUNTED_QUITS } from "@/lib/quality-of-hire/categories";
import { TURNOVER_DEPARTMENTS, turnoverDepartment, type TurnoverDepartment } from "@/lib/reports/turnover-departments";

// ROLLING 12-MONTH TURNOVER - the Turnover Manager Dashboard's measure, from Journey.
//
// For each month: everyone who left in the 12 months up to that month, divided by
// the average month-end headcount over those same 12 months. The current month ends
// today. He asked for these charts on Reports on 2026-11-24, from the dashboard he
// built in May 2026 out of Paycom exports.
//
// Who counts is exactly Headcount & tenure's rule (periodsOf, contractorOn): employees
// only, contractors on the day left out, test records left out, canceled hires (no
// starts) left out. An exit is the end of an employment period, so a rehire who
// leaves twice counts twice - the same as the dashboard's terminations file.
//
// "Leave out" is Hire quality's Not counted rule: layoffs, moving, retirement (the
// Paycom reason on the matching exit row, matched within EXIT_MATCH_DAYS as Hire
// quality does), and any exit marked as caused by the business.

export type TurnoverSeries = {
  /** Rolling turnover at each point, in percent, one decimal. */
  rate: number[];
  /** The same, leaving out layoffs, moves, retirement and business-caused exits. */
  leaveOut: number[];
  /** Exits in the 12 months up to the last point. */
  exits: number;
  exitsLeftOut: number;
  /** Average month-end headcount over the 12 months up to the last point. */
  avgHeadcount: number;
};

export type RollingTurnover = {
  /** Today, YYYY-MM-DD: the last point's month ends here. */
  asOf: string;
  points: Array<{ key: string; label: string; long: string }>;
  company: TurnoverSeries;
  departments: Array<{ name: TurnoverDepartment; series: TurnoverSeries }>;
  /** People Journey could not place in a department (the dashboard's N/A, which it never charts). */
  unplaced: { avgHeadcount: number; exits: number };
};

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

type Cell = { head: number; exits: number; exitsLeftOut: number };
type Role = { title: string; startDate: Date; endDate: Date | null };

/** The title on a day: the role covering it (latest start wins), else the last one begun before it. */
function titleOn(roles: Role[], d: Date): string | null {
  let best: Role | null = null;
  for (const r of roles) if (covers({ start: r.startDate, end: r.endDate }, d) && (!best || r.startDate > best.startDate)) best = r;
  if (best) return best.title;
  const before = roles.filter((r) => dayOf(r.startDate) <= dayOf(d)).sort((a, b) => b.startDate.getTime() - a.startDate.getTime());
  return (before[0] ?? roles[0])?.title ?? null;
}

/**
 * Today's calendar day at the office, as a UTC-midnight number (how date-only fields
 * are stored). Not dayOf(now): after 6pm Mountain the UTC date is already tomorrow.
 */
function officeToday(now: Date): number {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  return Date.UTC(y, m - 1, d);
}

export async function getRollingTurnover(now: Date = new Date(), pointCount = 12): Promise<RollingTurnover> {
  const today = officeToday(now);
  const t = new Date(today);
  // pointCount rolling points need 11 more months of headcount behind the first.
  const span = pointCount + 11;
  const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - (span - 1), 1));
  const months = Array.from({ length: span }, (_, i) => {
    const y = first.getUTCFullYear();
    const m = first.getUTCMonth() + i;
    const start = Date.UTC(y, m, 1);
    const end = Math.min(Date.UTC(y, m + 1, 0), today);
    const d = new Date(start);
    return { start, end, isToday: end === today, key: iso(start).slice(0, 7), label: MONTHS[d.getUTCMonth()], long: `${LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  });

  const [rows, terminations, termTypes, situational] = await Promise.all([
    prisma.newHire.findMany({
      where: { canceled: false },
      select: {
        id: true,
        tags: true,
        department: true,
        startDate: true,
        terminationDate: true,
        employmentStatus: true,
        employmentStints: { select: { startDate: true, endDate: true } },
        roleAssignments: { select: { title: true, startDate: true, endDate: true } },
        contractPeriods: { select: { startDate: true, endDate: true } }
      }
    }),
    latestBatch<ExitRow>("terminations"),
    latestBatch<ExitRow>("termTypes"),
    getSituationalMarks()
  ]);

  const exitRows = new Map<string, ExitRow[]>();
  for (const r of [...(terminations?.rows ?? []), ...(termTypes?.rows ?? [])]) {
    if (!r.newHireId || !r.termDate) continue;
    exitRows.set(r.newHireId, [...(exitRows.get(r.newHireId) ?? []), r]);
  }

  const groups: Array<TurnoverDepartment | "N/A" | "Company"> = [...TURNOVER_DEPARTMENTS, "N/A", "Company"];
  const cells = new Map(groups.map((g) => [g, months.map((): Cell => ({ head: 0, exits: 0, exitsLeftOut: 0 }))]));
  const add = (g: TurnoverDepartment | null, i: number, f: (c: Cell) => void) => {
    f((cells.get(g ?? "N/A") as Cell[])[i]);
    f((cells.get("Company") as Cell[])[i]);
  };

  for (const r of rows) {
    if (isTestTagged(r.tags)) continue;
    const periods = periodsOf(r);
    if (!periods.length) continue;
    const placed: Placed = { status: r.employmentStatus, periods, contract: r.contractPeriods.map((c) => ({ start: c.startDate, end: c.endDate })) };
    const deptOn = (d: Date) => turnoverDepartment(r.department, titleOn(r.roleAssignments, d));

    months.forEach((m, i) => {
      const end = new Date(m.end);
      if (periods.some((p) => covers(p, end)) && !contractorOn(placed, end, m.isToday)) add(deptOn(end), i, (c) => c.head++);
    });

    for (const p of periods) {
      if (!p.end) continue;
      const left = dayOf(p.end);
      if (left > today) continue;
      const i = months.findIndex((m) => left >= m.start && left <= m.end);
      if (i < 0 || contractorOn(placed, p.end, false)) continue;
      const near = (exitRows.get(r.id) ?? [])
        .map((x) => ({ x, gap: Math.abs(Date.parse(`${x.termDate}T00:00:00Z`) - left) }))
        .filter((o) => o.gap <= EXIT_MATCH_DAYS * DAY)
        .sort((a, b) => a.gap - b.gap)[0]?.x;
      const reason = near?.reason ?? null;
      const leftOut =
        Boolean(situational[periodKey(r.id, iso(dayOf(p.start)))]) || (reason !== null && (LAYOFF_REASONS.has(reason) || NOT_COUNTED_QUITS.has(reason)));
      add(deptOn(p.end), i, (c) => {
        c.exits++;
        if (leftOut) c.exitsLeftOut++;
      });
    }
  }

  // Rolling windows: point j covers months j .. j+11.
  const seriesOf = (g: TurnoverDepartment | "N/A" | "Company"): TurnoverSeries => {
    const cs = cells.get(g) as Cell[];
    const windowAt = (j: number) => {
      const w = cs.slice(j, j + 12);
      const avg = w.reduce((s, c) => s + c.head, 0) / 12;
      const exits = w.reduce((s, c) => s + c.exits, 0);
      const leftOut = w.reduce((s, c) => s + c.exitsLeftOut, 0);
      return { avg, exits, leftOut };
    };
    const rate: number[] = [];
    const leaveOut: number[] = [];
    for (let j = 0; j < pointCount; j++) {
      const w = windowAt(j);
      rate.push(w.avg ? round1((w.exits / w.avg) * 100) : 0);
      leaveOut.push(w.avg ? round1(((w.exits - w.leftOut) / w.avg) * 100) : 0);
    }
    const last = windowAt(pointCount - 1);
    return { rate, leaveOut, exits: last.exits, exitsLeftOut: last.leftOut, avgHeadcount: round1(last.avg) };
  };

  const na = seriesOf("N/A");
  return {
    asOf: iso(today),
    points: months.slice(11).map((m) => ({ key: m.key, label: m.label, long: m.long })),
    company: seriesOf("Company"),
    departments: TURNOVER_DEPARTMENTS.map((name) => ({ name, series: seriesOf(name) })),
    unplaced: { avgHeadcount: na.avgHeadcount, exits: na.exits }
  };
}
