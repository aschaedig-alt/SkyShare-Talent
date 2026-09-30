import { prisma } from "@/lib/prisma";
import { computeTenure, type TenureStint } from "@/lib/data/tenure";
import { seatOf } from "@/lib/data/employee-journey";
import { isTestTagged } from "@/lib/testdata/markers";
import { rosterOf, rosterPacker, type HeadcountPerson, type RosterEntry } from "@/lib/reports/headcount-roster";

export type { HeadcountPerson, RosterEntry } from "@/lib/reports/headcount-roster";

// ---------------------------------------------------------------------------
// Headcount and tenure, year by year — the Reports "Headcount & Tenure" tab.
//
// Asked for by Aimee on 2026-09-29: "id like to be able to track employee tenure
// similar to how we track upgrades and transitions. we need to account for history
// as far back as we can to 2009. there will be limited info in the early years,
// but i want to be able to say 'in 2020 we had xx employees, xx of them were
// pilots, xx of those employees are still here.'"
//
// Read-only. Every number comes from the people records the Employees directory
// and each person's Journey already use, so the three cannot disagree.
//
// THE DEFINITIONS, in one place:
//
//   On staff on a date — one of their employment periods covers it. A period is an
//     EmploymentStint (a rehire has several); somebody with none falls back to the
//     span of their recorded roles, which is the Journey's own fallback, then to
//     start date -> termination date. A canceled hire (the offer fell through) and
//     a TEST-tagged record never count.
//   A year's snapshot — December 31 of it; the current year is today.
//   A pilot on a date — the role covering that date holds a pilot seat, read by the
//     same seatOf the upgrade report uses, or is a plain "Pilot" (imported history
//     often says only that, which seatOf declines because it cannot say captain or
//     first officer). NO ROLE covering the date is "role not recorded" and counts
//     as neither pilot nor not: the early years are exactly where roles are
//     missing, and a guess there would make the thin years look certain.
//   Dates are compared as CALENDAR DAYS. A last day is a day worked, and 2018-2020
//     came from yearly rosters: nearly every departure there is dated Dec 31 of the
//     year somebody was last listed (22 of 22 in 2019, 22 of 24 in 2020, measured
//     2026-09-29). Comparing clock times dropped all of them from their own
//     year-end - 56 on staff at the end of 2020 read as 34 in the first draft.
//   A contractor on a date — a ContractPeriod covers it (loaded from the roster
//     workbook's TYPE column by prisma/import-contract-history.ts); today, the app's
//     CONTRACT status. Somebody CONTRACT with no contract history at all is a
//     contractor for their current employment period: a contractor added since the
//     load. Contractors are counted APART from employees, never inside them - the
//     workbook's own count for 2018 is "35, 6 contractors", and the first version
//     of this report said 41 on staff. Every figure below "employees" (pilots,
//     still here, joined, left, tenure) is employees only.
//   Still here — on staff today, as an employee or a contractor.
//   Tenure — the rehire-aware rule (lib/data/tenure): a gap of three months or less
//     is bridged, a longer one restarts the clock.
// ---------------------------------------------------------------------------

const YEAR_DAYS = 365.25;

type Period = { start: Date; end: Date | null };
type Role = { title: string; seat: string | null; fleetPositionSlug: string | null; startDate: Date; endDate: Date | null };



export type HeadcountYear = {
  year: number;
  /** ISO. December 31 of the year, or now for the current year. */
  asOf: string;
  isToday: boolean;
  /** Employees on staff that day. Contractors are NOT in this - see contractors. */
  employees: number;
  /** Working for SkyShare on contract that day: in no other figure of the year. */
  contractors: number;
  pilots: number;
  /** A role is recorded and it is not a pilot seat. */
  others: number;
  /** No role recorded for that date - neither pilot nor not. */
  roleUnknown: number;
  /** Of that day's employees, on staff today (as an employee or a contractor). */
  stillHere: number;
  pilotsStillHere: number;
  /** Employment periods that started in the year as an employee - a rehire counts again. */
  joined: number;
  /** Periods that ended in the year, up to today, as an employee. */
  left: number;
  /** Of those, how many are dated Dec 31 - a yearly roster's "gone by next year", not a real last day. */
  leftOnDec31: number;
  medianTenureYears: number | null;
  roster: RosterEntry[];
};

export type TenureBucket = { label: string; count: number; pilots: number };

export type LongestServing = { id: string; name: string; role: string | null; years: number; since: string };

export type HeadcountHistory = {
  years: HeadcountYear[];
  /** Everybody on any roster, once; RosterEntry points in here. */
  people: Array<{ id: string; name: string }>;
  /** Every role title on any roster, once. */
  roles: string[];
  /** The first year anybody on file started, or null with no dated records. */
  firstYear: number | null;
  /** The employees on staff today, by length of service. */
  tenure: {
    buckets: TenureBucket[];
    medianYears: number | null;
    averageYears: number | null;
    longest: LongestServing[];
  };
  coverage: {
    /** People with at least one employment period - the ones this report can place. */
    counted: number;
    /** People with no date of any kind, who cannot be placed in any year. */
    undated: number;
    /** The earliest date any pilot role on file starts. */
    earliestPilotRole: string | null;
    /** Distinct people on staff at a year-end before that date with no role recorded. */
    unknownBeforePilots: number;
  };
};

