import { prisma } from "@/lib/prisma";
import { MILESTONE_KEYS, CUSTOM_GROUP } from "@/lib/onboarding/tasks";

const SCOPE = "workspace";
const KEY = "onboarding-custom-milestones";

export type CustomMilestone = { key: string; label: string };
export type MilestoneDef = { key: string; label: string; custom: boolean };

function makeKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  const rand = (globalThis as { crypto?: Crypto }).crypto?.randomUUID().slice(0, 8) ?? Math.floor(Math.random() * 1e9).toString(36);
  return `custom_${slug || "milestone"}_${rand}`;
}

export async function getCustomMilestones(): Promise<CustomMilestone[]> {
  const setting = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!setting?.valueJson) return [];
  try {
    const parsed = JSON.parse(setting.valueJson) as { items?: CustomMilestone[] };
    return Array.isArray(parsed.items)
      ? parsed.items
          .filter((m) => m && typeof m.key === "string" && typeof m.label === "string")
          .map((m) => ({ key: m.key, label: m.label }))
      : [];
  } catch {
    return [];
  }
}

async function saveCustomMilestones(items: CustomMilestone[]) {
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: JSON.stringify({ items }) },
    update: { valueJson: JSON.stringify({ items }) }
  });
}

/** The full milestone catalog: the standard onboarding milestones plus any custom ones. */
export async function getMilestoneCatalog(): Promise<MilestoneDef[]> {
  const customs = await getCustomMilestones();
  return [
    ...MILESTONE_KEYS.map((m) => ({ key: m.key, label: m.short, custom: false })),
    ...customs.map((m) => ({ key: m.key, label: m.label, custom: true }))
  ];
}

/** Adds a custom milestone and creates the matching task on every existing hire. */
export async function addCustomMilestone(label: string): Promise<MilestoneDef[]> {
  const trimmed = label.trim().slice(0, 80);
  if (!trimmed) {
    throw new Error("Milestone name is required.");
  }
  const customs = await getCustomMilestones();
  if (customs.length >= 30) {
    throw new Error("You can add up to 30 custom milestones.");
  }
  const key = makeKey(trimmed);
  const next = [...customs, { key, label: trimmed }];
  await saveCustomMilestones(next);

  // Create the task on every hire so it is tracked everywhere.
  const hires = await prisma.newHire.findMany({ select: { id: true } });
  const order = 90; // sits after the standard onboarding groups, before maintenance (100+)
  await prisma.onboardingTask.createMany({
    data: hires.map((h) => ({ newHireId: h.id, key, label: trimmed, group: CUSTOM_GROUP, order, status: "TODO" })),
    skipDuplicates: true
  });

  return getMilestoneCatalog();
}

export async function removeCustomMilestone(key: string): Promise<MilestoneDef[]> {
  const customs = await getCustomMilestones();
  await saveCustomMilestones(customs.filter((m) => m.key !== key));
  await prisma.onboardingTask.deleteMany({ where: { key, group: CUSTOM_GROUP } });
  return getMilestoneCatalog();
}

/** Ensures every given hire has a task for each custom milestone (for newly created hires). */
export async function ensureCustomMilestoneTasks(hireId: string) {
  const customs = await getCustomMilestones();
  if (customs.length === 0) return;
  await prisma.onboardingTask.createMany({
    data: customs.map((m) => ({ newHireId: hireId, key: m.key, label: m.label, group: CUSTOM_GROUP, order: 90, status: "TODO" })),
    skipDuplicates: true
  });
}
