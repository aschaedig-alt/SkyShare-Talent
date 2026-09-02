import { prisma } from "@/lib/prisma";
import { ONBOARDING_TASKS, ONBOARDING_GROUPS, CUSTOM_GROUP, MAINTENANCE_GROUP } from "@/lib/onboarding/tasks";
import { getMilestoneCatalog } from "@/lib/data/onboarding-milestones";
import { getTaskEmailMap, EXCLUDED_TASK_KEYS, type TaskEmailConfig } from "@/lib/onboarding/task-email-config";

// Layered edits to the built-in onboarding checklist, so the Grid (the single
// place tasks are managed now that Milestones is retired) can rename, hide or
// REORDER the fixed tasks without touching code. Custom (added) tasks are handled
// by the existing milestone catalog. Stored as a WorkspaceSetting — no migration.
const SCOPE = "workspace";
const KEY = "onboarding-grid-overrides";

const BUILTIN_KEYS = new Set(ONBOARDING_TASKS.map((t) => t.key));

// `groups` renames a GROUP heading (Offer / Pilot documents / ...). Kept beside
// the per-task overrides in the same setting so there is one place to look.
//
// The last three are the LAYOUT — what order the checklist runs in. They exist
// because the code order in lib/onboarding/tasks.ts is the order the work was
// written down in, not the order it is done in, and a task added later always
// landed at the bottom no matter how early it actually has to happen.
//
//   groupOrder  section keys, top to bottom. A key missing from here keeps its
//               code position, at the end — so a section added in code later
//               still appears without anybody having to re-save the layout.
//   taskGroup   moves ONE task into a different section. This is what lets a
//               custom task sit inside Offer or Onboarding & systems rather than
//               being stranded in the Custom section at the bottom.
//   taskOrder   task keys within each section, in order. Same rule as groupOrder:
//               anything unlisted keeps its code position, at the end.
type Overrides = {
  overrides: Record<string, string>;
  hidden: string[];
  groups: Record<string, string>;
  groupOrder: string[];
  taskGroup: Record<string, string>;
  taskOrder: Record<string, string[]>;
};

const EMPTY: Overrides = { overrides: {}, hidden: [], groups: {}, groupOrder: [], taskGroup: {}, taskOrder: {} };

function strings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function stringMap(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === "string") out[k] = val;
  }
  return out;
}

