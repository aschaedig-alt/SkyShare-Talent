import { prisma } from "@/lib/prisma";
import { DEFAULT_TIMEZONE } from "@/lib/calendar/timezones";
import { isTestTagged } from "@/lib/testdata/markers";
import { contractorOn, covers, periodsOf, type Placed } from "@/lib/data/headcount-history";
import { latestBatch, type ExitRow } from "@/lib/quality-of-hire/imports";
import { getSituationalMarks, periodKey } from "@/lib/quality-of-hire/situational";
import { EXIT_MATCH_DAYS } from "@/lib/quality-of-hire/report";
import { LAYOFF_REASONS, NOT_COUNTED_QUITS } from "@/lib/quality-of-hire/categories";
import { TURNOVER_DEPARTMENTS, turnoverDepartment, type TurnoverDepartment } from "@/lib/reports/turnover-departments";
import { rollingAt, type MonthCell, type RollingTurnover, type TurnoverHistory } from "@/lib/reports/rolling-turnover-math";

export type { MonthCell, RollingTurnover, TurnoverHistory, TurnoverSeries } from "@/lib/reports/rolling-turnover-math";

// ROLLING 12-MONTH TURNOVER - the Turnover Manager Dashboard's measure, from Journey.
//
// For each month: everyone who left in the 12 months up to that month, divided by
// the average month-end headcount over those same 12 months. The current month ends
// today. He asked for these charts on Reports on 2026-11-24, from the dashboard he
// built in May 2026 out of Paycom exports, and the same day for its Month and Year
// pickers - so every month back to the start of Journey's history is counted here,
// once, and the rolling arithmetic lives in lib/reports/rolling-turnover-math.ts.
//
// Who counts is exactly Headcount & tenure's rule (periodsOf, contractorOn): employees
// only, contractors on the day left out, test records left out, canceled hires (no
// starts) left out. An exit is the end of an employment period, so a rehire who
// leaves twice counts twice - the same as the dashboard's terminations file.
//
// "Leave out" is Hire quality's Not counted rule: layoffs, moving, retirement (the
// Paycom reason on the matching exit row, matched within EXIT_MATCH_DAYS as Hire
// quality does), and any exit marked as caused by the business. An exit with no
// Paycom row (every exit before 2021: its exit files start in 2021) has no reason,
// so it is never left out.

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** Nobody's history is read before this: the employee import starts in 2010. */
const EARLIEST = Date.UTC(2010, 0, 1);
const dayOf = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

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

/** Every month's counts, from the first month anybody worked here to this one. */
export async function getTurnoverHistory(now: Date = new Date()): Promise<TurnoverHistory> {
  const today = officeToday(now);

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

  const people = rows
    .filter((r) => !isTestTagged(r.tags))
    .map((r) => ({ r, periods: periodsOf(r) }))
    .filter((p) => p.periods.length > 0);

  const firstStart = Math.max(EARLIEST, Math.min(today, ...people.flatMap((p) => p.periods.map((x) => dayOf(x.start)))));
  const f = new Date(firstStart);
  const t = new Date(today);
  const count = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth()) + 1;
  const months = Array.from({ length: count }, (_, i) => {
    const y = f.getUTCFullYear();
    const m = f.getUTCMonth() + i;
    const start = Date.UTC(y, m, 1);
    const d = new Date(start);
    const yy = String(d.getUTCFullYear()).slice(2);
    return {
      start,
      end: Math.min(Date.UTC(y, m + 1, 0), today),
      key: iso(start).slice(0, 7),
      label: `${MONTHS[d.getUTCMonth()]} '${yy}`,
      long: `${LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`
    };
  });
  const last = months.length - 1;

  const exitRows = new Map<string, ExitRow[]>();
  for (const x of [...(terminations?.rows ?? []), ...(termTypes?.rows ?? [])]) {
    if (!x.newHireId || !x.termDate) continue;
    exitRows.set(x.newHireId, [...(exitRows.get(x.newHireId) ?? []), x]);
  }

  const blank = () => months.map((): MonthCell => ({ head: 0, exits: 0, exitsLeftOut: 0 }));
  const company = blank();
  const unplaced = blank();
  const byDept = new Map<TurnoverDepartment, MonthCell[]>(TURNOVER_DEPARTMENTS.map((d) => [d, blank()]));
  const add = (g: TurnoverDepartment | null, i: number, fn: (c: MonthCell) => void) => {
    fn((g ? byDept.get(g) : unplaced)![i]);
    fn(company[i]);
  };

  for (const { r, periods } of people) {
    const placed: Placed = { status: r.employmentStatus, periods, contract: r.contractPeriods.map((c) => ({ start: c.startDate, end: c.endDate })) };
    const deptOn = (d: Date) => turnoverDepartment(r.department, titleOn(r.roleAssignments, d));

    // Month-end headcount: once a month however many periods cover it, as Headcount does.
    for (let i = 0; i <= last; i++) {
      const end = new Date(months[i].end);
      if (periods.some((p) => covers(p, end)) && !contractorOn(placed, end, i === last)) add(deptOn(end), i, (c) => c.head++);
    }

    for (const p of periods) {
      const s = dayOf(p.start);
      const e = p.end ? dayOf(p.end) : null;
      // The exit, in the month it happened.
      if (e === null || e > today || !p.end) continue;
      const i = months.findIndex((m) => e >= m.start && e <= m.end);
      if (i < 0 || contractorOn(placed, p.end, false)) continue;
      const near = (exitRows.get(r.id) ?? [])
        .map((x) => ({ x, gap: Math.abs(Date.parse(`${x.termDate}T00:00:00Z`) - e) }))
        .filter((o) => o.gap <= EXIT_MATCH_DAYS * DAY)
        .sort((a, b) => a.gap - b.gap)[0]?.x;
      const reason = near?.reason ?? null;
      const leftOut = Boolean(situational[periodKey(r.id, iso(s))]) || (reason !== null && (LAYOFF_REASONS.has(reason) || NOT_COUNTED_QUITS.has(reason)));
      add(deptOn(p.end), i, (c) => {
        c.exits++;
        if (leftOut) c.exitsLeftOut++;
      });
    }
  }

  return {
    asOf: iso(today),
    months: months.map(({ key, label, long }) => ({ key, label, long })),
    company,
    departments: TURNOVER_DEPARTMENTS.map((name) => ({ name, cells: byDept.get(name) as MonthCell[] })),
    unplaced
  };
}

/** The window ending this month - At a glance. */
export async function getRollingTurnover(now: Date = new Date()): Promise<RollingTurnover> {
  const h = await getTurnoverHistory(now);
  return rollingAt(h, h.months.length - 1);
}
