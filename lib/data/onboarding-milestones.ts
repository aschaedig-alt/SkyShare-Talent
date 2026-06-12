import { prisma } from "@/lib/prisma";
import { MILESTONE_KEYS, CUSTOM_GROUP } from "@/lib/onboarding/tasks";

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

  const hires = await prisma.newHire.findMany({ select: { id: true } });
  await prisma.onboardingTask.createMany({
    data: hires.map((h) => ({ newHireId: h.id, key, label: trimmed, group: CUSTOM_GROUP, order: 90, status: "TODO" })),
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

/** For newly created hires: create tasks for any catalog milestone that is not a built-in default. */
export async function ensureCustomMilestoneTasks(hireId: string) {
  const stored = await readCatalog();
  if (!stored) return;
  const extras = stored.filter((m) => !DEFAULT_KEYS.has(m.key));
  if (extras.length === 0) return;
  await prisma.onboardingTask.createMany({
    data: extras.map((m) => ({ newHireId: hireId, key: m.key, label: m.label, group: CUSTOM_GROUP, order: 90, status: "TODO" })),
    skipDuplicates: true
  });
}
