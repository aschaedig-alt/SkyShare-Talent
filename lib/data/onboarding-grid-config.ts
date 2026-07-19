import { prisma } from "@/lib/prisma";
import { ONBOARDING_TASKS, ONBOARDING_GROUPS, CUSTOM_GROUP } from "@/lib/onboarding/tasks";
import { getMilestoneCatalog } from "@/lib/data/onboarding-milestones";

// Layered edits to the built-in onboarding checklist, so the Grid (the single
// place tasks are managed now that Milestones is retired) can rename or hide the
// fixed tasks without touching code. Custom (added) tasks are handled by the
// existing milestone catalog. Stored as a WorkspaceSetting — no schema migration.
const SCOPE = "workspace";
const KEY = "onboarding-grid-overrides";

const BUILTIN_KEYS = new Set(ONBOARDING_TASKS.map((t) => t.key));

type Overrides = { overrides: Record<string, string>; hidden: string[] };

async function read(): Promise<Overrides> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return { overrides: {}, hidden: [] };
  try {
    const p = JSON.parse(row.valueJson) as { overrides?: Record<string, string>; hidden?: string[] };
    return {
      overrides: p.overrides && typeof p.overrides === "object" ? p.overrides : {},
      hidden: Array.isArray(p.hidden) ? p.hidden.filter((x): x is string => typeof x === "string") : []
    };
  } catch {
    return { overrides: {}, hidden: [] };
  }
}

async function write(o: Overrides) {
  const value = JSON.stringify(o);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}

export type GridTaskDef = { key: string; label: string; group: string; custom: boolean; hidden: boolean };
export type GridChecklistGroup = { key: string; label: string; tasks: GridTaskDef[] };

/** The full checklist the Grid renders + manages: built-in groups (with rename /
 *  hide applied) plus a Custom group of user-added tasks. Hidden tasks are still
 *  returned (flagged) so Manage mode can show + un-hide them. */
export async function getGridChecklist(): Promise<GridChecklistGroup[]> {
  const [ov, catalog] = await Promise.all([read(), getMilestoneCatalog()]);
  const hidden = new Set(ov.hidden);
  const groups: GridChecklistGroup[] = ONBOARDING_GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    tasks: ONBOARDING_TASKS.filter((t) => t.group === g.key).map((t) => ({
      key: t.key,
      label: ov.overrides[t.key] ?? t.label,
      group: g.key,
      custom: false,
      hidden: hidden.has(t.key)
    }))
  }));
  const customs = catalog
    .filter((c) => c.custom)
    .map((c) => ({ key: c.key, label: c.label, group: CUSTOM_GROUP, custom: true, hidden: false }));
  if (customs.length) groups.push({ key: CUSTOM_GROUP, label: "Custom", tasks: customs });
  return groups;
}

/** Just the hidden built-in keys, so grid progress can exclude them from counts. */
export async function getGridHiddenKeys(): Promise<Set<string>> {
  return new Set((await read()).hidden);
}

export async function renameBuiltinTask(key: string, label: string): Promise<void> {
  if (!BUILTIN_KEYS.has(key)) throw new Error("Not a built-in task.");
  const trimmed = label.trim().slice(0, 120);
  if (!trimmed) throw new Error("A task name is required.");
  const o = await read();
  o.overrides[key] = trimmed;
  await write(o);
  // Sync the per-hire task label so the detail page matches the grid.
  await prisma.onboardingTask.updateMany({ where: { key }, data: { label: trimmed } });
}

export async function setBuiltinHidden(key: string, hidden: boolean): Promise<void> {
  if (!BUILTIN_KEYS.has(key)) throw new Error("Not a built-in task.");
  const o = await read();
  o.hidden = hidden ? [...new Set([...o.hidden, key])] : o.hidden.filter((k) => k !== key);
  await write(o);
}