async function read(): Promise<Overrides> {
  const row = await prisma.workspaceSetting.findFirst({ where: { scope: SCOPE, key: KEY }, select: { valueJson: true } });
  if (!row?.valueJson) return { ...EMPTY };
  try {
    const p = JSON.parse(row.valueJson) as Record<string, unknown>;
    const taskOrder: Record<string, string[]> = {};
    if (p.taskOrder && typeof p.taskOrder === "object") {
      for (const [g, list] of Object.entries(p.taskOrder as Record<string, unknown>)) taskOrder[g] = strings(list);
    }
    return {
      overrides: stringMap(p.overrides),
      hidden: strings(p.hidden),
      groups: stringMap(p.groups),
      groupOrder: strings(p.groupOrder),
      taskGroup: stringMap(p.taskGroup),
      taskOrder
    };
  } catch {
    return { ...EMPTY };
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

export type GridTaskDef = {
  key: string;
  label: string;
  group: string;
  custom: boolean;
  hidden: boolean;
  /** The Front template this task sends, if she has wired one up. */
  email: TaskEmailConfig | null;
  /** This task's send is hand-built (the onboarding welcome, the contacts link),
   *  so it keeps its own button and cannot be re-pointed from Manage tasks. */
  emailFixed: boolean;
};
export type GridChecklistGroup = { key: string; label: string; tasks: GridTaskDef[] };

/** Every section a task can be filed under, in code order. */
const SECTION_KEYS: string[] = [...ONBOARDING_GROUPS.map((g) => g.key), CUSTOM_GROUP];

/**
 * Order a list by a stored preference, keeping anything the preference does not
 * mention in its original position at the END.
 *
 * The tail matters more than the head. A built-in task added in code after
 * somebody last saved a layout is NOT in the preference, and dropping it would
 * make it vanish from the checklist entirely — so unlisted keys are appended
 * rather than filtered out. Same reasoning as reorderMilestones().
 */
function applyOrder<T>(items: T[], keyOf: (t: T) => string, pref: string[]): T[] {
  if (pref.length === 0) return items;
  const rank = new Map(pref.map((k, i) => [k, i]));
  return items
    .map((item, i) => ({ item, i, r: rank.get(keyOf(item)) }))
    .sort((a, b) => {
      if (a.r === undefined && b.r === undefined) return a.i - b.i;
      if (a.r === undefined) return 1;
      if (b.r === undefined) return -1;
      return a.r - b.r;
    })
    .map((x) => x.item);
}

/** Where a task is actually filed: the section it was moved to, or the one it was
 *  written under in code. The fallback is what stops a task disappearing if the
 *  section named in the layout is one this build does not know about. */
function groupOf(ov: Overrides, taskKey: string, fallback: string): string {
  const moved = ov.taskGroup[taskKey];
  if (!moved) return fallback;
  return SECTION_KEYS.includes(moved) ? moved : fallback;
}

function sectionLabel(ov: Overrides, key: string): string {
  if (key === CUSTOM_GROUP) return ov.groups[CUSTOM_GROUP] ?? "Custom";
  return ov.groups[key] ?? ONBOARDING_GROUPS.find((g) => g.key === key)?.label ?? key;
}

/** The full checklist the Grid renders + manages: built-in groups (with rename /
 *  hide / reorder applied) plus a Custom group of user-added tasks. Hidden tasks
 *  are still returned (flagged) so Manage mode can show + un-hide them. */
export async function getGridChecklist(): Promise<GridChecklistGroup[]> {
  const [ov, catalog, emails] = await Promise.all([read(), getMilestoneCatalog(), getTaskEmailMap()]);
  const hidden = new Set(ov.hidden);
  const emailOf = (key: string) => ({ email: emails[key] ?? null, emailFixed: EXCLUDED_TASK_KEYS.has(key) });

  const all: GridTaskDef[] = [
    ...ONBOARDING_TASKS.map((t) => ({
      key: t.key,
      label: ov.overrides[t.key] ?? t.label,
      group: groupOf(ov, t.key, t.group),
      custom: false,
      hidden: hidden.has(t.key),
      ...emailOf(t.key)
    })),
    ...catalog
      .filter((c) => c.custom)
      .map((c) => ({
        key: c.key,
        label: c.label,
        group: groupOf(ov, c.key, CUSTOM_GROUP),
        custom: true,
        hidden: false,
        ...emailOf(c.key)
      }))
  ];

  // EVERY section is returned, including a Custom one with nothing in it. The
  // renderers drop empty groups themselves; Manage mode needs the empty one so
  // there is somewhere to drag a task BACK to after the last custom item has been
  // moved out. Returning only non-empty sections made that a one-way door.
  return applyOrder(SECTION_KEYS, (k) => k, ov.groupOrder).map((key) => ({
    key,
    label: sectionLabel(ov, key),
    tasks: applyOrder(all.filter((t) => t.group === key), (t) => t.key, ov.taskOrder[key] ?? [])
  }));
}

/**
 * The same layout in the shape the PER-HIRE checklist needs: section keys in
 * order, with their display names.
 *
 * The detail page used to read ONBOARDING_GROUPS and groupLabel() straight from
 * code, so a section renamed on the grid still read "Pilot documents" on every
 * hire's own checklist, and a reorder there would not have reached it at all.
 * Both now come from here, so there is one answer to what the checklist looks
 * like rather than two that drift.
 */
export type ChecklistSection = { key: string; label: string };

export async function getChecklistSections(): Promise<ChecklistSection[]> {
  const ov = await read();
  return applyOrder(SECTION_KEYS, (k) => k, ov.groupOrder).map((key) => ({ key, label: sectionLabel(ov, key) }));
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

/**
 * Rename a checklist GROUP heading — "Pilot documents", "Onboarding & systems".
 *
 * Only the display name changes. The group KEY stays fixed, because tasks are
 * filed against it and the Paycom/offer handlers look tasks up by key; renaming
 * the heading must never re-file anything. Passing an empty label restores the
 * built-in name rather than blanking the heading.
 *
 * The Custom heading is renameable now too. It used to be fixed on the grounds
 * that it is generated rather than configured, but once a custom task can be
 * moved out of it the section is a place you choose to put things, so it earns a
 * name. The old updateMany that re-wrote group onto the task rows is gone from
 * here: a rename never re-files anything, and re-filing is now what
 * saveChecklistArrangement is for.
 */
export async function renameGroup(groupKey: string, label: string): Promise<void> {
  if (!SECTION_KEYS.includes(groupKey)) throw new Error("Not a checklist group.");
  const trimmed = label.trim().slice(0, 60);
  const o = await read();
  if (trimmed) o.groups[groupKey] = trimmed;
  else delete o.groups[groupKey];
  await write(o);
}

export async function setBuiltinHidden(key: string, hidden: boolean): Promise<void> {
  if (!BUILTIN_KEYS.has(key)) throw new Error("Not a built-in task.");
  const o = await read();
  o.hidden = hidden ? [...new Set([...o.hidden, key])] : o.hidden.filter((k) => k !== key);
  await write(o);
}

// ---------------------------------------------------------------------------
// Reordering
//
// WHY THE PER-HIRE ROWS ARE RE-STAMPED AND NOT JUST THE SETTING.
//
// OnboardingTask carries its own group and order columns, denormalised onto every
// hire, and four separate places sort by them — the detail checklist, the grid's
// per-hire task list, the "next outstanding task" on a dashboard row, and the
// grid's completion count. Storing the layout only in the setting would leave all
// four showing yesterday's order while the Manage panel showed today's.
//
// So a save writes both: the setting is the source of truth for what the layout
// IS, and the task rows are brought into line with it in one transaction.
//
// The write is deliberately narrow and reversible. Only order (int) and group
// (string) change; labels, statuses and completedAt are untouched, nothing is
// created and nothing is deleted, and dragging the rows back and saving again
// restores the previous numbers exactly. MAINTENANCE rows are excluded by an
// explicit clause as well as by their keys being disjoint from these ones.

export type ChecklistArrangement = { groupOrder: string[]; tasks: Array<{ key: string; group: string }> };

/**
 * Save a new checklist layout and bring every hire's task rows into line with it.
 *
 * `tasks` is the WHOLE checklist in its new order, each entry carrying the section
 * it now belongs to. Sending the whole arrangement rather than a "moved X above Y"
 * delta is on purpose: what gets stored is exactly the order the user was looking
 * at when they pressed Save, so the two cannot disagree.
 */
export async function saveChecklistArrangement(input: ChecklistArrangement): Promise<void> {
  const o = await read();

  const groupOrder = input.groupOrder.filter((k) => SECTION_KEYS.includes(k));
  if (groupOrder.length === 0) throw new Error("A checklist needs at least one section.");

  const catalog = await getMilestoneCatalog();
  const knownTasks = new Set<string>([...BUILTIN_KEYS, ...catalog.filter((c) => c.custom).map((c) => c.key)]);

  const taskGroup: Record<string, string> = {};
  const taskOrder: Record<string, string[]> = {};
  // A flat 0..n-1 index across the sections in their new order. Same shape
  // defaultTaskCreateData() has always produced (order = position in the
  // checklist), so nothing downstream has to learn a new numbering scheme.
  const flat: Array<{ key: string; group: string; order: number }> = [];

  const seen = new Set<string>();
  for (const groupKey of groupOrder) {
    taskOrder[groupKey] = [];
    for (const t of input.tasks) {
      if (t.group !== groupKey || seen.has(t.key) || !knownTasks.has(t.key)) continue;
      seen.add(t.key);
      taskGroup[t.key] = groupKey;
      taskOrder[groupKey].push(t.key);
      flat.push({ key: t.key, group: groupKey, order: flat.length });
    }
  }

  // Anything the client did not send keeps whatever it had. Losing a task's
  // placement because it was missing from one request is not a recoverable
  // mistake, and a stale tab is exactly how that would happen.
  for (const [k, v] of Object.entries(o.taskGroup)) if (!seen.has(k)) taskGroup[k] = v;

  await write({ ...o, groupOrder, taskGroup, taskOrder });

  if (flat.length === 0) return;
  await prisma.$transaction(
    flat.map((t) =>
      prisma.onboardingTask.updateMany({
        where: { key: t.key, group: { not: MAINTENANCE_GROUP } },
        data: { group: t.group, order: t.order }
      })
    )
  );
}
