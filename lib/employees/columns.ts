// Client-safe column definitions for the Employees list (no server imports, so
// a "use client" component can import the keys/type without pulling in prisma).
// The server get/save live in lib/data/employee-columns.ts.

export const EMPLOYEE_COLUMN_KEYS = [
  "role",
  "department",
  "location",
  "aircraft",
  "seat",
  "pool",
  "started",
  "tenure",
  "roles",
  "status",
  "phone",
  "workEmail",
  "personalEmail",
  "birthday"
] as const;
export type EmployeeColumnKey = (typeof EMPLOYEE_COLUMN_KEYS)[number];

// The current default set (matches what the page showed before it was configurable).
export const DEFAULT_EMPLOYEE_COLUMNS: EmployeeColumnKey[] = ["role", "department", "location", "started", "tenure", "roles", "status"];

export function normalizeEmployeeColumns(input: unknown): EmployeeColumnKey[] {
  if (!Array.isArray(input)) return [...DEFAULT_EMPLOYEE_COLUMNS];
  const valid = input.filter((k): k is EmployeeColumnKey => EMPLOYEE_COLUMN_KEYS.includes(k as EmployeeColumnKey));
  return valid.length ? Array.from(new Set(valid)) : [...DEFAULT_EMPLOYEE_COLUMNS];
}
