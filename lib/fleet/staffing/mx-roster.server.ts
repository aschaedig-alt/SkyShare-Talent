import { prisma } from "@/lib/prisma";
import type { MxRoster } from "./mx-roster";
import { defaultMxRoster, normalizeMxRoster, normalizeMxLinks } from "./mx-roster";

const SCOPE = "fleet";
const KEY = "mx-roster";

const seedRoster = (): MxRoster => ({ groups: defaultMxRoster(), links: {} });

/** Current Maintenance roster + candidate links: the admin-edited override if one exists, else the seed. */
export async function getMxRoster(): Promise<MxRoster> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return seedRoster();
  try {
    const parsed = JSON.parse(setting.valueJson);
    // Back-compat: older saves stored a bare MxGroup[] with no links.
    if (Array.isArray(parsed)) return { groups: normalizeMxRoster(parsed), links: {} };
    const obj = parsed as { groups?: unknown; links?: unknown };
    return { groups: normalizeMxRoster(obj.groups), links: normalizeMxLinks(obj.links) };
  } catch {
    return seedRoster();
  }
}

/** Persist an edited roster + links (normalized first). */
export async function saveMxRoster(input: { groups?: unknown; links?: unknown }): Promise<MxRoster> {
  const roster: MxRoster = {
    groups: normalizeMxRoster(input?.groups),
    links: normalizeMxLinks(input?.links)
  };
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(roster) },
    update: { valueJson: JSON.stringify(roster) }
  });
  return roster;
}

/** Drop the override so the chart reverts to the maintenance-data.ts seed. */
export async function resetMxRoster(): Promise<MxRoster> {
  await prisma.workspaceSetting.deleteMany({ where: { scope: SCOPE, key: KEY } });
  return seedRoster();
}
