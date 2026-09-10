import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity/logger";

/**
 * Keep a person's business-card status in step with their onboarding checklist.
 *
 * Marking "Order business card" as N/A means exactly one thing — this person
 * isn't getting cards. Without this, they stayed parked in the Business cards
 * page's "Needs cards" bucket forever, so the outstanding list quietly filled up
 * with people nobody was ever going to order for.
 *
 * DELIBERATELY NARROW — it only ever moves between states where nothing has
 * physically happened yet:
 *
 *   NEEDED     --(task set to N/A)-->      NOT_NEEDED
 *   NOT_NEEDED --(task set back to TODO)-> NEEDED
 *   NEEDED     --(task set to DONE)-->     QUEUED       (added 2026-09-09)
 *   QUEUED     --(task set back to TODO)-> NEEDED
 *
 * The DONE pair is what she asked for: she wants to tick the checklist item once
 * somebody is on the list for the next print order, before it has been placed.
 * Until now ticking it changed nothing here, so they stayed in the outstanding
 * bucket and kept triggering the order-by reminder while the checklist claimed
 * the step was finished.
 *
 * ORDERED and RECEIVED are left alone in every direction. A card that has gone to
 * the printer or has physically arrived is a fact about the world, and a checklist
 * tick shouldn't erase it — those people also aren't in the outstanding bucket, so
 * there's no problem to solve there. In particular DONE must not drag ORDERED
 * backwards to QUEUED, which is why the transitions are matched on the CURRENT
 * status and not just on the task status.
 */

export const BUSINESS_CARD_TASK_KEY = "business_card";

export type CardSyncResult = { from: string; to: string; hireName: string } | null;

export async function syncCardStatusFromChecklist(
  newHireId: string,
  taskKey: string,
  taskStatus: string
): Promise<CardSyncResult> {
  if (taskKey !== BUSINESS_CARD_TASK_KEY) return null;

  const hire = await prisma.newHire.findUnique({
    where: { id: newHireId },
    select: { id: true, name: true, businessCardStatus: true }
  });
  if (!hire) return null;

  const current = hire.businessCardStatus;
  let next: string | null = null;
  if (taskStatus === "NA" && current === "NEEDED") next = "NOT_NEEDED";
  else if (taskStatus === "NA" && current === "QUEUED") next = "NOT_NEEDED";
  else if (taskStatus === "DONE" && current === "NEEDED") next = "QUEUED";
  else if (taskStatus === "TODO" && current === "QUEUED") next = "NEEDED";
  else if (taskStatus !== "NA" && current === "NOT_NEEDED") next = taskStatus === "DONE" ? "QUEUED" : "NEEDED";

  if (!next) return null;

  await prisma.newHire.update({ where: { id: hire.id }, data: { businessCardStatus: next } });
  await logActivity({
    activityType: "CANDIDATE_EDITED",
    description: `Business card status ${current} → ${next} for ${hire.name} (checklist set to ${taskStatus})`,
    entityType: "NewHire",
    entityId: hire.id,
    metadata: { source: "checklist-sync", taskKey, taskStatus, from: current, to: next }
  });

  return { from: current, to: next, hireName: hire.name };
}
