// Reading and writing travel checklist state. SERVER ONLY — this is the half of
// the checklist that touches Prisma, kept apart from lib/travel/checklist.ts so
// the client component can import the definitions without dragging the pg driver
// into the browser bundle. It did exactly that once, and the symptom was the
// whole /travel route 500ing with "Module not found: Can't resolve 'fs'".
//
// State lives in a WorkspaceSetting rather than its own table, following the
// orientation-sends / reminder-armed precedent: local dev and production share
// ONE live database, so a migration is the most expensive thing in this repo to
// get wrong, and this is a handful of rows. If travel grows past a few hundred
// trips this should become a real table with a per-trip unique key, the way
// OnboardingTask already is.

import { prisma } from "@/lib/prisma";
import {
  coerceChecklistState,
  type AllChecklistState,
  type TripChecklistState
} from "@/lib/travel/checklist";

const SCOPE = "travel";
const KEY = "checklist";

async function readAll(): Promise<AllChecklistState> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as AllChecklistState) : {};
  } catch {
    return {};
  }
}

async function writeAll(all: AllChecklistState): Promise<void> {
  const value = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}

/**
 * Drop the false entries before storing.
 *
 * Restoring a folded-away group is expressed as false, and keeping those would
 * grow this one shared blob by a key per group per trip that anybody ever
 * un-folded — for a map whose whole meaning is "the keys that are present".
 * Absent and false already mean the same thing everywhere that reads it.
 */
function pruneNotNeeded(map: TripChecklistState["notNeeded"]): TripChecklistState["notNeeded"] {
  const out: TripChecklistState["notNeeded"] = {};
  for (const [key, value] of Object.entries(map)) {
    if (value === true) out[key as keyof TripChecklistState["notNeeded"]] = true;
  }
  return out;
}

export async function getTripChecklist(tripId: string): Promise<TripChecklistState> {
  const all = await readAll();
  return coerceChecklistState(all[tripId]);
}

/** Every trip's state at once — for a hub-level "what is outstanding" view. */
export async function getAllChecklists(): Promise<AllChecklistState> {
  const all = await readAll();
  const out: AllChecklistState = {};
  for (const [id, v] of Object.entries(all)) out[id] = coerceChecklistState(v);
  return out;
}

/**
 * Merge a patch into one trip's state and save.
 *
 * Read-modify-write on a single row, so two people editing DIFFERENT trips at
 * the same instant can still clobber each other. Acceptable at five trips and
 * one person doing the booking; it is the first thing that breaks if travel
 * gets busy, and the fix is the real table described at the top of this file.
 */
export async function saveTripChecklist(
  tripId: string,
  patch: Partial<TripChecklistState>
): Promise<TripChecklistState> {
  const all = await readAll();
  const current = coerceChecklistState(all[tripId]);
  const next: TripChecklistState = {
    ticks: { ...current.ticks, ...(patch.ticks ?? {}) },
    visit: { ...current.visit, ...(patch.visit ?? {}) },
    reimbursement: patch.reimbursement ?? current.reimbursement,
    // Merged from what is IN THE DATABASE, not from a client's copy, so the
    // request-details panel and the checklist panel can hold their own state
    // without either one clobbering the other's half of the row.
    notNeeded: pruneNotNeeded({ ...current.notNeeded, ...(patch.notNeeded ?? {}) })
  };
  all[tripId] = next;
  await writeAll(all);
  return next;
}

/** Drop a trip's state entirely — used when a trip is deleted. */
export async function clearTripChecklist(tripId: string): Promise<void> {
  const all = await readAll();
  if (!(tripId in all)) return;
  delete all[tripId];
  await writeAll(all);
}
