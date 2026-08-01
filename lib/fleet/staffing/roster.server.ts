import { prisma } from "@/lib/prisma";
import type { CrewRoster } from "./roster";
import { defaultCrewRoster, normalizeCrewRoster, normalizeCrewLinks } from "./roster";
import { normalizeTraining, seedCrewTraining } from "./training";

const SCOPE = "fleet";
const KEY = "crew-roster";

const seedRoster = (): CrewRoster => ({ groups: defaultCrewRoster(), links: {}, training: seedCrewTraining() });

/** Current Crew roster + candidate links + training: the admin-edited override if one exists, else the seed. */
export async function getCrewRoster(): Promise<CrewRoster> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return seedRoster();
  try {
    const parsed = JSON.parse(setting.valueJson);
    // Back-compat: older saves stored a bare CrewGroup[] with no links.
    if (Array.isArray(parsed)) return { groups: normalizeCrewRoster(parsed), links: {}, training: seedCrewTraining() };
    const obj = parsed as { groups?: unknown; links?: unknown; training?: unknown };
    // Back-compat again: every save made BEFORE the Training tab shipped has no
    // `training` key at all. Seeding from crew-data.ts in that case means the
    // tab opens with the three pilots the Training Info tab already knew about,
    // instead of blank on a chart that plainly shows people in training.
    // An explicit empty array is respected — that is someone clearing it.
    const training = "training" in obj ? normalizeTraining(obj.training) : seedCrewTraining();
    return { groups: normalizeCrewRoster(obj.groups), links: normalizeCrewLinks(obj.links), training };
  } catch {
    return seedRoster();
  }
}

/** Persist an edited roster + links + training (normalized first). */
export async function saveCrewRoster(input: { groups?: unknown; links?: unknown; training?: unknown }): Promise<CrewRoster> {
  // A caller that does not mention training KEEPS what is stored. Only the key
  // being present replaces it. Without this, one stale browser tab saving a
  // roster the old way would silently wipe every training record for the whole
  // team — the database is shared and live, so that is not recoverable by
  // reloading.
  const training = input && "training" in input ? normalizeTraining(input.training) : (await getCrewRoster()).training;
  const roster: CrewRoster = {
    groups: normalizeCrewRoster(input?.groups),
    links: normalizeCrewLinks(input?.links),
    training
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
