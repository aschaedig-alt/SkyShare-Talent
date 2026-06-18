import { prisma } from "@/lib/prisma";
import {
  buildDepartmentColors,
  isColorName,
  COLORABLE_DEPARTMENTS,
  type ColorMeta,
  type DepartmentColorOverrides,
  type DeptKey
} from "@/lib/calendar/departments";

const SCOPE = "calendar";
const KEY = "department-colors";

/** Keep only valid {department: colorName} pairs for the recolorable departments. */
function normalize(input: unknown): DepartmentColorOverrides {
  const out: DepartmentColorOverrides = {};
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    for (const dept of COLORABLE_DEPARTMENTS) {
      const value = record[dept];
      if (isColorName(value)) out[dept] = value;
    }
  }
  return out;
}

export async function getDepartmentColorOverrides(): Promise<DepartmentColorOverrides> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return {};
  try {
    return normalize(JSON.parse(setting.valueJson));
  } catch {
    return {};
  }
}

/** Resolved, ready-to-use class sets per department (defaults + stored overrides). */
export async function getDepartmentColors(): Promise<Record<DeptKey, ColorMeta>> {
  return buildDepartmentColors(await getDepartmentColorOverrides());
}

export async function saveDepartmentColorOverrides(input: unknown): Promise<DepartmentColorOverrides> {
  const normalized = normalize(input);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });
  return normalized;
}
