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
        select: {
          id: true,
          name: true,
          ssEmail: true,
          personalEmail: true,
          supervisorName: true,
          supervisorEmail: true,
          supervisor2Name: true,
          supervisor2Email: true,
          // The linked supervisors' live contact details win over the typed
          // fallback, so a changed address follows automatically.
          supervisorHire: { select: { name: true, ssEmail: true, personalEmail: true } },
          supervisor2Hire: { select: { name: true, ssEmail: true, personalEmail: true } }
        }
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
        to: email.to.join(", "),
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

    return { ok: true, conversationId: sent.conversationId, sentAt, to: email.to.join(", ") };
  } catch (err) {
    // Surface the real Front error — a 4xx here usually means a missing address or
    // a scope the token wasn't granted, and both need a human, not a retry.
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }
}

// --- sending to several attendees at once -----------------------------------
//
// Sending the invitation one person at a time meant seven dialogs for one
// session, which is how a step gets skipped. These do the same work in a batch.
//
// Each attendee is still built and sent INDIVIDUALLY — a batch is a loop, not a
// single email with seven recipients. That matters: the templates open "Hi
// <first name>," and the supervisors template goes to a different person entirely,
// so one combined message would be wrong for everybody in it.

export type OrientationBatchRow = {
  attendeeId: string;
  name: string;
  /** Where it would go / went. Empty when the row can't be sent. */
  to: string[];
  cc: string[];
  warnings: string[];
  /** Non-null when this attendee can't be emailed at all (no address, no supervisor). */
  error?: string;
  alreadySent: boolean;
};

export type OrientationBatchPreview = {
  ok: boolean;
  error?: string;
  rows?: OrientationBatchRow[];
  /** One representative rendering, so the body can be read once rather than N times. */
  sampleSubject?: string;
  sampleHtml?: string;
  sampleFor?: string;
};

/** Build every email in the batch WITHOUT sending, so the whole run can be
    approved at once — including who is going to be skipped and why. */
export async function previewOrientationEmailBatch(
  attendeeIds: string[],
  key: OrientationTemplateKey
): Promise<OrientationBatchPreview> {
  if (!(await canSend())) return { ok: false, error: "You don't have permission to send this email." };
  if (!attendeeIds.length) return { ok: false, error: "Nobody selected." };

  const rows: OrientationBatchRow[] = [];
  let sampleSubject: string | undefined;
  let sampleHtml: string | undefined;
  let sampleFor: string | undefined;

  for (const attendeeId of attendeeIds) {
    const a = await loadAttendee(attendeeId);
    if (!a) {
      rows.push({ attendeeId, name: "(not found)", to: [], cc: [], warnings: [], error: "Attendee not found.", alreadySent: false });
      continue;
    }
    const alreadySent = parseKeys(a.sentTemplateKeys).includes(key);
    try {
      const preview = await buildOrientationEmail(key, a.newHire, {
        date: a.session.date.toISOString(),
        endsAt: a.session.endsAt ? a.session.endsAt.toISOString() : null,
        location: a.session.location
      });
      rows.push({
        attendeeId,
        name: a.newHire.name,
        to: preview.to,
        cc: preview.cc,
        warnings: preview.warnings,
        alreadySent
      });
      if (!sampleHtml) {
        sampleSubject = preview.subject;
        sampleHtml = preview.html;
        sampleFor = a.newHire.name;
      }
    } catch (err) {
      // One unsendable person must not sink the batch — show why and carry on.
      rows.push({
        attendeeId,
        name: a.newHire.name,
        to: [],
        cc: [],
        warnings: [],
        error: err instanceof Error ? err.message : "Couldn't build the email.",
        alreadySent
      });
    }
  }

  return { ok: true, rows, sampleSubject, sampleHtml, sampleFor };
}

export type OrientationBatchSendResult = {
  ok: boolean;
  error?: string;
  sent?: { attendeeId: string; name: string; to: string }[];
  failed?: { attendeeId: string; name: string; error: string }[];
};

/**
 * Send to everyone selected, one at a time, continuing past failures.
 *
 * Sequential rather than parallel on purpose: Front is rate-limited, and a burst
 * of sends that trips a 429 halfway would leave the batch in a state nobody can
 * reason about. Slower and completely legible beats faster and ambiguous when the
 * side effect is real email.
 */
export async function sendOrientationEmailBatch(
  attendeeIds: string[],
  key: OrientationTemplateKey
): Promise<OrientationBatchSendResult> {
  if (!(await canSend())) return { ok: false, error: "You don't have permission to send this email." };
  if (!attendeeIds.length) return { ok: false, error: "Nobody selected." };

  const sent: { attendeeId: string; name: string; to: string }[] = [];
  const failed: { attendeeId: string; name: string; error: string }[] = [];

  for (const attendeeId of attendeeIds) {
    const a = await loadAttendee(attendeeId);
    const name = a?.newHire.name ?? "(not found)";
    // Reuses the single send wholesale, so a batch send and a one-off send are
    // literally the same code path — including the tick and the send record.
    const res = await sendOrientationEmail(attendeeId, key);
    if (res.ok) sent.push({ attendeeId, name, to: res.to ?? "" });
    else failed.push({ attendeeId, name, error: res.error ?? "Send failed." });
  }

  return { ok: true, sent, failed };
}
