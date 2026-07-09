import { prisma } from "@/lib/prisma";
import { computeTenure } from "@/lib/data/tenure";

// The Employees directory: everyone who is or was staff (post-onboarding), with
// their dates, current role, tenure (summed across employment stints so rehires
// count real employed time), and journey size. Distinct from the pre-onboarding
// candidate pipeline.

export type EmployeeRow = {
  id: string;
  name: string;
  legalName: string | null;
  position: string | null;
  department: string | null;
  location: string | null;
  startDate: string | null; // first stint / hire
  endDate: string | null; // last departure (past employees)
  current: boolean;
  employmentStatus: string; // ACTIVE | TERMINATED | CONTRACT
  tenureDays: number | null;
  roleCount: number;
  stintCount: number;
  birthday: string | null;
};

export type EmployeeCounts = { total: number; current: number; past: number };

type Row = {
  id: string;
  name: string;
  legalName: string | null;
  position: string | null;
  department: string | null;
  location: string | null;
  startDate: Date | null;
  terminationDate: Date | null;
  birthday: Date | null;
  employmentStatus: string;
  employmentStints: { startDate: Date; endDate: Date | null }[];
  _count: { roleAssignments: number };
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Rehire-aware tenure (bridge gaps <= 3 months, reset for longer — see
// lib/data/tenure), else derive one implicit stint from start -> termination.
function tenureOf(r: Row, now: number): { days: number | null; start: Date | null; end: Date | null; hasOpen: boolean } {
  const stints = r.employmentStints.length
    ? r.employmentStints
    : r.startDate
      ? [{ startDate: r.startDate, endDate: r.terminationDate }]
      : [];
  if (!stints.length) return { days: null, start: null, end: r.terminationDate, hasOpen: false };
  const t = computeTenure(stints, now);
  return { days: t.tenureDays, start: t.originalStart, end: t.termDate, hasOpen: t.termDate === null };
}

export async function getEmployees(): Promise<EmployeeRow[]> {
  const now = Date.now();
  const rows = (await prisma.newHire.findMany({
    where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] } },
    select: {
      id: true,
      name: true,
      legalName: true,
      position: true,
      department: true,
      location: true,
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
    // Only ACTIVE counts as a current employee — CONTRACT and TERMINATED do not.
    const current = r.employmentStatus === "ACTIVE";
    return {
      id: r.id,
      name: r.name,
      legalName: r.legalName,
      position: r.position,
      department: r.department,
      location: r.location,
      startDate: iso(t.start ?? r.startDate),
      endDate: current ? null : iso(t.end ?? r.terminationDate),
      current,
      employmentStatus: r.employmentStatus,
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
  const [total, active] = await Promise.all([
    prisma.newHire.count({ where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] } } }),
    prisma.newHire.count({ where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] }, employmentStatus: "ACTIVE" } })
  ]);
  // Non-active (CONTRACT + TERMINATED) all fall under "past".
  return { total, current: active, past: total - active };
}
