import { moduleIds, type ModuleId } from "@/lib/navigation/modules";

// The option lists the access controls are built from, in ONE place.
//
// Written as a shared module on purpose: the department list was previously
// hardcoded in app/api/admin/users/[id]/route.ts AND duplicated as
// DEPARTMENT_OPTIONS in components/settings/UsersManagementWorkspace.tsx, so the
// validator and the picker could drift apart without anything failing loudly.
// The new controls have more options than that one did, so repeating the mistake
// would cost more.

/** Departments a hiring manager can be scoped to. Matches DeptKey minus "unassigned". */
export const SCOPING_DEPARTMENTS = [
  { value: "crew", label: "Crew" },
  { value: "maintenance", label: "Maintenance" },
  { value: "fbo", label: "FBO" },
  { value: "support", label: "Support" }
] as const;

export const SCOPING_DEPARTMENT_VALUES: readonly string[] = SCOPING_DEPARTMENTS.map((d) => d.value);

export function isScopingDepartment(value: unknown): value is string {
  return typeof value === "string" && SCOPING_DEPARTMENT_VALUES.includes(value);
}

// Human labels for the per-user module toggles. A module id can back several nav
// items (people covers New hires, Employees, Travel, Orientation...), so these
// name the AREA rather than any one page, and say what else rides along where
// that is not obvious from the name.
export const MODULE_LABELS: Record<ModuleId, string> = {
  "command-center": "Command Center",
  candidates: "Candidates (and Offers)",
  "recruiting-jobs": "Recruiting Jobs",
  "pilot-requirements": "Pilot Requirements",
  matching: "Matchboard",
  events: "Events",
  calendar: "Calendar, Interviews and Debrief",
  scheduling: "Scheduling",
  "interview-questions": "Question Bank",
  imports: "Imports / Uploads",
  "duplicate-review": "Duplicate Review",
  reports: "Reports",
  archive: "Historical Archive",
  jobs: "Job Post Builder",
  review: "Final Review",
  blocks: "Content Blocks",
  people: "People (new hires, employees, travel, orientation)",
  fleet: "Fleet org charts",
  handbook: "Handbook",
  settings: "Settings"
};

// Settings is hard-locked to ADMIN in lib/navigation/modules.ts, so it is not
// offered as a per-user toggle — an override for it is dropped on write and
// ignored on read, and showing a switch that does nothing would be worse than
// showing none.
export const TOGGLEABLE_MODULES: ModuleId[] = moduleIds.filter((id) => id !== "settings");

/** Cap on how many candidates one person can be granted. */
export const MAX_ALLOWED_CANDIDATES = 200;
