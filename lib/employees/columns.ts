// Client-safe column definitions for the Employees list (no server imports, so
// a "use client" component can import the keys/type without pulling in prisma).
// The server get/save live in lib/data/employee-columns.ts.

export const EMPLOYEE_COLUMN_KEYS = [
  "role",
  "department",
  "tags",
  "location",
  "aircraft",
  "seat",
  "pool",
  "started",
  "serviceDate",
  "seniority",
  "lastRoleChange",
  "tenure",
  "roles",
  "status",
  "phone",
  "workEmail",
  "personalEmail",
  "birthday",
  "birthCountry",
  "citizenship"
] as const;
export type EmployeeColumnKey = (typeof EMPLOYEE_COLUMN_KEYS)[number];

// The current default set (matches what the page showed before it was configurable).
export const DEFAULT_EMPLOYEE_COLUMNS: EmployeeColumnKey[] = ["role", "department", "tags", "started", "tenure", "roles", "status"];

// Hand-applied person tags (independent of department). Extend this list to add
// new tags. "Contract" is intentionally NOT here — it's derived from
// employmentStatus at display time, so it never needs hand-tagging.
export const EMPLOYEE_TAGS = ["Executive", "Management", "PDP", "Argus", "Check Pilot", "ATP"] as const;
export type EmployeeTag = (typeof EMPLOYEE_TAGS)[number];

// Keep only recognized, de-duplicated tags — drops junk/typos and anything not in
// the allowlist (e.g. a stray "Contract"), so the stored field stays clean.
export function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of input) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (t && (EMPLOYEE_TAGS as readonly string[]).includes(t) && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

export function normalizeEmployeeColumns(input: unknown): EmployeeColumnKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_EMPLOYEE_COLUMNS];
  const valid = input.filter((k): k is EmployeeColumnKey => EMPLOYEE_COLUMN_KEYS.includes(k as EmployeeColumnKey));
  return valid.length ? Array.from(new Set(valid)) : [...DEFAULT_EMPLOYEE_COLUMNS];
}
