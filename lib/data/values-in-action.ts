import { prisma } from "@/lib/prisma";
import { CURRENT_EMPLOYEE_WHERE } from "@/lib/data/current-employee";
import {
  budgetDepartment,
  departmentLooseKey,
  employedOnDay,
  EXCLUDED_EMPLOYMENT_STATUS,
  quarterOf,
  type Quarter
} from "@/lib/compliments/program";

// SkyShare Values in Action - roster, managers and department budgets.
// Read-only: everything here is derived from the people records on each read,
// so nothing is written to the shared database. The rules live in
// lib/compliments/program.ts.

export type PersonRef = { id: string; name: string };

export type DepartmentBudget = {
  department: string;
  /** Employees counted on the first day of the quarter. */
  headcount: number;
  budgetUsd: number;
  /** Managers whose own profile is in this department; they share its budget. */
  managers: PersonRef[];
  /**
   * Who can spend this budget. The department's own managers when it has any;
   * otherwise the supervisors of its current employees (his rule, 2026-11-19:
   * "supervisor spends"), e.g. Keith Rabin spends Sales | Fractional.
   */
  spenders: PersonRef[];
  /** True when the spenders are the team's supervisors, not managers inside it. */
  spentBySupervisors: boolean;
};

export type DepartmentBudgets = {
  quarter: Quarter;
  perPersonUsd: number;
  totalHeadcount: number;
  totalBudgetUsd: number;
  departments: DepartmentBudget[];
  managerCount: number;
  /** Departments with budget that NOBODY can spend: no manager inside, and no
   *  current employee in it has a supervisor on file. */
  withoutManager: string[];
  /** Departments spent by their team's supervisors because no manager sits in them. */
  spentBySupervisors: string[];
  /** Groups of department spellings that look like one department. */
  likelyDuplicates: string[][];
  /** Counted on the quarter's first day with no start date on file. */
  countedWithoutStartDate: PersonRef[];
};

const PEOPLE_SELECT = {
  id: true,
  name: true,
  department: true,
  employmentStatus: true,
  startDate: true,
  terminationDate: true,
  supervisorHireId: true,
  supervisor2HireId: true,
  employmentStints: { select: { startDate: true, endDate: true } }
} as const;

/** Current employees in the program: the app's one "who works here" filter. */
export async function getProgramEmployees() {
  return prisma.newHire.findMany({
    where: CURRENT_EMPLOYEE_WHERE,
    select: PEOPLE_SELECT,
    orderBy: { name: "asc" }
  });
}

/**
 * Managers: anyone set as supervisor (first or second slot) of at least one
 * current employee, who is a current employee themselves. Supervisor slots that
 * follow a leadership role (Chief Pilot and so on) keep supervisorHireId in
 * step, so the role holder is picked up without special handling.
 */
export function managersAmong<T extends { id: string; employmentStatus: string; supervisorHireId: string | null; supervisor2HireId: string | null }>(
  employees: T[]
): T[] {
  const current = employees.filter((e) => e.employmentStatus === "ACTIVE");
  const ids = new Set<string>();
  for (const e of current) {
    if (e.supervisorHireId) ids.add(e.supervisorHireId);
    if (e.supervisor2HireId) ids.add(e.supervisor2HireId);
  }
  return current.filter((e) => ids.has(e.id));
}

export async function getDepartmentBudgets(
  perPersonUsd: number,
  quarter: Quarter = quarterOf()
): Promise<DepartmentBudgets> {
  // Former employees matter too: someone who left in November was on the
  // payroll on Oct 1, so they are part of Q4's headcount. This is deliberately
  // wider than CURRENT_EMPLOYEE_WHERE (lib/data/current-employee.ts) for that
  // reason, but keeps its canceled:false: an offer that never started is not a
  // person who worked here. (Missed at first - Matthew Biddulph, a no-start, was
  // counted in Q4 until he pointed it out on 2026-11-19.)
  const people = await prisma.newHire.findMany({
    where: { employmentStatus: { in: ["ACTIVE", "TERMINATED"] }, canceled: CURRENT_EMPLOYEE_WHERE.canceled },
    select: PEOPLE_SELECT,
    orderBy: { name: "asc" }
  });

  const counted = people.filter((p) => p.employmentStatus !== EXCLUDED_EMPLOYMENT_STATUS && employedOnDay(p, quarter.startDay));
  const managers = managersAmong(people);

  const byDept = new Map<string, DepartmentBudget>();
  const row = (department: string) => {
    let r = byDept.get(department);
    if (!r) {
      r = { department, headcount: 0, budgetUsd: 0, managers: [], spenders: [], spentBySupervisors: false };
      byDept.set(department, r);
    }
    return r;
  };
  for (const p of counted) row(budgetDepartment(p.department)).headcount += 1;
  for (const m of managers) row(budgetDepartment(m.department)).managers.push({ id: m.id, name: m.name });

  // Supervisor spends: a department with no manager inside is spent by whoever
  // supervises its CURRENT employees (both supervisor slots), provided that
  // supervisor is a current employee too.
  const managerById = new Map(managers.map((m) => [m.id, m]));
  for (const r of byDept.values()) {
    r.budgetUsd = r.headcount * perPersonUsd;
    if (r.managers.length > 0) {
      r.spenders = r.managers;
      continue;
    }
    const sup = new Map<string, PersonRef>();
    for (const p of people) {
      if (p.employmentStatus !== "ACTIVE" || budgetDepartment(p.department) !== r.department) continue;
      for (const sid of [p.supervisorHireId, p.supervisor2HireId]) {
        const s = sid ? managerById.get(sid) : undefined;
        if (s) sup.set(s.id, { id: s.id, name: s.name });
      }
    }
    r.spenders = [...sup.values()].sort((a, b) => a.name.localeCompare(b.name));
    r.spentBySupervisors = r.spenders.length > 0;
  }

  const departments = [...byDept.values()].sort((a, b) => b.headcount - a.headcount || a.department.localeCompare(b.department));

  const loose = new Map<string, string[]>();
  for (const d of departments) {
    const k = departmentLooseKey(d.department);
    loose.set(k, [...(loose.get(k) ?? []), d.department]);
  }

  return {
    quarter,
    perPersonUsd,
    totalHeadcount: counted.length,
    totalBudgetUsd: counted.length * perPersonUsd,
    departments,
    managerCount: managers.length,
    withoutManager: departments.filter((d) => d.headcount > 0 && d.spenders.length === 0).map((d) => d.department),
    spentBySupervisors: departments.filter((d) => d.headcount > 0 && d.spentBySupervisors).map((d) => d.department),
    likelyDuplicates: [...loose.values()].filter((g) => g.length > 1),
    countedWithoutStartDate: counted
      .filter((p) => p.employmentStints.length === 0 && !p.startDate)
      .map((p) => ({ id: p.id, name: p.name }))
  };
}
