import { prisma } from "@/lib/prisma";
import { getMilestoneCatalog } from "@/lib/data/onboarding-milestones";

// The orientation grid's CREDIT CARD and IPAD columns FOLLOW the hire's own
// onboarding checklist, where the checklist has the step.
//
// They used to keep their own record (OrientationAttendee.cardReady / ipadReady,
// plus the not-needed map in lib/orientation/card-state.ts) that nothing tied to
// the checklist. So the two disagreed: on the Sep 29 session every credit-card
// circle was open, while the checklist had two of those six people marked N/A
// and one DONE. Her feedback of that morning: "a lot of these credit cards are
// n/a on the individual checklists but it shows a bubble to check off here. i
// dont think it should show here if its n/a".
//
// Now the checklist step is the one truth when it exists: the grid shows its
// state, and a click on the grid writes the step (and the attendee's own flag,
// which stays honest for anything that still reads it). A hire with no such step
// keeps the old behaviour, so nothing that worked before stops working.
//
// WHICH STEPS. Both are CUSTOM milestones she created, so their keys carry a
// random suffix (custom_received_company_credit_card_ba8a1346). They are found
// by the key's stable start - a label edit keeps the key - or by the label, and
// on 2026-09-29 each matched exactly one of the 23 steps in the catalog. If the
// step is ever removed, nothing matches and the grid falls back to its own flag.

export type ChecklistFlagState = "TODO" | "DONE" | "NA";
export type ChecklistFlag = "card" | "ipad";

export function isChecklistFlagState(v: unknown): v is ChecklistFlagState {
  return v === "TODO" || v === "DONE" || v === "NA";
}

const MATCH: Record<ChecklistFlag, { keyStart: string; label: RegExp }> = {
  card: { keyStart: "custom_received_company_credit_card", label: /credit\s*card/i },
  ipad: { keyStart: "custom_received_ipad", label: /\bipad\b/i }
};

/** The checklist step each column follows, or null when the catalog has none. */
export async function orientationChecklistKeys(): Promise<Record<ChecklistFlag, string | null>> {
  const catalog = await getMilestoneCatalog();
  const find = (flag: ChecklistFlag) => {
    const { keyStart, label } = MATCH[flag];
    return (catalog.find((m) => m.key.startsWith(keyStart)) ?? catalog.find((m) => label.test(m.label)))?.key ?? null;
  };
  return { card: find("card"), ipad: find("ipad") };
}

/** Per hire, the state of each linked step - only for hires whose checklist has it. */
export async function getChecklistFlags(hireIds: string[]): Promise<Map<string, Partial<Record<ChecklistFlag, ChecklistFlagState>>>> {
  const out = new Map<string, Partial<Record<ChecklistFlag, ChecklistFlagState>>>();
  if (hireIds.length === 0) return out;
  const keys = await orientationChecklistKeys();
  const wanted = [keys.card, keys.ipad].filter((k): k is string => Boolean(k));
  if (wanted.length === 0) return out;
  const tasks = await prisma.onboardingTask.findMany({
    where: { newHireId: { in: hireIds }, key: { in: wanted } },
    select: { newHireId: true, key: true, status: true }
  });
  for (const task of tasks) {
    if (!isChecklistFlagState(task.status)) continue;
    const flag: ChecklistFlag = task.key === keys.card ? "card" : "ipad";
    out.set(task.newHireId, { ...(out.get(task.newHireId) ?? {}), [flag]: task.status });
  }
  return out;
}

/**
 * Write one step from the orientation grid. Returns whether the hire's checklist
 * had the step. Both steps are custom milestones, so none of the side effects the
 * checklist's own route runs for particular built-in keys (offer steps, business
 * cards, check-in archiving - app/api/onboarding-tasks/[id]/route.ts) apply.
 */
export async function setChecklistFlag(newHireId: string, flag: ChecklistFlag, state: ChecklistFlagState): Promise<boolean> {
  const key = (await orientationChecklistKeys())[flag];
  if (!key) return false;
  const result = await prisma.onboardingTask.updateMany({
    where: { newHireId, key },
    data: { status: state, completedAt: state === "DONE" ? new Date() : null }
  });
  return result.count > 0;
}
