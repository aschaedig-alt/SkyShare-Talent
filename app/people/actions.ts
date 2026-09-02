"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { hasPermission, isRoleName } from "@/lib/auth/roles";
import { getOrientationChannelId } from "@/lib/front/config";
import { sendEmail, type SentMessage } from "@/lib/front/messages";
import { guardDecision } from "@/lib/front/send-guard";
import {
  buildOnboardingEmail,
  getSendRecord,
  recordSend,
  type OnboardingEmailPreview,
  type SendRecord,
} from "@/lib/front/onboarding-email";
import {
  buildContactsEmail,
  getContactsSendRecord,
  recordContactsSend,
  type ContactsEmailPreview,
  type ContactsSendRecord,
} from "@/lib/front/contacts-email";
import {
  buildTaskEmail,
  getTaskSendRecord,
  recordTaskSend,
  type TaskEmailPreview,
  type TaskSendRecord,
} from "@/lib/front/task-email";

// Sending the "Start Your Onboarding Journey" email. This is deliberately a two-step
// action — preview, then send — because the send is irreversible and lands in a real
// new hire's inbox. The checklist task is ticked BY a confirmed send, rather than the
// checkbox triggering the send, so the tick always reflects something that happened.

const TASK_KEY = "onboarding_journey";

export type PreviewResult = {
  ok: boolean;
  error?: string;
  preview?: OnboardingEmailPreview;
  alreadySent?: SendRecord | null;
};

export type SendResult = {
  ok: boolean;
  error?: string;
  conversationId?: string;
  sentAt?: string;
  to?: string;
};

async function canEditPeople(): Promise<boolean> {
  if (!isAuthRequired()) return true;
  const session = await getServerSession(authOptions).catch(() => null);
  const role = session?.user?.role;
  return isRoleName(role) && hasPermission(role, "candidates:write");
}

async function actorLabel(): Promise<string | null> {
  if (!isAuthRequired()) return null;
  const session = await getServerSession(authOptions).catch(() => null);
  return session?.user?.email ?? session?.user?.name ?? null;
}

async function loadHire(hireId: string) {
  return prisma.newHire.findUnique({
    where: { id: hireId },
    select: { id: true, name: true, personalEmail: true, ssEmail: true },
  });
}

/** Build (but do not send) the email, plus whether one already went out. */
export async function previewOnboardingEmail(
  hireId: string
): Promise<PreviewResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHire(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };

  try {
    const [preview, alreadySent] = await Promise.all([
      buildOnboardingEmail(hire),
      getSendRecord(hireId),
    ]);
    return { ok: true, preview, alreadySent };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not build the email.",
    };
  }
}

/**
 * Actually send it. Rebuilds from the same code path the preview used so what was
 * approved is what goes out, then records the Front conversation and ticks the task.
 */
export async function sendOnboardingEmail(hireId: string): Promise<SendResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHire(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };

  try {
    const email = await buildOnboardingEmail(hire);
    const channelId = await getOrientationChannelId();

    const sent = await sendEmail(channelId, {
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      body: email.html,
      // Stay visible in the hrotasks@ inbox the team watches rather than
      // auto-archiving, which is Front's default.
      archive: false,
    });

    const sentAt = new Date().toISOString();
    await recordSend(hireId, {
      conversationId: sent.conversationId,
      messageId: sent.id,
      sentAt,
      to: email.to,
      sentBy: await actorLabel(),
    });

    // Forward-only, mirroring how a booked trip ticks travel_complete: a send is
    // evidence the step happened, but we never un-tick from here.
    await prisma.onboardingTask.updateMany({
      where: { newHireId: hireId, key: TASK_KEY, status: { not: "DONE" } },
      data: { status: "DONE", completedAt: new Date() },
    });

    return { ok: true, conversationId: sent.conversationId, sentAt, to: email.to };
  } catch (err) {
    // Surface the real Front error — a 4xx here usually means a missing address or a
    // scope the token wasn't granted, and both need a human, not a retry.
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Send failed.",
    };
  }
}

// ---------------------------------------------------------------------------
// Sending the contacts-link email. Same two-step preview-then-send shape as the
// onboarding email above and for the same reason: it is irreversible and lands in a
// real person's inbox. The difference worth knowing is WHEN — this one goes on the
// day of orientation, deliberately not with the welcome email, because a hire who
// has been offered and welcomed may still never start and the link hands over staff
// mobile numbers.

