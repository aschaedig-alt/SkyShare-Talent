import { prisma } from "@/lib/prisma";
import type { MxGroup } from "./types";
import { defaultMxRoster, normalizeMxRoster } from "./mx-roster";

const SCOPE = "fleet";
const KEY = "mx-roster";

/** Current Maintenance roster: the admin-edited override if one exists, else the seed. */
export async function getMxRoster(): Promise<MxGroup[]> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return defaultMxRoster();
  try {
    return normalizeMxRoster(JSON.parse(setting.valueJson));
  } catch {
    return defaultMxRoster();
  }
}

/** Persist an edited roster (normalized first). */
export async function saveMxRoster(input: unknown): Promise<MxGroup[]> {
  const normalized = normalizeMxRoster(input);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });
  return normalized;
}

/** Drop the override so the chart reverts to the maintenance-data.ts seed. */
export async function resetMxRoster(): Promise<MxGroup[]> {
  await prisma.workspaceSetting.deleteMany({ where: { scope: SCOPE, key: KEY } });
  return defaultMxRoster();
}
