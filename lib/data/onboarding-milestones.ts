import { prisma } from "@/lib/prisma";
import { MILESTONE_KEYS, CUSTOM_GROUP, MAINTENANCE_GROUP, type TaskPlacement } from "@/lib/onboarding/tasks";

const SCOPE = "workspace";
const KEY = "onboarding-milestones";

export type MilestoneDef = { key: string; label: string };
export type MilestoneCatalogItem = MilestoneDef & { custom: boolean };

// Built-in milestones (seed). Once any edit happens, the full catalog is stored and
// becomes authoritative, so defaults can be renamed, reordered, or removed.
const DEFAULTS: MilestoneDef[] = MILESTONE_KEYS.map((m) => ({ key: m.key, label: m.short }));
const DEFAULT_KEYS = new Set(MILESTONE_KEYS.map((m) => m.key));

function makeKey(label: string): string {
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
  const rand = (globalThis as { crypto?: Crypto }).crypto?.randomUUID().slice(0, 8) ?? Math.floor(Math.random() * 1e9).toString(36);
  return `custom_${slug || "milestone"}_${rand}`;
}

async function readCatalog(): Promise<MilestoneDef[] | null> {
  const setting = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!setting?.valueJson) return null;
  try {
    const parsed = JSON.parse(setting.valueJson) as { items?: MilestoneDef[] };
    if (!Array.isArray(parsed.items)) return null;
    return parsed.items
      .filter((m) => m && typeof m.key === "string" && typeof m.label === "string")
      .map((m) => ({ key: m.key, label: m.label }));
  } catch {
    return null;
  }
}

async function writeCatalog(items: MilestoneDef[]) {
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify({ items }) },
    update: { valueJson: JSON.stringify({ items }) }
  });
}

/** Materialize the stored catalog (seed from defaults the first time) so edits persist. */
async function materialize(): Promise<MilestoneDef[]> {
  const stored = await readCatalog();
  if (stored) return stored;
  const seed = [...DEFAULTS];
  await writeCatalog(seed);
  return seed;
}

export async function getMilestoneCatalog(): Promise<MilestoneCatalogItem[]> {
  const list = (await readCatalog()) ?? DEFAULTS;
  return list.map((m) => ({ key: m.key, label: m.label, custom: !DEFAULT_KEYS.has(m.key) }));
}

export async function addMilestone(label: string): Promise<MilestoneCatalogItem[]> {
  const trimmed = label.trim().slice(0, 80);
  if (!trimmed) throw new Error("Milestone name is required.");
  const cat = await materialize();
  if (cat.length >= 40) throw new Error("You can have up to 40 milestones.");
  const key = makeKey(trimmed);
  await writeCatalog([...cat, { key, label: trimmed }]);

  // ONLY HIRES STILL ONBOARDING. This used to be an unfiltered findMany, which wrote
  // a live TODO onto every NewHire row — measured against live data on Aug 24 that
  // was 457 rows, of which 428 were ARCHIVED, 23 POST_ONBOARD and only 6 ACTIVE, and
  // 264 belonged to people whose employmentStatus is TERMINATED. Adding one milestone
  // handed outstanding work to 264 former employees and put an orphan CUSTOM row on
  // the 241 hires that carry no checklist at all.
  //
  // Nobody hired LATER is missed by narrowing this: ensureCustomMilestoneTasks below
  // is called from both hire-creation routes and gives a new hire every custom
  // milestone in the catalog. This call only has to cover the people who already
  // exist, and the only ones for whom a new onboarding step is real are the ones
  // still onboarding. Same reasoning as the contacts-link backfill, which gave
  // archived and post-onboard hires NA rather than TODO for exactly this reason.
  const hires = await prisma.newHire.findMany({ where: { stage: "ACTIVE" }, select: { id: true } });

  // A brand-new milestone is not in the saved layout yet, so it goes at the END
  // of the Custom section — which is where getGridChecklist() shows an unlisted
  // task too, so the row and the screen agree from the moment it is created.
  // Measured rather than hardcoded at 90: once the checklist can be reordered,
  // the flat order is whatever the layout makes it, and a fixed 90 would one day
  // land in the middle of it instead of after the end.
  const last = await prisma.onboardingTask.aggregate({
    where: { group: { not: MAINTENANCE_GROUP } },
    _max: { order: true }
  });
  const order = (last._max.order ?? 89) + 1;

  await prisma.onboardingTask.createMany({
    data: hires.map((h) => ({ newHireId: h.id, key, label: trimmed, group: CUSTOM_GROUP, order, status: "TODO" })),
    skipDuplicates: true
  });
  return getMilestoneCatalog();
}