const CONTACTS_TASK_KEY = "contacts_link_sent";

// Same shape as SendResult plus warnings: once the email has gone, a failure in the
// bookkeeping is a caveat on a success, never a failure. Reporting it as a failure is
// what invites a duplicate real send.
export type ContactsSendResult = SendResult & { warnings?: string[] };

export type ContactsPreviewResult = {
  ok: boolean;
  error?: string;
  preview?: ContactsEmailPreview;
  alreadySent?: ContactsSendRecord | null;
};

/** Build (but do not send) the contacts email, plus whether one already went out. */
export async function previewContactsEmail(hireId: string): Promise<ContactsPreviewResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHire(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };

  try {
    const [preview, alreadySent] = await Promise.all([
      buildContactsEmail(hire),
      getContactsSendRecord(hireId),
    ]);
    return { ok: true, preview, alreadySent };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not build the email.",
    };
  }
}

/**
 * Send it. Rebuilds from the same code path the preview used, so what was approved is
 * what goes out — including re-reading the share token, so a rotation between preview
 * and send cannot ship a dead link.
 */
export async function sendContactsEmail(hireId: string): Promise<ContactsSendResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHire(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };

  // STEP 1 — everything that can still be retried safely. A throw here means
  // nothing left the building.
  let email: ContactsEmailPreview;
  let channelId: string;
  try {
    email = await buildContactsEmail(hire);
    channelId = await getOrientationChannelId();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the email." };
  }

  // Outside production every recipient is rewritten to FRONT_TEST_INBOX, and the
  // send still succeeds — so without asking, this would record the hire's real
  // address and tick the task for a message they never received.
  const guard = guardDecision({ to: email.to, cc: email.cc, subject: email.subject });

  // STEP 2 — the irreversible one, alone in its own try. Nothing else may share it:
  // a failure in the bookkeeping below must never be reported as "Send failed",
  // because that reads as "nothing went out" and invites a second REAL send.
  let sent: SentMessage;
  try {
    sent = await sendEmail(channelId, {
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      body: email.html,
      archive: false,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }

  // STEP 3 — bookkeeping. The email is already gone; from here every outcome is a
  // success with a caveat, never a failure.
  const sentAt = new Date().toISOString();
  const warnings: string[] = [];

  if (guard.mode !== "production") {
    warnings.push(
      `This is not the production environment, so the message was ${guard.mode === "redirected" ? "redirected to the test inbox" : `handled as "${guard.mode}"`} rather than delivered to ${email.to}.`
    );
  }

  try {
    await recordContactsSend(hireId, {
      conversationId: sent.conversationId,
      messageId: sent.id,
      sentAt,
      to: email.to,
      sentBy: await actorLabel(),
      mode: guard.mode,
    });
  } catch {
    warnings.push("The email went out, but the send record could not be saved — a re-send will not warn you.");
  }

  try {
    // Forward-only, same as the onboarding send: a send is evidence the step
    // happened, and we never un-tick from here.
    const ticked = await prisma.onboardingTask.updateMany({
      where: { newHireId: hireId, key: CONTACTS_TASK_KEY, status: { not: "DONE" } },
      data: { status: "DONE", completedAt: new Date() },
    });
    // count 0 means either already done, or NO SUCH TASK ROW — which is the state
    // every hire predating the checklist item is in. Claiming "marked done" for a
    // row that does not exist is how a no-op reads as success.
    if (ticked.count === 0) {
      const exists = await prisma.onboardingTask.count({
        where: { newHireId: hireId, key: CONTACTS_TASK_KEY },
      });
      if (exists === 0) {
        warnings.push(
          "This hire has no contacts-link checklist item, so nothing was ticked. Their onboarding started before the item existed."
        );
      }
    }
  } catch {
    warnings.push("The email went out, but the checklist item could not be ticked.");
  }

  return {
    ok: true,
    conversationId: sent.conversationId,
    sentAt,
    to: email.to,
    warnings: warnings.length ? warnings : undefined,
  };
}

// ---------------------------------------------------------------------------
// Sending the email attached to ANY checklist task.
//
// The two sends above are hand-built, one module and one button each. This one is
// configured rather than coded: whichever Front template she picked for the task
// in Manage tasks is the template it sends. Same two-step preview-then-send shape
// and the same reason — it is irreversible and lands in a real person's inbox —
// plus a body she can edit for one send, which the older two still do not have.

export type TaskEmailPreviewResult = {
  ok: boolean;
  error?: string;
  preview?: TaskEmailPreview;
  alreadySent?: TaskSendRecord | null;
};

export type TaskEmailSendResult = SendResult & { warnings?: string[] };

async function loadTaskForEmail(hireId: string, taskKey: string) {
  return prisma.onboardingTask.findFirst({
    where: { newHireId: hireId, key: taskKey },
    select: { id: true, label: true, status: true },
  });
}

/** Build (but do not send) a task's email, plus whether one already went out. */
export async function previewTaskEmail(
  hireId: string,
  taskKey: string
): Promise<TaskEmailPreviewResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHire(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };
  const task = await loadTaskForEmail(hireId, taskKey);

  try {
    const [preview, alreadySent] = await Promise.all([
      buildTaskEmail(hire, taskKey, task?.label ?? taskKey),
      getTaskSendRecord(hireId, taskKey),
    ]);
    return { ok: true, preview, alreadySent };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not build the email.",
    };
  }
}

