import { getSendRecord } from "./onboarding-email";
import { getContactsSendRecord } from "./contacts-email";
import { getSupervisorContactSendRecord } from "./supervisor-contact-email";
import { getTaskSendMap, taskSendsByHire, type TaskSendRecord } from "./task-email";

// "Has this app actually emailed this person for this step?"
//
// WHY THIS EXISTS. Every send button used to answer that question with the
// CHECKLIST TICK, which does not answer it at all. A step ticked by hand looked
// exactly like one the app had emailed — same "Resend email" label — and on
// 2026-09-09 that cost real confidence: she reported the PRD Access email as sent
// when it had not been, because the row said Resend. The tick on that row predated
// the template being wired up by half an hour.
//
// The tick and the send are genuinely different facts and both are worth keeping.
// A step can legitimately be done without the app sending anything — she does the
// PRD request to ITS by hand, and that SHOULD tick the step. What must not happen
// is the app claiming the credit.
//
// components/orientation/OrientationEmailPanel.tsx already had this right; its
// sentTemplateKeys carries the comment "Absent = ticked by hand". This module is
// that idea, for the four buttons on the people side, in one place so the fifth
// one cannot be written without it.

export type HireSendStatus = {
  /** ISO timestamp of the send, or null when this app has never sent it. */
  onboarding: string | null;
  contacts: string | null;
  supervisor: string | null;
  /** taskKey -> ISO timestamp, for steps wired to a Front template. */
  tasks: Record<string, string>;
};

export const EMPTY_SEND_STATUS: HireSendStatus = {
  onboarding: null,
  contacts: null,
  supervisor: null,
  tasks: {}
};

function at(rec: { sentAt?: string } | null | undefined): string | null {
  return rec?.sentAt ?? null;
}

/** What this app has actually sent one hire. Four small reads, one page load. */
export async function getHireSendStatus(hireId: string): Promise<HireSendStatus> {
  const [onboarding, contacts, supervisor, taskMap] = await Promise.all([
    getSendRecord(hireId).catch(() => null),
    getContactsSendRecord(hireId).catch(() => null),
    getSupervisorContactSendRecord(hireId).catch(() => null),
    getTaskSendMap().catch(() => ({}) as Record<string, TaskSendRecord>)
  ]);
  return {
    onboarding: at(onboarding),
    contacts: at(contacts),
    supervisor: at(supervisor),
    tasks: taskSendsByHire(taskMap)[hireId] ?? {}
  };
}

/**
 * Task-email sends for MANY hires at once — hireId -> taskKey -> ISO timestamp.
 *
 * The post-onboard grid renders a send button per wired check-in per person, so
 * this is deliberately one read for the whole grid rather than one per button.
 */
export async function getTaskSendsByHire(): Promise<Record<string, Record<string, string>>> {
  try {
    return taskSendsByHire(await getTaskSendMap());
  } catch {
    // A send log that cannot be read must not take the page down with it. The
    // buttons then say "Send", which is the safe way to be wrong: it invites a
    // check rather than claiming something already happened.
    return {};
  }
}
