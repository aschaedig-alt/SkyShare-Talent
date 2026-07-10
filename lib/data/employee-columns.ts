import { prisma } from "@/lib/prisma";
import { normalizeEmployeeColumns, DEFAULT_EMPLOYEE_COLUMNS, type EmployeeColumnKey } from "@/lib/employees/columns";

// Server-side get/save for the shared Employees-list column layout. The
// client-safe keys/type live in lib/employees/columns.ts.
export type { EmployeeColumnKey } from "@/lib/employees/columns";

const SCOPE = "employees";
const KEY = "columns";

export async function getEmployeeColumns(): Promise<EmployeeColumnKey[]> {
  const setting = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!setting?.valueJson) return [...DEFAULT_EMPLOYEE_COLUMNS];
  try {
    return normalizeEmployeeColumns(JSON.parse(setting.valueJson));
  } catch {
    return [...DEFAULT_EMPLOYEE_COLUMNS];
  }
}

export async function saveEmployeeColumns(input: unknown): Promise<EmployeeColumnKey[]> {
  const cols = normalizeEmployeeColumns(input);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(cols) },
    update: { valueJson: JSON.stringify(cols) }
  });
  return cols;
}