/** Somebody's employment periods, by the rule above. Exported so the contract-history
    loader (prisma/import-contract-history.ts) places people exactly as this report does. */
export function periodsOf(h: { startDate: Date | null; terminationDate: Date | null; employmentStints: Array<{ startDate: Date; endDate: Date | null }>; roleAssignments: Array<{ startDate: Date; endDate: Date | null }> }): Period[] {
  if (h.employmentStints.length) return h.employmentStints.map((s) => ({ start: s.startDate, end: s.endDate }));
  if (h.roleAssignments.length) {
    const start = new Date(Math.min(...h.roleAssignments.map((r) => r.startDate.getTime())));
    const open = h.roleAssignments.some((r) => !r.endDate);
    const end = open ? null : new Date(Math.max(...h.roleAssignments.map((r) => (r.endDate as Date).getTime())));
    return [{ start, end }];
  }
  return h.startDate ? [{ start: h.startDate, end: h.terminationDate }] : [];
}

/** A date's calendar day (UTC, which is how date-only fields are stored), as a number. */
function day(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function covers(p: { start: Date; end: Date | null }, d: Date): boolean {
  const on = day(d);
  return day(p.start) <= on && (!p.end || day(p.end) >= on);
}

/** Seat-less "Pilot" titles count; maintenance and office titles that mention pilots never do. */
function isPilotRole(role: Role): boolean {
  if (seatOf(role) !== null) return true;
  return /\bpilot\b/i.test(role.title) && !/\b(maintenance|mechanic|technician|dispatch|coordinator|scheduler|scheduling|recruit\w*|trainer)\b/i.test(role.title);
}

function isYearEnd(d: Date): boolean {
  return d.getUTCMonth() === 11 && d.getUTCDate() === 31;
}

type Placed = { status: string; periods: Period[]; contract: Period[] };

/** Contractor on a date, by the rule above. Today is the app's status, which is live. */
function contractorOn(p: Placed, d: Date, isToday: boolean): boolean {
  if (isToday) return p.status === "CONTRACT";
  if (p.contract.some((c) => covers(c, d))) return true;
  return p.contract.length === 0 && p.status === "CONTRACT" && p.periods.some((x) => !x.end && covers(x, d));
}

/** The role covering a date: the latest-starting one, so a same-day change reads as the new role. */
function roleOn(roles: Role[], d: Date): Role | null {
  let best: Role | null = null;
  for (const r of roles) {
    if (!covers({ start: r.startDate, end: r.endDate }, d)) continue;
    if (!best || r.startDate.getTime() > best.startDate.getTime()) best = r;
  }
  return best;
}

/** Rehire-aware service on a date, in days: periods after it dropped, the one covering it closed at it. */
function tenureDaysOn(periods: Period[], d: Date): number {
  const stints: TenureStint[] = periods
    .filter((p) => p.start.getTime() <= d.getTime())
    .map((p) => ({ startDate: p.start, endDate: p.end && p.end.getTime() < d.getTime() ? p.end : d }));
  return computeTenure(stints, d.getTime()).tenureDays ?? 0;
}

function years(days: number): number {
  return Math.round((days / YEAR_DAYS) * 10) / 10;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

const BUCKETS: Array<{ label: string; min: number; max: number | null }> = [
  { label: "Under 1 year", min: 0, max: 1 },
  { label: "1 - 2 years", min: 1, max: 2 },
  { label: "2 - 5 years", min: 2, max: 5 },
  { label: "5 - 10 years", min: 5, max: 10 },
  { label: "10 years or more", min: 10, max: null }
];

export async function getHeadcountHistory(now: Date = new Date()): Promise<HeadcountHistory> {
  const rows = await prisma.newHire.findMany({
    where: { canceled: false },
    select: {
      id: true,
      name: true,
      tags: true,
      startDate: true,
      terminationDate: true,
      employmentStatus: true,
      employmentStints: { select: { startDate: true, endDate: true } },
      roleAssignments: { select: { title: true, seat: true, fleetPositionSlug: true, startDate: true, endDate: true } },
      contractPeriods: { select: { startDate: true, endDate: true } }
    }
  });
  const people = rows
    .filter((r) => !isTestTagged(r.tags))
    .map((r) => ({
      id: r.id,
      name: r.name,
      status: r.employmentStatus,
      periods: periodsOf(r),
      roles: r.roleAssignments,
      contract: r.contractPeriods.map((c) => ({ start: c.startDate, end: c.endDate }))
    }));
  const placed = people.filter((p) => p.periods.length > 0);
  const hereNow = new Set(placed.filter((p) => p.periods.some((x) => covers(x, now))).map((p) => p.id));

  const starts = placed.flatMap((p) => p.periods.map((x) => x.start.getUTCFullYear()));
  const firstYear = starts.length ? Math.min(...starts) : null;
  const thisYear = now.getUTCFullYear();

  const pilotRoleStarts = people.flatMap((p) => p.roles.filter(isPilotRole).map((r) => r.startDate.getTime()));
  const earliestPilotRole = pilotRoleStarts.length ? new Date(Math.min(...pilotRoleStarts)) : null;
  const unknownEarly = new Set<string>();

  const out: HeadcountYear[] = [];
  const { tables, pack } = rosterPacker();
  for (let year = firstYear ?? thisYear; firstYear !== null && year <= thisYear; year += 1) {
    const isToday = year === thisYear;
    const asOf = isToday ? now : new Date(Date.UTC(year, 11, 31));
    const roster: HeadcountPerson[] = [];
    let joined = 0;
    let left = 0;
    let leftOnDec31 = 0;
    for (const p of placed) {
      // Joining or leaving as a contractor is not an employee joining or leaving.
      joined += p.periods.filter((x) => x.start.getUTCFullYear() === year && !contractorOn(p, x.start, false)).length;
      const ended = p.periods.filter((x) => x.end && x.end.getUTCFullYear() === year && day(x.end) <= day(now) && !contractorOn(p, x.end, false));
      left += ended.length;
      leftOnDec31 += ended.filter((x) => isYearEnd(x.end as Date)).length;
      if (!p.periods.some((x) => covers(x, asOf))) continue;
      const contractor = contractorOn(p, asOf, isToday);
      const role = roleOn(p.roles, asOf);
      if (!contractor && !role && earliestPilotRole && asOf.getTime() < earliestPilotRole.getTime()) unknownEarly.add(p.id);
      roster.push({
        id: p.id,
        name: p.name,
        role: role?.title ?? null,
        pilot: role ? isPilotRole(role) : null,
        stillHere: hereNow.has(p.id),
        tenureYears: years(tenureDaysOn(p.periods, asOf)),
        contractor
      });
    }
    roster.sort((a, b) => Number(a.contractor) - Number(b.contractor) || b.tenureYears - a.tenureYears || a.name.localeCompare(b.name));
    const staff = roster.filter((r) => !r.contractor);
    out.push({
      year,
      asOf: asOf.toISOString(),
      isToday,
      employees: staff.length,
      contractors: roster.length - staff.length,
      pilots: staff.filter((r) => r.pilot === true).length,
      others: staff.filter((r) => r.pilot === false).length,
      roleUnknown: staff.filter((r) => r.pilot === null).length,
      stillHere: staff.filter((r) => r.stillHere).length,
      pilotsStillHere: staff.filter((r) => r.pilot === true && r.stillHere).length,
      joined,
      left,
      leftOnDec31,
      medianTenureYears: median(staff.map((r) => r.tenureYears)),
      roster: roster.map(pack)
    });
  }

  // Today's employees by length of service - the tenure the question starts from.
  const today = out.length ? rosterOf(tables, out[out.length - 1].roster).filter((r) => !r.contractor) : [];
  const serving = placed
    .filter((p) => hereNow.has(p.id) && !contractorOn(p, now, true))
    .map((p) => {
      const t = computeTenure(p.periods.map((x) => ({ startDate: x.start, endDate: x.end })), now.getTime());
      const role = roleOn(p.roles, now);
      return { id: p.id, name: p.name, role: role?.title ?? null, pilot: role ? isPilotRole(role) : false, days: t.tenureDays ?? 0, since: t.serviceStart };
    });
  const buckets: TenureBucket[] = BUCKETS.map((b) => {
    const inIt = serving.filter((s) => {
      const y = s.days / YEAR_DAYS;
      return y >= b.min && (b.max === null || y < b.max);
    });
    return { label: b.label, count: inIt.length, pilots: inIt.filter((s) => s.pilot).length };
  });
  const tenureYears = today.map((t) => t.tenureYears);
  const longest = [...serving]
    .sort((a, b) => b.days - a.days)
    .slice(0, 8)
    .map((s) => ({ id: s.id, name: s.name, role: s.role, years: years(s.days), since: (s.since ?? now).toISOString() }));

  return {
    years: out,
    people: tables.people,
    roles: tables.roles,
    firstYear,
    tenure: {
      buckets,
      medianYears: median(tenureYears),
      averageYears: tenureYears.length ? Math.round((tenureYears.reduce((a, b) => a + b, 0) / tenureYears.length) * 10) / 10 : null,
      longest
    },
    coverage: {
      counted: placed.length,
      undated: people.length - placed.length,
      earliestPilotRole: earliestPilotRole?.toISOString() ?? null,
      unknownBeforePilots: unknownEarly.size
    }
  };
}

