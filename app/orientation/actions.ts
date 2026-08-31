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
  buildSupervisorDigestEmail,
  recordOrientationSend,
  resolveSupervisors,
  orientationTemplate,
  type OrientationEmailPreview,
  type OrientationTemplateKey,
  type SupervisorDigest
} from "@/lib/front/orientation-email";
import {
  buildOrientationSummaryEmail,
  getOrientationSummaryRecord,
  recordOrientationSummary
} from "@/lib/front/orientation-summary";
import { ORIENTATION_NORMAL } from "@/lib/orientation/calendar-event";

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
      session: { select: { id: true, date: true, endsAt: true, location: true, address: true } }
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
      location: a.session.location,
      address: a.session.address
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
      location: a.session.location,
      address: a.session.address
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
        cc: email.cc.join(", "),
        subject: email.subject,
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
        location: a.session.location,
        address: a.session.address
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

// --- the one internal summary ------------------------------------------------
//
// Replaces the standing list being cc'd on every per-hire email. On the first real
// run that meant six watchers x six invitations, about forty redundant emails for a
// seven-person cohort. Now they get one email naming everyone attending.

export type OrientationSummaryResult = {
  ok: boolean;
  error?: string;
  to?: string[];
  subject?: string;
  html?: string;
  warnings?: string[];
  /** Set when it has already gone, so the UI can offer a resend rather than a send. */
  alreadySent?: { sentAt: string; to: string; attendeeCount: number } | null;
  /** True when attendees were added after the summary went — it is now out of date. */
  stale?: boolean;
};

async function summaryInputFor(sessionId: string) {
  const s = await prisma.orientationSession.findUnique({
    where: { id: sessionId },
    select: {
      date: true,
      endsAt: true,
      address: true,
      attendees: {
        select: {
          id: true,
          sentTemplateKeys: true,
          newHire: {
            select: {
              name: true,
              position: true,
              supervisorName: true,
              supervisorEmail: true,
              supervisorHire: { select: { name: true, ssEmail: true, personalEmail: true } },
              supervisor2Name: true,
              supervisor2Email: true,
              supervisor2Hire: { select: { name: true, ssEmail: true, personalEmail: true } }
            }
          }
        },
        orderBy: { newHire: { name: "asc" } }
      }
    }
  });
  if (!s) return null;

  return {
    sessionDate: s.date.toISOString(),
    endsAt: s.endsAt ? s.endsAt.toISOString() : null,
    // Same fallback the calendar invite uses, so the two can't disagree on where it is.
    address: s.address?.trim() || ORIENTATION_NORMAL.address,
    attendees: s.attendees.map((a) => ({
      name: a.newHire.name,
      position: a.newHire.position,
      supervisorNames: resolveSupervisors(a.newHire)
        .map((x) => x.name)
        .filter((n): n is string => Boolean(n)),
      invited: parseKeys(a.sentTemplateKeys).includes("invite")
    }))
  };
}

