import { prisma } from "@/lib/prisma";
import type { CrewGroup } from "./types";
import { defaultCrewRoster, normalizeCrewRoster } from "./roster";

const SCOPE = "fleet";
const KEY = "crew-roster";

/** Current Crew roster: the admin-edited override if one exists, else the seed. */
export async function getCrewRoster(): Promise<CrewGroup[]> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return defaultCrewRoster();
  try {
    return normalizeCrewRoster(JSON.parse(setting.valueJson));
  } catch {
    return defaultCrewRoster();
  }
}

/** Persist an edited roster (normalized first). */
export async function saveCrewRoster(input: unknown): Promise<CrewGroup[]> {
  const normalized = normalizeCrewRoster(input);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(normalized) },
    update: { valueJson: JSON.stringify(normalized) }
  });
  return normalized;
}

/** Drop the override so the chart reverts to the crew-data.ts seed. */
export async function resetCrewRoster(): Promise<CrewGroup[]> {
  await prisma.workspaceSetting.deleteMany({ where: { scope: SCOPE, key: KEY } });
  return defaultCrewRoster();
}
