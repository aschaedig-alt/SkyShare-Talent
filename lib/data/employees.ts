import { prisma } from "@/lib/prisma";
import { computeTenure } from "@/lib/data/tenure";
import { resolveDepartmentKey } from "@/lib/calendar/departments";
import type { ViewerScope } from "@/lib/auth/viewer-scope";

// Who's asking — drives the department/tag scoping below. ADMIN/RECRUITER are
// never narrowed. Everyone else (in practice HIRING_MANAGER) sees only their
// own department, minus anyone tagged Management/Executive — unless they're
// themselves tagged Executive, in which case they see everyone except other
// Executives. See lib/roadmap "Department & tag-based access scoping".
export type EmployeeViewer = Pick<ViewerScope, "role" | "department" | "isExecutive">;

const EXEMPT_TAGS = ["management", "executive"];

function hasTag(tags: string[], names: string[]) {
  return tags.some((t) => names.includes(t.trim().toLowerCase()));
}

function scopeForViewer<T extends { department: string | null; tags: string[] }>(rows: T[], viewer: EmployeeViewer): T[] {
  if (viewer.role === "ADMIN" || viewer.role === "RECRUITER") return rows;
  if (viewer.isExecutive) return rows.filter((r) => !hasTag(r.tags, ["executive"]));
  if (!viewer.department) return [];
  return rows.filter((r) => resolveDepartmentKey(r.department).deptKey === viewer.department && !hasTag(r.tags, EXEMPT_TAGS));
}

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
  aircraft: string | null; // airframe derived from the title (PC-12, CJ2, G450/GV …), seat-agnostic
  seat: string | null; // PIC | SIC | null
  managed: boolean; // dedicated managed-aircraft pilot (vs SkyShare / fractional)
  phone: string | null;
  workEmail: string | null;
  personalEmail: string | null;
  startDate: string | null; // first stint / hire
  serviceDate: string | null; // pilots: pay-step anchor / aircraft service date
  seniorityDate: string | null; // HR seniority anchor
  lastRoleChange: string | null; // most recent role change (null if only ever one role)
  birthCountry: string | null;
  citizenship: string | null;
  endDate: string | null; // last departure (past employees)
  current: boolean;
  employmentStatus: string; // ACTIVE | TERMINATED | CONTRACT
  tags: string[]; // hand-applied labels (Executive, Management, …); Contract is derived from status
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
  managedPilot: boolean;
  phone: string | null;
  ssEmail: string | null;
  personalEmail: string | null;
  startDate: Date | null;
  aircraftServiceDate: Date | null;
  seniorityDate: Date | null;
  birthCountry: string | null;
  citizenshipCountry: string | null;
  terminationDate: Date | null;
  birthday: Date | null;
  employmentStatus: string;
  tags: string[];
  employmentStints: { startDate: Date; endDate: Date | null }[];
  roleAssignments: { startDate: Date }[];
  _count: { roleAssignments: number };
};

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// Airframe (seat-agnostic) from a role title, so you can filter "PC-12" and get
// both captains and first officers. Combined G450 & GV = one type rating.
const AIRFRAME_PATTERNS: [RegExp, string][] = [
  [/g450 ?& ?gv|\bg450\b.*\bgv\b|\bgv\b.*\bg450\b/i, "G450/GV"],
  [/\bg450\b/i, "G450"],
  [/\bgv\b/i, "GV"],
  [/\bg200\b/i, "G200"],
  [/\blegacy ?6[05]0\b/i, "Legacy 650"],
  [/\bphenom ?300\b/i, "Phenom 300"],
  [/\bphenom ?100\b/i, "Phenom 100"],
  [/\b560 ?xls\+?\b|\bxls\+?\b/i, "560XLS+"],
  [/\b560 ?xl\b|\bxl\b/i, "560XL"],
  [/\bcj ?2\b|\bce-?525\b/i, "CJ2"],
  [/\bpc-?12\b/i, "PC-12"],
  [/\bm2\b/i, "M2"]
];
function aircraftOf(position: string | null): string | null {
  const p = position ?? "";
  for (const [re, code] of AIRFRAME_PATTERNS) if (re.test(p)) return code;
  return null;
}
function seatOf(position: string | null): string | null {
  const p = (position ?? "").toLowerCase();
  if (/first officer|\bfo\b|\bsic\b/.test(p)) return "SIC";
  if (/captain|\bpic\b|\bpilot\b/.test(p)) return "PIC";
  return null;
}

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

export async function getEmployees(viewer: EmployeeViewer): Promise<EmployeeRow[]> {
  const now = Date.now();
  const rows = (await prisma.newHire.findMany({
    // Exclude canceled offers (accepted then backed out before day one) — they
    // were never employees, so they don't belong in the Employees directory.
    where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] }, canceled: false },
    select: {
      id: true,
      name: true,
      legalName: true,
      position: true,
      department: true,
      location: true,
      managedPilot: true,
      phone: true,
      ssEmail: true,
      personalEmail: true,
      startDate: true,
      aircraftServiceDate: true,
      seniorityDate: true,
      birthCountry: true,
      citizenshipCountry: true,
      terminationDate: true,
      birthday: true,
      employmentStatus: true,
      tags: true,
      employmentStints: { select: { startDate: true, endDate: true } },
      roleAssignments: { orderBy: { startDate: "desc" }, take: 1, select: { startDate: true } },
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
      aircraft: aircraftOf(r.position),
      seat: seatOf(r.position),
      managed: r.managedPilot,
      phone: r.phone,
      workEmail: r.ssEmail,
      personalEmail: r.personalEmail,
      startDate: iso(t.start ?? r.startDate),
      serviceDate: iso(r.aircraftServiceDate),
      seniorityDate: iso(r.seniorityDate),
      // "Last position change" = the most recent role's start, but only if they've
      // held more than one role (otherwise there's been no change since hire).
      lastRoleChange: r._count.roleAssignments > 1 && r.roleAssignments[0] ? iso(r.roleAssignments[0].startDate) : null,
      birthCountry: r.birthCountry,
      citizenship: r.citizenshipCountry,
      endDate: current ? null : iso(t.end ?? r.terminationDate),
      current,
      employmentStatus: r.employmentStatus,
      tags: r.tags ?? [],
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
  return scopeForViewer(employees, viewer);
}

export async function getEmployeeCounts(viewer: EmployeeViewer): Promise<EmployeeCounts> {
  // ADMIN/RECRUITER keep the cheap COUNT-only path. A scoped viewer (in
  // practice HIRING_MANAGER) needs department + tags to filter, so derive
  // their counts from the already-scoped row list instead — the roster is a
  // few hundred rows, cheap either way at this scale.
  if (viewer.role === "ADMIN" || viewer.role === "RECRUITER") {
    const [total, active] = await Promise.all([
      prisma.newHire.count({ where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] }, canceled: false } }),
      prisma.newHire.count({ where: { stage: { in: ["POST_ONBOARD", "ARCHIVED"] }, employmentStatus: "ACTIVE", canceled: false } })
    ]);
    // Non-active (CONTRACT + TERMINATED) all fall under "past".
    return { total, current: active, past: total - active };
  }

  const employees = await getEmployees(viewer);
  const current = employees.filter((e) => e.current).length;
  return { total: employees.length, current, past: employees.length - current };
}
