import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity/logger";
import { zonedWallClockToUtc } from "@/lib/booking/timezone";
import { extractIdentity, inviteDetails } from "@/lib/paycom/email-log";

/**
 * Paycom interview invites, recorded as interviews in the app.
 *
 * WHY. The app has no record of upcoming interviews, and Quality of Hire counts interviews
 * from a calendar file and from the app's own log (the larger of the two, per hire). Paycom
 * emails Aimee an invite for every interview it schedules:
 *
 *   Kyle Ferrin - PC-12 Captain
 *   When: September 23rd, 2025 10:45 AM - 11:15 AM Mountain Time (US and Canada)
 *   Where: Phone Screening
 *   Candidate: Kyle Ferrin (103834)            <- the Paycom APPLICATION id
 *   Requisition: Pilatus PC-12 Captain (1634)
 *   Step: HR Interview
 *
 * and a "Cancelled: HM Interview - Sagarin, Lawrence" when one is called off.
 *
 * WHAT ONE BECOMES. One Interview per (application, start time), source "paycom-invite", on
 * the application's job, dated by "When". An interview already on that candidate the same
 * day — typed by hand, or a Paycom note write-up — means it is already there, and nothing is
 * added (a hand-typed write-up is never touched). A start in the future is SCHEDULED; a past
 * one COMPLETED unless a cancellation for that person and requisition followed, which makes
 * it CANCELLED. Every row this creates carries source "paycom-invite", so an undo removes
 * exactly these and nothing else.
 */

export const INVITE_SOURCE = "paycom-invite";

const ZONES: Array<[RegExp, string]> = [
  [/mountain/i, "America/Denver"],
  [/arizona/i, "America/Phoenix"],
  [/central/i, "America/Chicago"],
  [/eastern/i, "America/New_York"],
  [/pacific/i, "America/Los_Angeles"],
  [/alaska/i, "America/Anchorage"],
  [/hawaii/i, "Pacific/Honolulu"]
];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

