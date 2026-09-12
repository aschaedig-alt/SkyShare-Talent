"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { maybeArchiveOnCheckinsComplete } from "@/lib/data/onboarding";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { hasPermission, isRoleName } from "@/lib/auth/roles";
import { getOrientationChannelId, ORIENTATION_CHANNEL_ADDRESS } from "@/lib/front/config";
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
import {
  buildSupervisorContactEmail,
  getSupervisorContactSendRecord,
  getSupervisorContactTemplate,
  recordSupervisorContactSend,
  resolveSupervisorContactTargets,
  setSupervisorContactTemplate,
  type SupervisorContactEmailPreview,
  type SupervisorContactSendRecord,
  type SupervisorContactTargets,
  type SupervisorContactTemplate,
} from "@/lib/front/supervisor-contact-email";

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
export async function sendOnboardingEmail(hireId: string, bodyOverride?: string | null): Promise<SendResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHire(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };

  try {
    const email = await buildOnboardingEmail(hire, bodyOverride);
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
      edited: email.edited,
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
export async function sendContactsEmail(hireId: string, bodyOverride?: string | null): Promise<ContactsSendResult> {
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
    email = await buildContactsEmail(hire, bodyOverride);
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
      edited: email.edited,
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

/** `test` is true when this was a dry run to hrotasks@ rather than a real send.
 *  The caller MUST read it: a test must not tick the grid cell optimistically and
 *  must not be described to her as a delivered email. */
export type TaskEmailSendResult = SendResult & { warnings?: string[]; test?: boolean };

async function loadTaskForEmail(hireId: string, taskKey: string) {
  return prisma.onboardingTask.findFirst({
    where: { newHireId: hireId, key: taskKey },
    select: { id: true, label: true, status: true },
  });
}

/** Build (but do not send) a task's email, plus whether one already went out. */
export async function previewTaskEmail(
  hireId: string,
  taskKey: string,
  /** Preview a DIFFERENT template for this send. Per-send only; see buildTaskEmail. */
  templateOverride?: string | null
): Promise<TaskEmailPreviewResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHire(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };
  const task = await loadTaskForEmail(hireId, taskKey);

  try {
    const [preview, alreadySent] = await Promise.all([
      buildTaskEmail(hire, taskKey, task?.label ?? taskKey, null, templateOverride),
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
 *
 * opts.test is "send it to me first" — her ask, 2026-09-10: "it should be
 * addressed to the name, in this case Axel, but send the test to
 * hrotasks@skyshare.com always. then if i like it i can send to the candidate."
 *
 * That works because the greeting is built from the HIRE'S NAME and not from the
 * recipient address (lib/front/task-email.ts), so swapping the address after
 * buildTaskEmail() has returned leaves "Hi Axel," exactly where it was. What
 * arrives in hrotasks@ is the real email, addressed to the real person, delivered
 * somewhere safe.
 *
 * A test skips all three of this function's side effects — no tick, no
 * auto-archive, no send record — because every one of them is a claim that the
 * person was emailed, and none of them would be true. It also drops cc entirely:
 * the send guard only lets a message through untouched when EVERY recipient is an
 * internal automation mailbox (lib/front/send-guard.ts), so one human in cc would
 * push a test back onto the redirect path and change what was actually sent.
 */
export async function sendTaskEmail(
  hireId: string,
  taskKey: string,
  bodyOverride?: string | null,
  opts?: { test?: boolean; templateOverride?: string | null }
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
    email = await buildTaskEmail(hire, taskKey, task?.label ?? taskKey, bodyOverride, opts?.templateOverride);
    channelId = await getOrientationChannelId();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the email." };
  }

  // The one place the addresses are decided. Everything below reads these and
  // never email.to/cc/subject again — if the guard, the recorded label and the
  // Front payload could disagree, the record would lie about what was sent.
  const asTest = opts?.test === true;
  const intendedLabel = email.to.join(", ") || "nobody";
  const toList = asTest ? [ORIENTATION_CHANNEL_ADDRESS] : email.to;
  const ccList = asTest ? [] : email.cc;
  // Several tests for several people land in the same shared inbox, so the subject
  // has to say which one this is and who it would really have gone to.
  const subject = asTest ? `[TEST — would have gone to ${intendedLabel}] ${email.subject}` : email.subject;

  // Outside production every recipient is rewritten to FRONT_TEST_INBOX and the
  // send still succeeds — so without asking, this would record the hire's real
  // address and tick the task for a message they never received.
  const guard = guardDecision({ to: toList, cc: ccList, subject });
  // Front takes the array; everything that READS a recipient afterwards — the send
  // record, SendResult.to, the dialog's confirmation line — has always held a
  // single string, and widening all three for a case that is one address almost
  // every time buys nothing. So the array goes to Front and this goes everywhere
  // else.
  const toLabel = toList.join(", ");

  // STEP 2 — the irreversible one, alone in its own try. Nothing else may share
  // it: a failure in the bookkeeping below must never be reported as "Send
  // failed", because that reads as "nothing went out" and invites a second REAL
  // send.
  let sent: SentMessage;
  try {
    sent = await sendEmail(channelId, {
      to: toList,
      cc: ccList,
      subject,
      // email.html is the greeting + body, unchanged by the test path. That is the
      // whole point: what lands in hrotasks@ is the email the person would get.
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

  // A test addressed only to hrotasks@ comes back "internal", which is not a
  // caveat — it is the mode that means the message went exactly where it was
  // addressed, in dev and in production alike. Saying "not the production
  // environment" about it would be noise on top of the warning below.
  if (guard.mode !== "production" && !(asTest && guard.mode === "internal")) {
    warnings.push(
      `This is not the production environment, so the message was ${guard.mode === "redirected" ? "redirected to the test inbox" : `handled as "${guard.mode}"`} rather than delivered to ${toLabel}.`
    );
  }

  if (asTest) {
    // Loud, and on a success, because the whole failure mode here is a test that
    // is mistaken for the real send.
    warnings.push(
      `Test send. It went to ${ORIENTATION_CHANNEL_ADDRESS} with a [TEST] subject line, not to ${intendedLabel}. The checklist item was not ticked and nothing was recorded, so this does not count as sent — send it for real when the wording looks right.`
    );
  }

  // Everything below is a claim that the person was emailed. None of it is true
  // for a test, so a test writes none of it.
  if (!asTest) {
    try {
      await recordTaskSend(hireId, taskKey, {
        conversationId: sent.conversationId,
        messageId: sent.id,
        sentAt,
        to: toLabel,
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
      // A post-onboarding check-in completed by SENDING its email has to behave the
      // same as one completed by clicking its box, and clicking the box goes through
      // /api/onboarding-tasks/[id], which calls this. Without it, sending the last
      // outstanding check-in would tick it and then leave the employee sitting on
      // the Post-onboard list forever with nothing left to do.
      if (ticked.count > 0) await maybeArchiveOnCheckinsComplete(hireId);
    } catch {
      warnings.push("The email went out, but the checklist item could not be ticked.");
    }
  }

  return {
    ok: true,
    test: asTest,
    conversationId: sent.conversationId,
    sentAt,
    to: toLabel,
    warnings: warnings.length ? warnings : undefined,
  };
}

// ---------------------------------------------------------------------------
// Sending the new hire's OWN contact details TO their supervisors.
//
// The reverse of the contacts-link send above, asked for 2026-09-10. Same
// two-step preview-then-send shape as the other three and for the same reason:
// it is irreversible and lands in a real person's inbox. Two things about it are
// different, and both are on purpose.
//
// THE RECIPIENT IS NOT THE HIRE. It is their one or two supervisors, resolved by
// the same resolver the orientation supervisors digest uses, so a hire LINKED to
// a supervisor record always mails that supervisor's current address.
//
// THE TEMPLATE IS PICKED IN THE DIALOG. No template has been written for this
// email yet, so unlike contacts-email.ts there is no rsp_ id in the source to
// hard-code. The chosen one is remembered in a WorkspaceSetting, which means the
// step starts working the day the template exists rather than the day somebody
// ships a release.

const SUPERVISOR_CONTACT_TASK_KEY = "supervisor_contact_sent";

export type SupervisorContactPreviewResult = {
  /** False only for a hard stop — no permission, no such hire, no supervisor on
   *  file, or nothing worth disclosing. Front trouble leaves this TRUE and
   *  reports itself in templateError, so the dialog can still offer the picker
   *  that fixes it. */
  ok: boolean;
  error?: string;
  /** Who it would go to and exactly what it would disclose. Resolved without
   *  Front, so it is present even when no template has been chosen yet. */
  targets?: SupervisorContactTargets;
  /** The template saved for this step, or null when none is. */
  template?: SupervisorContactTemplate | null;
  /** Only set when reading the template from Front failed. */
  templateError?: string;
  preview?: SupervisorContactEmailPreview;
  alreadySent?: SupervisorContactSendRecord | null;
};

// Same shape as SendResult plus warnings: once the email has gone, a failure in
// the bookkeeping is a caveat on a success, never a failure. Reporting it as a
// failure is what invites a duplicate real send.
export type SupervisorContactSendResult = SendResult & { warnings?: string[] };

/**
 * A sibling of loadHire rather than a widening of it: three other actions use
 * that one and none of them needs the supervisor relations or the card fields.
 */
async function loadHireForSupervisorEmail(hireId: string) {
  return prisma.newHire.findUnique({
    where: { id: hireId },
    select: {
      id: true,
      name: true,
      position: true,
      businessCardTitle: true,
      phone: true,
      ssEmail: true,
      supervisorName: true,
      supervisorEmail: true,
      supervisorHire: { select: { name: true, ssEmail: true, personalEmail: true } },
      supervisor2Name: true,
      supervisor2Email: true,
      supervisor2Hire: { select: { name: true, ssEmail: true, personalEmail: true } },
    },
  });
}

/** Remember which Front template this step sends, for every hire from now on. */
export async function chooseSupervisorContactTemplate(
  templateId: string,
  templateName: string
): Promise<{ ok: boolean; error?: string }> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to change this." };
  }
  try {
    await setSupervisorContactTemplate({ templateId, templateName });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not save the template." };
  }
}

/**
 * Build (but do not send) the supervisor email, plus whether one already went out.
 *
 * `template` overrides the saved one for this preview only — it is what makes the
 * in-dialog picker live: choosing a template re-previews with it straight away,
 * before anything is committed.
 */
export async function previewSupervisorContactEmail(
  hireId: string,
  template?: SupervisorContactTemplate | null
): Promise<SupervisorContactPreviewResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHireForSupervisorEmail(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };

  let targets: SupervisorContactTargets;
  try {
    targets = resolveSupervisorContactTargets(hire);
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not work out who this would go to.",
    };
  }

  const chosen = template ?? (await getSupervisorContactTemplate());
  const alreadySent = await getSupervisorContactSendRecord(hireId);
  if (!chosen) return { ok: true, targets, template: null, alreadySent };

  try {
    const preview = await buildSupervisorContactEmail(hire, null, chosen);
    return { ok: true, targets, template: chosen, preview, alreadySent };
  } catch (err) {
    // The recipients and the card are still good — only Front failed. Keeping ok
    // true leaves the picker on screen, which is the thing that fixes a template
    // that was deleted or renamed.
    return {
      ok: true,
      targets,
      template: chosen,
      alreadySent,
      templateError: err instanceof Error ? err.message : "Could not read the template from Front.",
    };
  }
}

/**
 * Send it. Rebuilds from the same code path the preview used, so what was
 * approved is what goes out — including re-reading the live Front template, so an
 * edit made in Front between preview and send is not silently ignored.
 *
 * `template` is the one the dialog previewed, passed back explicitly rather than
 * re-read from the setting: if saving the choice failed, the message she read is
 * still the message that leaves.
 */
export async function sendSupervisorContactEmail(
  hireId: string,
  bodyOverride?: string | null,
  template?: SupervisorContactTemplate | null
): Promise<SupervisorContactSendResult> {
  if (!(await canEditPeople())) {
    return { ok: false, error: "You don't have permission to send this email." };
  }
  const hire = await loadHireForSupervisorEmail(hireId);
  if (!hire) return { ok: false, error: "New hire not found." };

  // STEP 1 — everything that can still be retried safely. A throw here means
  // nothing left the building.
  let email: SupervisorContactEmailPreview;
  let channelId: string;
  try {
    email = await buildSupervisorContactEmail(hire, bodyOverride, template);
    channelId = await getOrientationChannelId();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the email." };
  }

  // Outside production every recipient is rewritten to FRONT_TEST_INBOX, and the
  // send still succeeds — so without asking, this would record the supervisor's
  // real address and tick the task for a message they never received.
  const guard = guardDecision({ to: email.to, cc: email.cc, subject: email.subject });
  // Front takes the array; everything that READS a recipient afterwards — the send
  // record, SendResult.to, the dialog's confirmation line — holds a single string,
  // exactly as sendTaskEmail does it for the same reason.
  const toLabel = email.to.join(", ");

  // STEP 2 — the irreversible one, alone in its own try. Nothing else may share
  // it: a failure in the bookkeeping below must never be reported as "Send
  // failed", because that reads as "nothing went out" and invites a second REAL
  // send — of somebody's personal mobile number.
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
  const warnings: string[] = [...email.warnings];

  if (guard.mode !== "production") {
    warnings.push(
      `This is not the production environment, so the message was ${guard.mode === "redirected" ? "redirected to the test inbox" : `handled as "${guard.mode}"`} rather than delivered to ${toLabel}.`
    );
  }

  try {
    await recordSupervisorContactSend(hireId, {
      conversationId: sent.conversationId,
      messageId: sent.id,
      sentAt,
      to: toLabel,
      sentBy: await actorLabel(),
      mode: guard.mode,
      edited: email.edited,
      templateName: email.templateName,
    });
  } catch {
    warnings.push("The email went out, but the send record could not be saved — a re-send will not warn you.");
  }

  try {
    // Forward-only, same as the other sends: a send is evidence the step happened,
    // and we never un-tick from here.
    const ticked = await prisma.onboardingTask.updateMany({
      where: { newHireId: hireId, key: SUPERVISOR_CONTACT_TASK_KEY, status: { not: "DONE" } },
      data: { status: "DONE", completedAt: new Date() },
    });
    // count 0 means either already done, or NO SUCH TASK ROW — which is the state
    // every hire predating the checklist item is in. Claiming "marked done" for a
    // row that does not exist is how a no-op reads as success.
    if (ticked.count === 0) {
      const exists = await prisma.onboardingTask.count({
        where: { newHireId: hireId, key: SUPERVISOR_CONTACT_TASK_KEY },
      });
      if (exists === 0) {
        warnings.push(
          "This hire has no supervisor-contact checklist item, so nothing was ticked. Their onboarding started before the item existed."
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
    to: toLabel,
    warnings: warnings.length ? warnings : undefined,
  };
}
