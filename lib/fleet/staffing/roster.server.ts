import { prisma } from "@/lib/prisma";
import type { CrewRoster } from "./roster";
import { defaultCrewLeadership, defaultCrewRoster, normalizeCrewLeadership, normalizeCrewRoster, normalizeCrewLinks } from "./roster";
import { normalizeTraining, seedCrewTraining } from "./training";

const SCOPE = "fleet";
const KEY = "crew-roster";

const seedRoster = (): CrewRoster => ({
  groups: defaultCrewRoster(),
  links: {},
  training: seedCrewTraining(),
  leadership: defaultCrewLeadership()
});

/** Current Crew roster + candidate links + training + leadership: the admin-edited override if one exists, else the seed. */
export async function getCrewRoster(): Promise<CrewRoster> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!setting?.valueJson) return seedRoster();
  try {
    const parsed = JSON.parse(setting.valueJson);
    // Back-compat: older saves stored a bare CrewGroup[] with no links.
    if (Array.isArray(parsed)) {
      return { groups: normalizeCrewRoster(parsed), links: {}, training: seedCrewTraining(), leadership: defaultCrewLeadership() };
    }
    const obj = parsed as { groups?: unknown; links?: unknown; training?: unknown; leadership?: unknown };
    // Back-compat again: every save made BEFORE the Training tab shipped has no
    // `training` key at all. Seeding from crew-data.ts in that case means the
    // tab opens with the three pilots the Training Info tab already knew about,
    // instead of blank on a chart that plainly shows people in training.
    // An explicit empty array is respected — that is someone clearing it.
    const training = "training" in obj ? normalizeTraining(obj.training) : seedCrewTraining();
    // Every save made before Nov 3 has no `leadership` key: show the seed
    // (crew-data.ts) until somebody edits the boxes.
    const leadership = "leadership" in obj ? normalizeCrewLeadership(obj.leadership) : defaultCrewLeadership();
    return { groups: normalizeCrewRoster(obj.groups), links: normalizeCrewLinks(obj.links), training, leadership };
  } catch {
    return seedRoster();
  }
}

/** Persist an edited roster + links + training + leadership (normalized first). */
export async function saveCrewRoster(input: { groups?: unknown; links?: unknown; training?: unknown; leadership?: unknown }): Promise<CrewRoster> {
  // A caller that does not mention training (or leadership) KEEPS what is
  // stored. Only the key being present replaces it. Without this, one stale
  // browser tab saving a roster the old way would silently wipe every training
  // record — or put back the old Chief Pilot — for the whole team. The
  // database is shared and live, so that is not recoverable by reloading.
  const needsStored = !(input && "training" in input) || !(input && "leadership" in input);
  const stored = needsStored ? await getCrewRoster() : null;
  const training = input && "training" in input ? normalizeTraining(input.training) : stored!.training;
  const leadership = input && "leadership" in input ? normalizeCrewLeadership(input.leadership) : stored!.leadership;
  const roster: CrewRoster = {
    groups: normalizeCrewRoster(input?.groups),
    links: normalizeCrewLinks(input?.links),
    training,
    leadership
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
