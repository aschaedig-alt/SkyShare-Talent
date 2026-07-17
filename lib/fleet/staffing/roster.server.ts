import { prisma } from "@/lib/prisma";
import type { CrewRoster } from "./roster";
import { defaultCrewRoster, normalizeCrewRoster, normalizeCrewLinks } from "./roster";

const SCOPE = "fleet";
const KEY = "crew-roster";

const seedRoster = (): CrewRoster => ({ groups: defaultCrewRoster(), links: {} });

/** Current Crew roster + candidate links: the admin-edited override if one exists, else the seed. */
export async function getCrewRoster(): Promise<CrewRoster> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return seedRoster();
  try {
    const parsed = JSON.parse(setting.valueJson);
    // Back-compat: older saves stored a bare CrewGroup[] with no links.
    if (Array.isArray(parsed)) return { groups: normalizeCrewRoster(parsed), links: {} };
    const obj = parsed as { groups?: unknown; links?: unknown };
    return { groups: normalizeCrewRoster(obj.groups), links: normalizeCrewLinks(obj.links) };
  } catch {
    return seedRoster();
  }
}

/** Persist an edited roster + links (normalized first). */
export async function saveCrewRoster(input: { groups?: unknown; links?: unknown }): Promise<CrewRoster> {
  const roster: CrewRoster = {
    groups: normalizeCrewRoster(input?.groups),
    links: normalizeCrewLinks(input?.links)
  };
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify(roster) },
    update: { valueJson: JSON.stringify(roster) }
  });
  return roster;
}

/** Drop the override so the chart reverts to the crew-data.ts seed. */
export async function resetCrewRoster(): Promise<CrewRoster> {
  await prisma.workspaceSetting.deleteMany({ where: { scope: SCOPE, key: KEY } });
  return seedRoster();
}