export async function editMilestone(key: string, label: string): Promise<MilestoneCatalogItem[]> {
  const trimmed = label.trim().slice(0, 80);
  if (!trimmed) throw new Error("Milestone name is required.");
  const cat = await materialize();
  const item = cat.find((m) => m.key === key);
  if (!item) throw new Error("Milestone not found.");
  item.label = trimmed;
  await writeCatalog(cat);
  // Keep the per-hire task label in sync so the detail page reflects the rename.
  await prisma.onboardingTask.updateMany({ where: { key }, data: { label: trimmed } });
  return getMilestoneCatalog();
}

export async function removeMilestone(key: string): Promise<MilestoneCatalogItem[]> {
  const cat = await materialize();
  await writeCatalog(cat.filter((m) => m.key !== key));
  // Custom milestones only live as milestones, so delete their tasks. Default tasks are
  // also part of the grid/detail checklist, so leave those rows intact (just hidden here).
  if (!DEFAULT_KEYS.has(key)) {
    await prisma.onboardingTask.deleteMany({ where: { key, group: CUSTOM_GROUP } });
  }
  return getMilestoneCatalog();
}

export async function reorderMilestones(keys: string[]): Promise<MilestoneCatalogItem[]> {
  const cat = await materialize();
  const byKey = new Map(cat.map((m) => [m.key, m]));
  const ordered: MilestoneDef[] = [];
  for (const k of keys) {
    const m = byKey.get(k);
    if (m) {
      ordered.push(m);
      byKey.delete(k);
    }
  }
  // Keep any milestones the client did not mention (safety) at the end.
  for (const m of byKey.values()) ordered.push(m);
  await writeCatalog(ordered);
  return getMilestoneCatalog();
}

/**
 * For newly created hires: create tasks for any catalog milestone that is not a
 * built-in default.
 *
 * `placement` is the saved layout, passed in by the caller. It has to be a
 * parameter rather than something this function reads for itself, because the
 * module that computes the layout (lib/data/onboarding-grid-config.ts) imports
 * the catalog from THIS file — reaching back the other way would be an import
 * cycle. The two hire-creation routes read the layout once and hand it to both
 * halves of the checklist.
 *
 * Before this, every custom milestone was written at group CUSTOM, order 90,
 * whatever the layout said. A custom step deliberately filed into Orientation
 * therefore appeared in Custom for anybody hired afterwards.
 */
export async function ensureCustomMilestoneTasks(hireId: string, placement: Map<string, TaskPlacement>) {
  const stored = await readCatalog();
  if (!stored) return;
  const extras = stored.filter((m) => !DEFAULT_KEYS.has(m.key));
  if (extras.length === 0) return;
  await prisma.onboardingTask.createMany({
    data: extras.map((m) => {
      // CUSTOM / 90 stays the fallback for a milestone the layout has not seen —
      // one added since the last save. That is the old behaviour, and it puts the
      // task at the end rather than nowhere.
      const at = placement.get(m.key);
      return {
        newHireId: hireId,
        key: m.key,
        label: at?.label ?? m.label,
        group: at?.group ?? CUSTOM_GROUP,
        order: at?.order ?? 90,
        status: "TODO"
      };
    }),
    skipDuplicates: true
  });
}
