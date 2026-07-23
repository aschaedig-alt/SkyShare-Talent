"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { isAuthRequired } from "@/lib/auth/auth-config";
import { hasPermission, isRoleName } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { getOrientationChannelId } from "@/lib/front/config";
import { sendEmail } from "@/lib/front/messages";
import {
  buildOrientationEmail,
  recordOrientationSend,
  orientationTemplate,
  type OrientationEmailPreview,
  type OrientationTemplateKey
} from "@/lib/front/orientation-email";

// Sending an orientation email. Two steps on purpose — preview, then send —
// because the send is irreversible and lands in a real new hire's (or their
// supervisor's) inbox. Mirrors app/people/actions.ts for the onboarding email;
// the difference is that the recipient here is per ATTENDEE on a session, and
// which template is being sent decides who it actually goes to.
//
// The "emailed" tick is set BY a confirmed send, never the other way round, so a
// tick always reflects something that really happened.

export type OrientationPreviewResult = {
  ok: boolean;
  error?: string;
  preview?: OrientationEmailPreview;
  /** True if this template was already marked sent for this attendee. */
  alreadySent?: boolean;
};

export type OrientationSendResult = {
  ok: boolean;
  error?: string;
  conversationId?: string;
  sentAt?: string;
  to?: string;
};

async function canSend(): Promise<boolean> {
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

function parseKeys(json: string): string[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** The attendee plus the session they're attending — everything the email needs. */
async function loadAttendee(attendeeId: string) {
  return prisma.orientationAttendee.findUnique({
    where: { id: attendeeId },
    select: {
      id: true,
      sentTemplateKeys: true,
      newHire: {
        select: { id: true, name: true, ssEmail: true, personalEmail: true, supervisorName: true, supervisorEmail: true }
      },
      session: { select: { id: true, date: true, endsAt: true, location: true } }
    }
  });
}

/** Build (but do not send) the exact email, so it can be approved first. */
export async function previewOrientationEmail(
  attendeeId: string,
  key: OrientationTemplateKey,
  /** Redirect to one address and drop all cc — see buildOrientationEmail. */
  testTo?: string | null
): Promise<OrientationPreviewResult> {
  if (!(await canSend())) return { ok: false, error: "You don't have permission to send this email." };
  const a = await loadAttendee(attendeeId);
  if (!a) return { ok: false, error: "Attendee not found." };

  try {
    const preview = await buildOrientationEmail(key, a.newHire, {
      date: a.session.date.toISOString(),
      endsAt: a.session.endsAt ? a.session.endsAt.toISOString() : null,
      location: a.session.location
    }, testTo);
    return { ok: true, preview, alreadySent: parseKeys(a.sentTemplateKeys).includes(key) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't build the email." };
  }
}

/**
 * Rebuild the email and actually send it. Rebuilding (rather than trusting a
 * preview passed back from the browser) means what was approved is what goes out
 * and nothing in between can have tampered with it.
 */
export async function sendOrientationEmail(
  attendeeId: string,
  key: OrientationTemplateKey,
  testTo?: string | null
): Promise<OrientationSendResult> {
  if (!(await canSend())) return { ok: false, error: "You don't have permission to send this email." };
  const a = await loadAttendee(attendeeId);
  if (!a) return { ok: false, error: "Attendee not found." };

  try {
    orientationTemplate(key); // rejects an unknown key before anything is sent
    const email = await buildOrientationEmail(key, a.newHire, {
      date: a.session.date.toISOString(),
      endsAt: a.session.endsAt ? a.session.endsAt.toISOString() : null,
      location: a.session.location
    }, testTo);
    const channelId = await getOrientationChannelId();

    const sent = await sendEmail(channelId, {
      to: email.to,
      cc: email.cc,
      subject: email.subject,
      body: email.html,
      // Stay visible in the hrotasks@ inbox the team watches rather than
      // auto-archiving, which is Front's default.
      archive: false
    });

    const sentAt = new Date().toISOString();

    // A TEST send is not a send. It never records against the attendee and never
    // ticks the grid — otherwise testing would leave the board claiming a real
    // new hire had been emailed when they hadn't.
    if (!testTo?.trim()) {
      await recordOrientationSend(attendeeId, key, {
        conversationId: sent.conversationId,
        messageId: sent.id,
        sentAt,
        to: email.to,
        sentBy: await actorLabel()
      });

      // Tick the grid. Forward-only: a send is evidence it happened, and we never
      // un-tick from here (the checkbox itself still toggles by hand).
      const keys = parseKeys(a.sentTemplateKeys);
      if (!keys.includes(key)) {
        await prisma.orientationAttendee.update({
          where: { id: attendeeId },
          data: { sentTemplateKeys: JSON.stringify([...keys, key]) }
        });
      }
    }

    return { ok: true, conversationId: sent.conversationId, sentAt, to: email.to };
  } catch (err) {
    // Surface the real Front error — a 4xx here usually means a missing address or
    // a scope the token wasn't granted, and both need a human, not a retry.
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }
}
