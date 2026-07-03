import { prisma } from "@/lib/prisma";

// The Employees directory: everyone who is or was staff (post-onboarding), with
// their dates, current role, tenure (summed across employment stints so rehires
// count real employed time), and journey size. Distinct from the pre-onboarding
// candidate pipeline.

const DAY = 24 * 60 * 60 * 1000;

export type EmployeeRow = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  startDate: string | null; // first stint / hire
  endDate: string | null; // last departure (past employees)
  current: boolean;
  tenureDays: number | null;
  roleCount: number;
  stintCount: number;
  birthday: string | null;
};

export type EmployeeCounts = { total: number; current: number; past: number };

type Row = {
  id: string;
  name: string;
  position: string | null;
  department: string | null;
  startDate: Date | null;
  terminationDate: Date | null;
  birthday: Date | null;
  employmentStatus: string;
  employmentStints: { startDate: Date; endDate: Date | null }[];
  _count: { roleAssignments: number };
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Sum employed time across stints (rehires count real time), else derive one
// implicit stint from start -> termination (or now if still here).
function tenureOf(r: Row, now: number): { days: number | null; start: Date | null; end: Date | null; hasOpen: boolean } {
  const stints = r.employmentStints.length
    ? r.employmentStints
    : r.startDate
      ? [{ startDate: r.startDate, endDate: r.terminationDate }]
      : [];
  if (!stints.length) return { days: null, start: null, end: r.terminationDate, hasOpen: false };
  const ordered = [...stints].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  let days = 0;
  let hasOpen = false;
  for (const s of ordered) {
    const end = s.endDate ? s.endDate.getTime() : ((hasOpen = true), now);
    days += Math.max(0, Math.round((end - s.startDate.getTime()) / DAY));
  }
  return { days, start: ordered[0].startDate, end: ordered[ordered.length - 1].endDate, hasOpen };
}

export async function getEmployees(): Promise<EmployeeRow[]> {
  const now = Date.now();
  const rows = (await prisma.newHire.findMany({
    where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] } },
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      startDate: true,
      terminationDate: true,
      birthday: true,
      employmentStatus: true,
      employmentStints: { select: { startDate: true, endDate: true } },
      _count: { select: { roleAssignments: true } }
    }
  })) as Row[];

  const employees = rows.map((r) => {
    const t = tenureOf(r, now);
    const current = r.employmentStatus !== "TERMINATED";
    return {
      id: r.id,
      name: r.name,
      position: r.position,
      department: r.department,
      startDate: iso(t.start ?? r.startDate),
      endDate: current ? null : iso(t.end ?? r.terminationDate),
      current,
      tenureDays: t.days,
      roleCount: r._count.roleAssignments,
      stintCount: r.employmentStints.length,
      birthday: iso(r.birthday)
    };
  });

  // Current first, then longest-serving / most-recent.
  employees.sort((a, b) => {
    if (a.current !== b.current) return a.current ? -1 : 1;
    return (b.startDate ?? "").localeCompare(a.startDate ?? "");
  });
  return employees;
}

export async function getEmployeeCounts(): Promise<EmployeeCounts> {
  const [total, past] = await Promise.all([
    prisma.newHire.count({ where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] } } }),
    prisma.newHire.count({ where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] }, employmentStatus: "TERMINATED" } })
  ]);
  return { total, current: total - past, past };
}
