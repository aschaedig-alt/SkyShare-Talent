// "Scheduled" and "Requested" — a checklist step that is not finished yet but has
// nothing left for anybody to DO, so it must not keep a hire from reading as done.
//
// Asked for 2026-11-13: "if a new hire's checklist is complete outside of
// attending orientation i would like them to be considered done." Modelled on the
// business card's "On the next order": the row says where it stands in a word,
// and the hire is not held up by it.
//
//   Attended orientation  -> "Scheduled"  while they are on an UPCOMING session.
//                            Turns DONE by itself when the session is marked
//                            complete (completeOrientationSession).
//   Travel accommodations -> "Scheduled"  while an onboarding trip is BOOKED.
//                            Turns DONE when the trip is marked completed or the
//                            orientation session they attend is marked complete.
//   Received iPad /       -> "Requested"  for every pilot — a pilot always gets
//   company credit card                  both, so there is no decision to make.
//                            Ticked DONE as before, from the checklist or the
//                            orientation grid.
//
// THE STATUS STAYS TODO. Nothing here is stored: a hold is read from facts that
// already exist (the session roster, the trip, the position), so it cannot go
// stale — move someone off a session and the word goes with it. The stored
// status keeps meaning what it always meant, which is why no other reader of
// OnboardingTask.status had to change.
//
// This file imports nothing from the server, so the checklist component can
// share the exact rule the list and grid count with.

import { isPilotRole } from "@/lib/onboarding/role-defaults";

export type TaskHold = "Scheduled" | "Requested";

/** The facts a hold is read from, per hire. */
export type HoldFacts = {
  /** On an UPCOMING orientation session's roster. */
  onUpcomingSession: boolean;
  /** Has an onboarding-purpose trip at status BOOKED. */
  tripBooked: boolean;
};

export const NO_HOLD_FACTS: HoldFacts = { onUpcomingSession: false, tripBooked: false };

// The iPad and credit-card steps are CUSTOM milestones, so their keys carry a
// random suffix. Matched by the key's stable start, as the orientation grid does
// (lib/orientation/checklist-link.ts), with the label as the fallback.
const IPAD = { keyStart: "custom_received_ipad", label: /\bipad\b/i };
const CARD = { keyStart: "custom_received_company_credit_card", label: /credit\s*card/i };

export function isIpadTask(key: string, label?: string | null): boolean {
  return key.startsWith(IPAD.keyStart) || (key.startsWith("custom_") && IPAD.label.test(label ?? ""));
}
export function isCreditCardTask(key: string, label?: string | null): boolean {
  return key.startsWith(CARD.keyStart) || (key.startsWith("custom_") && CARD.label.test(label ?? ""));
}

/**
 * "Scheduled for orientation" was a separate custom step she added to say the
 * same thing the Attended orientation row now says by itself. It is folded into
 * that row: not shown on the checklist and not counted, so a hire does not carry
 * two rows for one thing. Removing the milestone from Manage tasks is still the
 * tidy end state; until then this keeps it out of the way.
 */
export function isFoldedTask(key: string): boolean {
  return key.startsWith("custom_scheduled_for_orientation");
}

type HoldTask = { key: string; label?: string | null; status: string };
type HoldHire = { position: string | null; department: string | null };

export function taskHold(task: HoldTask, hire: HoldHire, facts: HoldFacts): TaskHold | null {
  if (task.status !== "TODO") return null;
  if (task.key === "attended_orientation") return facts.onUpcomingSession ? "Scheduled" : null;
  if (task.key === "travel_complete") return facts.tripBooked ? "Scheduled" : null;
  if ((isIpadTask(task.key, task.label) || isCreditCardTask(task.key, task.label)) && isPilotRole(hire.position, hire.department)) {
    return "Requested";
  }
  return null;
}

/** Nothing left to do on this step: done, or held. N/A is decided separately. */
export function isHandled(status: string, hold: TaskHold | null): boolean {
  return status === "DONE" || hold !== null;
}