/**
 * Send it. Rebuilds from the same code path the preview used, so what was approved
 * is what goes out — including re-reading the live Front template, so an edit made
 * in Front between preview and send is not silently ignored.
 *
 * bodyOverride is the wording she typed in the dialog. It applies to THIS SEND
 * ONLY: nothing is written back to Front, and the next send reads the template
 * fresh. An untouched body arrives here as null and is never sent back at all, so
 * the common case is byte-for-byte the template.
 */
export async function sendTaskEmail(
  hireId: string,
  taskKey: string,
  bodyOverride?: string | null
): Promise<TaskEmailSendResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHire(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };
  const task = await loadTaskForEmail(hireId, taskKey);

  // STEP 1 — everything that can still be retried safely. A throw here means
  // nothing left the building.
  let email: TaskEmailPreview;
  let channelId: string;
  try {
    email = await buildTaskEmail(hire, taskKey, task?.label ?? taskKey, bodyOverride);
    channelId = await getOrientationChannelId();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the email." };
  }

  // Outside production every recipient is rewritten to FRONT_TEST_INBOX and the
  // send still succeeds — so without asking, this would record the hire's real
  // address and tick the task for a message they never received.
  const guard = guardDecision({ to: email.to, cc: email.cc, subject: email.subject });

  // STEP 2 — the irreversible one, alone in its own try. Nothing else may share
  // it: a failure in the bookkeeping below must never be reported as "Send
  // failed", because that reads as "nothing went out" and invites a second REAL
  // send.
  let sent: SentMessage;
  try {
    sent = await sendEmail(channelId, {
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      body: email.html,
      archive: false,
    });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }

  // STEP 3 — bookkeeping. The email is already gone; from here every outcome is a
  // success with a caveat, never a failure.
  const sentAt = new Date().toISOString();
  const warnings: string[] = [];

  if (guard.mode !== "production") {
    warnings.push(
      `This is not the production environment, so the message was ${guard.mode === "redirected" ? "redirected to the test inbox" : `handled as "${guard.mode}"`} rather than delivered to ${email.to}.`
    );
  }

  try {
    await recordTaskSend(hireId, taskKey, {
      conversationId: sent.conversationId,
      messageId: sent.id,
      sentAt,
      to: email.to,
      sentBy: await actorLabel(),
      mode: guard.mode,
      edited: email.edited,
      templateName: email.templateName,
    });
  } catch {
    warnings.push("The email went out, but the send record could not be saved — a re-send will not warn you.");
  }

  try {
    // Forward-only, same as the other two sends: a send is evidence the step
    // happened, and we never un-tick from here.
    const ticked = await prisma.onboardingTask.updateMany({
      where: { newHireId: hireId, key: taskKey, status: { not: "DONE" } },
      data: { status: "DONE", completedAt: new Date() },
    });
    // count 0 means either already done, or NO SUCH TASK ROW — the state every
    // hire predating the checklist item is in. Claiming "marked done" for a row
    // that does not exist is how a no-op reads as success.
    if (ticked.count === 0 && !task) {
      warnings.push(
        "This hire has no checklist item with that name, so nothing was ticked. Their onboarding started before the item existed."
      );
    }
  } catch {
    warnings.push("The email went out, but the checklist item could not be ticked.");
  }

  return {
    ok: true,
    conversationId: sent.conversationId,
    sentAt,
    to: email.to,
    warnings: warnings.length ? warnings : undefined,
  };
}