export async function previewOrientationSummary(sessionId: string): Promise<OrientationSummaryResult> {
  if (!(await canSend())) return { ok: false, error: "You don't have permission to send this email." };
  const input = await summaryInputFor(sessionId);
  if (!input) return { ok: false, error: "Session not found." };

  try {
    const preview = await buildOrientationSummaryEmail(input);
    const record = await getOrientationSummaryRecord(sessionId);
    return {
      ok: true,
      to: preview.to,
      subject: preview.subject,
      html: preview.html,
      warnings: preview.warnings,
      alreadySent: record ? { sentAt: record.sentAt, to: record.to, attendeeCount: record.attendeeCount } : null,
      stale: record ? record.attendeeCount !== input.attendees.length : false
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Couldn't build the summary." };
  }
}

export async function sendOrientationSummary(sessionId: string): Promise<OrientationSummaryResult> {
  if (!(await canSend())) return { ok: false, error: "You don't have permission to send this email." };
  const input = await summaryInputFor(sessionId);
  if (!input) return { ok: false, error: "Session not found." };

  try {
    const email = await buildOrientationSummaryEmail(input);
    const channelId = await getOrientationChannelId();
    const sent = await sendEmail(channelId, {
      to: email.to,
      cc: [],
      subject: email.subject,
      body: email.html,
      archive: false
    });
    await recordOrientationSummary(sessionId, {
      conversationId: sent.conversationId,
      messageId: sent.id,
      sentAt: new Date().toISOString(),
      to: email.to.join(", "),
      subject: email.subject,
      sentBy: await actorLabel(),
      attendeeCount: input.attendees.length
    });
    return { ok: true, to: email.to, subject: email.subject };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }
}

// --- supervisors, grouped ----------------------------------------------------
//
// The per-attendee path sends one email per NEW HIRE, so a supervisor covering
// four of them got four near-identical emails. These group by supervisor: one
// email each, naming everyone they cover.

export type SupervisorDigestRow = {
  supervisorEmail: string;
  supervisorName: string | null;
  hireNames: string[];
  attendeeIds: string[];
  to: string[];
  cc: string[];
  warnings: string[];
  error?: string;
  /** True when every attendee this covers already had the supervisors email. */
  allAlreadySent: boolean;
};

export type SupervisorBatchPreview = {
  ok: boolean;
  error?: string;
  rows?: SupervisorDigestRow[];
  /** Attendees with no supervisor at all — they simply have nobody to tell. */
  noSupervisor?: string[];
  sampleSubject?: string;
  sampleHtml?: string;
  sampleFor?: string;
};

/** Collapse the selected attendees into one entry per individual supervisor. */
async function buildDigests(attendeeIds: string[]) {
  const rows = await prisma.orientationAttendee.findMany({
    where: { id: { in: attendeeIds } },
    select: {
      id: true,
      sentTemplateKeys: true,
      newHire: {
        select: {
          name: true,
          supervisorName: true,
          supervisorEmail: true,
          supervisorHire: { select: { name: true, ssEmail: true, personalEmail: true } },
          supervisor2Name: true,
          supervisor2Email: true,
          supervisor2Hire: { select: { name: true, ssEmail: true, personalEmail: true } }
        }
      },
      session: { select: { date: true, endsAt: true, location: true, address: true } }
    }
  });

  const byEmail = new Map<string, SupervisorDigest & { alreadySent: boolean[] }>();
  const noSupervisor: string[] = [];

  for (const r of rows) {
    const sups = resolveSupervisors(r.newHire).filter((s) => s.email);
    if (sups.length === 0) {
      noSupervisor.push(r.newHire.name);
      continue;
    }
    const already = parseKeys(r.sentTemplateKeys).includes("supervisors");
    for (const s of sups) {
      const key = s.email!.toLowerCase();
      const found = byEmail.get(key);
      if (found) {
        if (!found.hireNames.includes(r.newHire.name)) {
          found.hireNames.push(r.newHire.name);
          found.attendeeIds.push(r.id);
          found.alreadySent.push(already);
        }
      } else {
        byEmail.set(key, {
          supervisorEmail: s.email!,
          supervisorName: s.name,
          hireNames: [r.newHire.name],
          attendeeIds: [r.id],
          alreadySent: [already]
        });
      }
    }
  }

  const session = rows[0]?.session;
  return { digests: [...byEmail.values()], noSupervisor, session };
}

export async function previewOrientationSupervisorBatch(attendeeIds: string[]): Promise<SupervisorBatchPreview> {
  if (!(await canSend())) return { ok: false, error: "You don't have permission to send this email." };
  if (!attendeeIds.length) return { ok: false, error: "Nobody selected." };

  const { digests, noSupervisor, session } = await buildDigests(attendeeIds);
  if (!session) return { ok: false, error: "Session not found." };
  if (!digests.length) {
    return { ok: false, error: "None of the selected attendees have a supervisor on file." };
  }

  const sessionForEmail = {
    date: session.date.toISOString(),
    endsAt: session.endsAt ? session.endsAt.toISOString() : null,
    location: session.location,
    address: session.address
  };

  const out: SupervisorDigestRow[] = [];
  let sampleSubject: string | undefined;
  let sampleHtml: string | undefined;
  let sampleFor: string | undefined;

  for (const d of digests) {
    try {
      const preview = await buildSupervisorDigestEmail(d, sessionForEmail);
      out.push({
        supervisorEmail: d.supervisorEmail,
        supervisorName: d.supervisorName,
        hireNames: d.hireNames,
        attendeeIds: d.attendeeIds,
        to: preview.to,
        cc: preview.cc,
        warnings: preview.warnings,
        allAlreadySent: d.alreadySent.every(Boolean)
      });
      if (!sampleHtml) {
        sampleSubject = preview.subject;
        sampleHtml = preview.html;
        sampleFor = d.supervisorName ?? d.supervisorEmail;
      }
    } catch (err) {
      out.push({
        supervisorEmail: d.supervisorEmail,
        supervisorName: d.supervisorName,
        hireNames: d.hireNames,
        attendeeIds: d.attendeeIds,
        to: [],
        cc: [],
        warnings: [],
        error: err instanceof Error ? err.message : "Couldn't build the email.",
        allAlreadySent: d.alreadySent.every(Boolean)
      });
    }
  }

  return { ok: true, rows: out, noSupervisor, sampleSubject, sampleHtml, sampleFor };
}

export type SupervisorBatchSendResult = {
  ok: boolean;
  error?: string;
  sent?: { supervisorEmail: string; hireNames: string[]; attendeeIds: string[] }[];
  failed?: { supervisorEmail: string; error: string }[];
};

/**
 * One email per supervisor. Ticks the supervisors template for EVERY attendee the
 * email covered — the fact being recorded is "this hire's supervisor was told",
 * and one email can satisfy that for several hires at once.
 */
export async function sendOrientationSupervisorBatch(
  supervisorEmails: string[],
  attendeeIds: string[]
): Promise<SupervisorBatchSendResult> {
  if (!(await canSend())) return { ok: false, error: "You don't have permission to send this email." };
  if (!supervisorEmails.length) return { ok: false, error: "Nobody selected." };

  const { digests, session } = await buildDigests(attendeeIds);
  if (!session) return { ok: false, error: "Session not found." };
  const wanted = new Set(supervisorEmails.map((e) => e.toLowerCase()));
  const chosen = digests.filter((d) => wanted.has(d.supervisorEmail.toLowerCase()));

  const sessionForEmail = {
    date: session.date.toISOString(),
    endsAt: session.endsAt ? session.endsAt.toISOString() : null,
    location: session.location,
    address: session.address
  };

  const sent: SupervisorBatchSendResult["sent"] = [];
  const failed: SupervisorBatchSendResult["failed"] = [];
  const channelId = await getOrientationChannelId();
  const actor = await actorLabel();

  for (const d of chosen) {
    try {
      const email = await buildSupervisorDigestEmail(d, sessionForEmail);
      const res = await sendEmail(channelId, {
        to: email.to,
        cc: email.cc,
        subject: email.subject,
        body: email.html,
        archive: false
      });
      const sentAt = new Date().toISOString();

      for (const attendeeId of d.attendeeIds) {
        await recordOrientationSend(attendeeId, "supervisors", {
          conversationId: res.conversationId,
          messageId: res.id,
          sentAt,
          to: email.to.join(", "),
          cc: email.cc.join(", "),
          subject: email.subject,
          sentBy: actor
        });
        const row = await prisma.orientationAttendee.findUnique({
          where: { id: attendeeId },
          select: { sentTemplateKeys: true }
        });
        const keys = parseKeys(row?.sentTemplateKeys ?? "[]");
        if (!keys.includes("supervisors")) {
          await prisma.orientationAttendee.update({
            where: { id: attendeeId },
            data: { sentTemplateKeys: JSON.stringify([...keys, "supervisors"]) }
          });
        }
      }
      sent.push({ supervisorEmail: d.supervisorEmail, hireNames: d.hireNames, attendeeIds: d.attendeeIds });
    } catch (err) {
      failed.push({ supervisorEmail: d.supervisorEmail, error: err instanceof Error ? err.message : "Send failed." });
    }
  }

  return { ok: true, sent, failed };
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