/** "September 23rd, 2025 10:45 AM - 11:15 AM Mountain Time (US and Canada)" -> UTC instants. */
export function parseWhen(when: string): { start: Date; end: Date | null; timeZone: string } | null {
  const m = when.match(/([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\s+(\d{1,2}):(\d{2})\s*([AP]M)(?:\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M))?/i);
  if (!m) return null;
  const month = MONTHS.indexOf(m[1].toLowerCase());
  if (month < 0) return null;
  const timeZone = ZONES.find(([re]) => re.test(when))?.[1] ?? "America/Denver";
  const h24 = (h: string, ap: string) => (Number(h) % 12) + (/pm/i.test(ap) ? 12 : 0);
  const start = zonedWallClockToUtc(Number(m[3]), month, Number(m[2]), h24(m[4], m[6]), Number(m[5]), timeZone);
  const end = m[7] ? zonedWallClockToUtc(Number(m[3]), month, Number(m[2]), h24(m[7], m[9]), Number(m[8]), timeZone) : null;
  return { start, end: end && end > start ? end : null, timeZone };
}

/** Paycom's workflow step -> the app's interview type. */
export function typeForStep(step: string | null): "RECRUITER_SCREEN" | "HIRING_MANAGER" | "OTHER" {
  const s = step ?? "";
  if (/\bHR\s+Interview\b/i.test(s)) return "RECRUITER_SCREEN";
  if (/\bHM\s+Interview\b|Hiring\s+Manager|Additional/i.test(s)) return "HIRING_MANAGER";
  return "OTHER";
}

export type Cancellation = { at: string; person: string | null; requisition: string | null; step?: string | null };

export type InvitePlan = {
  gmailId: string;
  person: string | null;
  paycomId: string | null;
  candidateId: string | null;
  start: string | null;
  type: string;
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED";
  location: string | null;
  action: "add" | "already-there" | "rescheduled" | "duplicate-invite" | "unreadable" | "not-in-app";
  why: string | null;
  interviewId?: string;
  /** A reschedule: the interview's values before this invite moved it, for undo. */
  update?: { id: string; before: { startDateTime: string; endDateTime: string | null; location: string | null; status: string } };
};

const nameKey = (s: string | null) => (s ?? "").toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");

/**
 * Plan (and, with apply, record) a batch of invites. Batched so duplicates inside the batch
 * — Paycom re-sends an invite when one is edited — collapse to one interview.
 */
export async function recordInvites(
  invites: Array<{ gmailId: string; at: string; subject: string; body: string | null }>,
  cancellations: Cancellation[],
  opts: { apply: boolean; runBy?: string | null; now?: Date; only?: Set<string> | null }
): Promise<InvitePlan[]> {
  const now = opts.now ?? new Date();
  const out: InvitePlan[] = [];
  const takenKeys = new Set<string>();

  // Each cancellation calls off ONE interview: the latest invite for that person (and step,
  // where the cancellation names one) sent before it. Matching every earlier invite would
  // cancel a recruiter screen because the hiring-team interview after it was called off.
  const cancelledIds = new Set<string>();
  const sorted = [...invites].sort((a, b) => a.at.localeCompare(b.at));
  for (const c of cancellations) {
    const match = sorted
      .filter((inv) => inv.at <= c.at)
      .filter((inv) => nameKey(extractIdentity("interview", inv.subject, inv.body).person) === nameKey(c.person))
      .filter((inv) => !c.step || typeForStep(inviteDetails(inv.body).step) === typeForStep(c.step))
      .at(-1);
    if (match) cancelledIds.add(match.gmailId);
  }
  // Cancellations are matched against EVERY invite above; only the chosen ones are recorded.
  for (const inv of invites.filter((i) => !opts.only || opts.only.has(i.gmailId))) {
    const id = extractIdentity("interview", inv.subject, inv.body);
    const d = inviteDetails(inv.body);
    const when = d.when ? parseWhen(d.when) : null;
    const plan: InvitePlan = {
      gmailId: inv.gmailId,
      person: id.person,
      paycomId: id.paycomId,
      candidateId: null,
      start: when?.start.toISOString() ?? null,
      type: typeForStep(d.step),
      status: "SCHEDULED",
      location: d.where && !/^join meeting/i.test(d.where) ? d.where.slice(0, 200) : d.where ? "Video" : null,
      action: "add",
      why: null
    };
    out.push(plan);
    if (!when || !id.paycomId) {
      plan.action = "unreadable";
      plan.why = !inv.body ? "the email body has not been read" : "no When line or application id in the invite";
      continue;
    }
    const app = await prisma.candidateApplication.findFirst({
      where: { sourceApplicationId: id.paycomId },
      select: { candidateId: true, jobId: true }
    });
    if (!app) {
      plan.action = "not-in-app";
      plan.why = `application ${id.paycomId} is not in the app`;
      continue;
    }
    plan.candidateId = app.candidateId;
    const key = `${id.paycomId}|${when.start.toISOString()}`;
    if (takenKeys.has(key)) {
      plan.action = "duplicate-invite";
      plan.why = "Paycom sent this invite more than once";
      continue;
    }
    takenKeys.add(key);

    plan.status = cancelledIds.has(inv.gmailId) ? "CANCELLED" : when.start > now ? "SCHEDULED" : "COMPLETED";

    // Already there: an interview on this candidate the same Mountain day.
    //  - Typed in the app, or a Paycom note write-up: that IS the interview (his rule,
    //    2026-11-06). Nothing is added and it is never touched.
    //  - Recorded from an earlier invite of the SAME step: Paycom re-sends an invite when the
    //    time moves, so the later-sent invite's time wins (the old one goes in the undo file).
    //  - Recorded from an invite of a DIFFERENT step: a second interview that day (a recruiter
    //    screen, then the hiring team), so it is added.
    const dayStart = new Date(when.start.getTime() - 14 * 3600_000);
    const dayEnd = new Date(when.start.getTime() + 14 * 3600_000);
    const sameDay = await prisma.interview.findMany({
      where: { candidateId: app.candidateId, startDateTime: { gte: dayStart, lte: dayEnd } },
      select: { id: true, source: true, interviewType: true, startDateTime: true, endDateTime: true, location: true, status: true }
    });
    const typed = sameDay.find((i) => i.source !== INVITE_SOURCE);
    if (typed) {
      plan.action = "already-there";
      plan.why = `an interview that day is already on the profile (${typed.source ?? "typed in the app"})`;
      plan.interviewId = typed.id;
      continue;
    }
    // The same start time is the same interview, whatever step label the invite carries.
    const sameTime = sameDay.find((i) => i.startDateTime.getTime() === when.start.getTime());
    if (sameTime) {
      plan.action = "already-there";
      plan.why = "recorded from this invite before";
      plan.interviewId = sameTime.id;
      continue;
    }
    const sameStep = sameDay.find((i) => i.interviewType === plan.type);
    if (sameStep) {
      plan.interviewId = sameStep.id;
      if (sameStep.startDateTime.getTime() === when.start.getTime()) {
        plan.action = "already-there";
        plan.why = "recorded from this invite before";
        continue;
      }
      const source = await prisma.activityLog.findFirst({
        where: { description: { startsWith: "Recorded a Paycom interview invite" }, metadata: { contains: sameStep.id } },
        select: { metadata: true }
      });
      const sourceGmail = source?.metadata ? (JSON.parse(source.metadata) as { gmailId?: string }).gmailId : undefined;
      const sourceAt = invites.find((i) => i.gmailId === sourceGmail)?.at;
      if (!sourceAt || sourceAt > inv.at) {
        plan.action = "already-there";
        plan.why = "a later invite for this interview is already recorded";
        continue;
      }
      plan.action = "rescheduled";
      plan.why = `rescheduled: moved from ${sameStep.startDateTime.toISOString()} by this later invite`;
      plan.update = {
        id: sameStep.id,
        before: { startDateTime: sameStep.startDateTime.toISOString(), endDateTime: sameStep.endDateTime?.toISOString() ?? null, location: sameStep.location, status: sameStep.status }
      };
      if (opts.apply) {
        await prisma.interview.updateMany({
          where: { id: sameStep.id, source: INVITE_SOURCE },
          data: { startDateTime: when.start, endDateTime: when.end, timezone: when.timeZone, location: plan.location, status: plan.status }
        });
        await logActivity({
          userEmail: opts.runBy ?? undefined,
          activityType: "CANDIDATE_EDITED",
          description: `Moved a Paycom interview for ${id.person ?? "a candidate"} to the rescheduled time (${d.when})`,
          entityType: "Candidate",
          entityId: app.candidateId,
          metadata: { interviewId: sameStep.id, paycomId: id.paycomId, gmailId: inv.gmailId, source: INVITE_SOURCE, movedFrom: plan.update.before.startDateTime }
        });
      }
      continue;
    }
    if (!opts.apply) continue;

    const created = await prisma.interview.create({
      data: {
        candidateId: app.candidateId,
        jobId: app.jobId,
        title: `${d.step ?? "Interview"} (Paycom)`.slice(0, 120),
        interviewType: plan.type,
        startDateTime: when.start,
        endDateTime: when.end,
        timezone: when.timeZone,
        location: plan.location,
        status: plan.status,
        source: INVITE_SOURCE
      },
      select: { id: true }
    });
    plan.interviewId = created.id;
    await logActivity({
      userEmail: opts.runBy ?? undefined,
      activityType: "CANDIDATE_EDITED",
      description: `Recorded a Paycom interview invite for ${id.person ?? "a candidate"} (${d.step ?? "interview"}, ${d.when})`,
      entityType: "Candidate",
      entityId: app.candidateId,
      metadata: { interviewId: created.id, paycomId: id.paycomId, gmailId: inv.gmailId, source: INVITE_SOURCE }
    });
  }
  return out;
}

/** Remove interviews this recorder created — only rows with its source. */
export async function undoInvites(interviewIds: string[]): Promise<number> {
  if (!interviewIds.length) return 0;
  const r = await prisma.interview.deleteMany({ where: { id: { in: interviewIds }, source: INVITE_SOURCE } });
  return r.count;
}

/**
 * A cancellation email arriving on its own (the scheduled scan): mark the interview it calls
 * off. The latest invite-recorded interview for that person, not already cancelled, whose step
 * matches where the cancellation names one. Returns the change for an undo file, or null.
 */
export async function cancelFromEmail(
  person: string | null,
  step: string | null,
  opts: { apply: boolean; runBy?: string | null }
): Promise<{ id: string; candidateId: string; before: NonNullable<InvitePlan["update"]>["before"] } | null> {
  if (!person) return null;
  const want = nameKey(person);
  const rows = await prisma.interview.findMany({
    where: { source: INVITE_SOURCE, NOT: { status: "CANCELLED" } },
    orderBy: { startDateTime: "desc" },
    select: { id: true, candidateId: true, interviewType: true, startDateTime: true, endDateTime: true, location: true, status: true, candidate: { select: { displayName: true } } }
  });
  const hit = rows.find((r) => nameKey(r.candidate.displayName) === want && (!step || r.interviewType === typeForStep(step)));
  if (!hit) return null;
  const before = { startDateTime: hit.startDateTime.toISOString(), endDateTime: hit.endDateTime?.toISOString() ?? null, location: hit.location, status: hit.status };
  if (opts.apply) {
    await prisma.interview.updateMany({ where: { id: hit.id, source: INVITE_SOURCE }, data: { status: "CANCELLED" } });
    await logActivity({
      userEmail: opts.runBy ?? undefined,
      activityType: "CANDIDATE_EDITED",
      description: `Marked a Paycom interview for ${hit.candidate.displayName} cancelled (Paycom cancellation email)`,
      entityType: "Candidate",
      entityId: hit.candidateId,
      metadata: { interviewId: hit.id, source: INVITE_SOURCE }
    });
  }
  return { id: hit.id, candidateId: hit.candidateId, before };
}

/** Put rescheduled interviews back to the time they had before. */
export async function undoReschedules(updates: NonNullable<InvitePlan["update"]>[]): Promise<number> {
  let n = 0;
  for (const u of updates) {
    const r = await prisma.interview.updateMany({
      where: { id: u.id, source: INVITE_SOURCE },
      data: {
        startDateTime: new Date(u.before.startDateTime),
        endDateTime: u.before.endDateTime ? new Date(u.before.endDateTime) : null,
        location: u.before.location,
        status: u.before.status
      }
    });
    n += r.count;
  }
  return n;
}
