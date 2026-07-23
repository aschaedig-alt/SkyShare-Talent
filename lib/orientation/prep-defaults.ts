import { prisma } from "@/lib/prisma";
import { DEFAULT_PREP_TASKS } from "./defaults";

// The STANDING prep checklist that every new orientation session starts from.
//
// It used to be the hardcoded DEFAULT_PREP_TASKS list, which meant a session's
// checklist could be edited but the edits died with that session — the next
// orientation regenerated all twelve items, including the aspirational ones
// nobody actually does yet. So the standing list now lives in a WorkspaceSetting
// (no migration against the shared live DB) and is curated from the app: you fix
// a real session's list, then promote it with "Save as default".
//
// The hardcoded list stays as the fallback, so a workspace that has never
// customised anything behaves exactly as before.

const SCOPE = "orientation";
const KEY = "prep-defaults";

export type PrepDefault = {
  label: string;
  owner: string | null;
  dueDaysBefore: number | null;
};

export type PrepDefaults = {
  tasks: PrepDefault[];
  /** When the list was last promoted, so the UI can say whose list this is. */
  updatedAt: string | null;
  /** False when nothing has been customised and we're serving the seed. */
  customized: boolean;
};

function seed(): PrepDefault[] {
  return DEFAULT_PREP_TASKS.map((t) => ({
    label: t.label,
    owner: t.owner,
    dueDaysBefore: t.dueDaysBefore,
  }));
}

/** Coerce stored JSON into a usable list. Never throws; anything unusable falls
    back to the seed so a bad blob can't leave new sessions with no checklist. */
export function normalizePrepDefaults(input: unknown): PrepDefault[] {
  if (!Array.isArray(input)) return seed();
  const out: PrepDefault[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 200) : "";
    if (!label) continue;
    const owner = typeof r.owner === "string" && r.owner.trim() ? r.owner.trim().slice(0, 60) : null;
    const d = r.dueDaysBefore;
    const dueDaysBefore =
      typeof d === "number" && Number.isFinite(d) && d >= 0 ? Math.floor(d) : null;
    out.push({ label, owner, dueDaysBefore });
  }
  return out.length ? out : seed();
}

/** The standing checklist: the curated list if one exists, else the seed. */
export async function getPrepDefaults(): Promise<PrepDefaults> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true, updatedAt: true },
  });
  if (!row?.valueJson) return { tasks: seed(), updatedAt: null, customized: false };
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return {
      tasks: normalizePrepDefaults(parsed),
      updatedAt: row.updatedAt.toISOString(),
      customized: true,
    };
  } catch {
    return { tasks: seed(), updatedAt: null, customized: false };
  }
}

/** Promote a list to the standing default for future sessions. Existing sessions
    are deliberately untouched — their checklists are a record of that day. */
export async function savePrepDefaults(input: unknown): Promise<PrepDefault[]> {
  const tasks = normalizePrepDefaults(input);
  const value = JSON.stringify(tasks);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value },
  });
  return tasks;
}

/** Drop the customised list so new sessions go back to the built-in checklist. */
export async function resetPrepDefaults(): Promise<PrepDefault[]> {
  await prisma.workspaceSetting.deleteMany({ where: { scope: SCOPE, key: KEY } });
  return seed();
}
