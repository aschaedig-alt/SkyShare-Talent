"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { hasPermission, isRoleName } from "@/lib/auth/roles";
import { getOrientationChannelId } from "@/lib/front/config";
import { sendEmail } from "@/lib/front/messages";
import {
  buildOnboardingEmail,
  getSendRecord,
  recordSend,
  type OnboardingEmailPreview,
  type SendRecord,
} from "@/lib/front/onboarding-email";

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
