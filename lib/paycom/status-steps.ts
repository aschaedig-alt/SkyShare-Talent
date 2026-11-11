import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity/logger";
import { INVITE_SOURCE } from "@/lib/paycom/interview-invites";

/**
 * Paycom status steps that never happened — Aimee's rule, 2026-11-11 (feedback cmwclez9e).
 *
 * WHY. Paycom emails an invite whenever a candidate is moved to an interview step, and the
 * scan records each invite as an interview (lib/paycom/interview-invites.ts). But Paycom makes
 * her advance THROUGH steps that did not happen — "Pilot - Additional Interview" when no second
 * interview was needed — so a bare step showed up in the interview and notes history as an
 * interview that never took place. Her words: "if the interview didnt happen, i dont want to
 * see it in the interview history or notes history ... generally its any without any notes."
 *
 * THE RULE (the project skill .claude/skills/paycom-status-steps/SKILL.md is the long form).
 * A step recorded from a Paycom invite stays only when there is evidence it happened:
 *   - it is still upcoming, or inside its grace window (the step's Mountain day and the next) —
 *     notes are written that day, so it is judged only after that;
 *   - someone wrote on the row itself in the app (notes, outcome, rating, a scorecard,
 *     a next step, an interviewer);
 *   - a note or a write-up was made for that candidate on the step's Mountain day or the day
 *     after — a Paycom note (filed as a note or as a write-up interview), a hand-typed
 *     write-up, a manual note. System notes (sweeps, intake) are not evidence.
 *   - it is an HR Interview step (Calendly screens on Aimee's own calendar, unreadable here);
 *   - a non-cancelled event for that candidate on the SkyShare Recruiting calendar that day, or
 *     that calendar has no events that month (it cannot vouch), or it could not be read.
 * A missing note alone is NOT enough: the calendar cross-check found most no-note steps were real
 * interviews nobody wrote up, and he approved removing only those with no calendar event either.
 * Everything else is a step she clicked past, and it is removed. A write-up that arrives LATER
 * is not lost: the note scan files it as its own interview (source "paycom-note"), so the
 * history still shows the conversation — just not an empty step with a date on it.
 *
 * Removal is a delete with a full snapshot of each row, so an undo puts back exactly the same
 * row (same id). The scheduled scan only acts on Paycom emails it has not logged yet, so a
 * removed step is not recreated by it.
 */

export const STEP_RULE_VERSION = "2026-11-11b";

/** The shared "SkyShare Recruiting" Google calendar, where hiring-team interviews are booked. */
export const RECRUITING_CALENDAR_ID = "c_f7e82cf2276ed74f71db4781741bff720b8ed1cc76c7e27498f29058d50a30fa@group.calendar.google.com";
const HR_STEP = /^HR\s+Interview$/i;

/** Note sources written by the system, not a person — never evidence an interview happened. */
const SYSTEM_NOTE_SOURCES = new Set(["system", "open-candidate-sweep", "resume-intake"]);
/** Interview sources that are NOT a record of a conversation (the steps themselves, demo rows). */
const NON_EVIDENCE_INTERVIEW_SOURCES = new Set([INVITE_SOURCE, "seed-demo"]);

const mtDay = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const nextDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export type StepVerdict = "keep" | "remove";
export type StepPlan = {
  interviewId: string;
  candidateId: string;
  candidate: string;
  step: string;
  /** The step's Mountain date. */
  date: string;
  status: string;
  verdict: StepVerdict;
  why: string;
  /** What counted as evidence, when kept for a note. */
  evidence?: string;
};

type Snapshot = Record<string, unknown> & { id: string };

/**
 * Judge every Paycom-invite step (or the given candidates' steps). Read only.
 * `now` decides which steps are still inside their grace window.
 */
export async function planStatusSteps(
  opts: { now?: Date; candidateIds?: string[]; calendar?: RecruitingEvent[] | null } = {}
): Promise<StepPlan[]> {
  const now = opts.now ?? new Date();
  const today = mtDay(now);
  const steps = await prisma.interview.findMany({
    where: { source: INVITE_SOURCE, ...(opts.candidateIds ? { candidateId: { in: opts.candidateIds } } : {}) },
    orderBy: { startDateTime: "asc" },
    select: {
      id: true, candidateId: true, title: true, status: true, startDateTime: true,
      notes: true, notesHtml: true, outcome: true, rating: true, nextStep: true, interviewer: true, interviewerEmail: true,
      candidate: { select: { displayName: true } },
      _count: { select: { scorecards: true } }
    }
  });
  const ids = [...new Set(steps.map((s) => s.candidateId))];
  const [writeUps, notes] = await Promise.all([
    prisma.interview.findMany({
      where: { candidateId: { in: ids }, NOT: { source: { in: [...NON_EVIDENCE_INTERVIEW_SOURCES] } } },
      select: { candidateId: true, startDateTime: true, source: true, title: true }
    }),
    prisma.candidateNote.findMany({
      where: { candidateId: { in: ids } },
      select: { candidateId: true, createdAt: true, source: true, body: true }
    })
  ]);
  const evidenceBy = new Map<string, Array<{ day: string; what: string }>>();
  const add = (cid: string, day: string, what: string) => evidenceBy.set(cid, [...(evidenceBy.get(cid) ?? []), { day, what }]);
  for (const w of writeUps) add(w.candidateId, mtDay(w.startDateTime), `write-up "${w.title}" (${w.source ?? "typed"})`);
  for (const n of notes) {
    if (SYSTEM_NOTE_SOURCES.has(n.source ?? "")) continue;
    add(n.candidateId, mtDay(n.createdAt), `note "${n.body.split("\n")[0].slice(0, 60)}" (${n.source ?? "typed"})`);
  }

  // The calendar. Paycom application ids per candidate match an event by the application link
  // in its description; otherwise by the candidate's first and last name in its title.
  const cal = opts.calendar ?? null;
  const appIds = new Map<string, string[]>();
  if (cal) {
    const apps = await prisma.candidateApplication.findMany({
      where: { candidateId: { in: ids }, sourceApplicationId: { not: null } },
      select: { candidateId: true, sourceApplicationId: true }
    });
    for (const a of apps) appIds.set(a.candidateId, [...(appIds.get(a.candidateId) ?? []), a.sourceApplicationId!]);
  }
  const coveredMonths = new Set((cal ?? []).map((e) => e.day.slice(0, 7)));
  const words = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z ]/g, " ").split(/\s+/).filter((w) => w.length > 1);

  return steps.map((s) => {
    const day = mtDay(s.startDateTime);
    const step = s.title.replace(/\s*\(Paycom\)$/, "");
    const base = {
      interviewId: s.id, candidateId: s.candidateId, candidate: s.candidate.displayName,
      step, date: day, status: s.status
    };
    const ownWork =
      s.notes?.trim() || s.notesHtml?.trim() || s.outcome || s.rating != null || s.nextStep?.trim() || s.interviewer || s.interviewerEmail || s._count.scorecards;
    if (ownWork) return { ...base, verdict: "keep" as const, why: "written on in the app" };
    if (day >= today || nextDay(day) >= today) return { ...base, verdict: "keep" as const, why: "upcoming or inside its grace window" };
    const hit = (evidenceBy.get(s.candidateId) ?? []).find((e) => e.day === day || e.day === nextDay(day));
    if (hit) return { ...base, verdict: "keep" as const, why: "a note or write-up that day", evidence: hit.what };
    // HR screens are Calendly bookings on Aimee's own calendar, which the app cannot read; a
    // spot check of Sep-Oct 2025 found every one confirmed. Kept (her yes, 2026-11-11).
    if (HR_STEP.test(step)) return { ...base, verdict: "keep" as const, why: "HR phone screen (Calendly, on Aimee's own calendar)" };
    if (!cal) return { ...base, verdict: "keep" as const, why: "calendar not checked" };
    if (!coveredMonths.has(day.slice(0, 7))) return { ...base, verdict: "keep" as const, why: "the Recruiting calendar has no events that month, cannot cross-check" };
    const name = words(s.candidate.displayName);
    const ev = cal.find((e) => {
      if (e.day !== day || e.cancelled) return false;
      if ((appIds.get(s.candidateId) ?? []).some((id) => e.description.includes(`application/${id}`))) return true;
      const t = words(e.summary);
      return name.length >= 2 && t.includes(name[0]) && t.includes(name[name.length - 1]);
    });
    if (ev) return { ...base, verdict: "keep" as const, why: "on the Recruiting calendar that day", evidence: `event "${ev.summary}"` };
    return {
      ...base,
      verdict: "remove" as const,
      why: s.status === "CANCELLED" ? "cancelled in Paycom, no note, not on the calendar" : "no note and not on the Recruiting calendar"
    };
  });
}

/** One event on the SkyShare Recruiting calendar, as the rule needs it. */
export type RecruitingEvent = { day: string; summary: string; description: string; cancelled: boolean };

/**
 * Read the SkyShare Recruiting calendar (where every hiring-team interview is booked) with the
 * app's service account. Returns null when it cannot be read — and a null calendar makes the
 * rule keep every step, so a Google outage can never remove anything.
 */
export async function fetchRecruitingCalendar(since = new Date("2025-01-01T00:00:00Z")): Promise<RecruitingEvent[] | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? "").replace(/\\n/g, "\n");
  if (!email || !key) return null;
  try {
    const { google } = await import("googleapis");
    const auth = new google.auth.JWT({ email, key, scopes: ["https://www.googleapis.com/auth/calendar.readonly"] });
    const client = google.calendar({ version: "v3", auth });
    const out: RecruitingEvent[] = [];
    let pageToken: string | undefined;
    do {
      const r = await client.events.list({
        calendarId: RECRUITING_CALENDAR_ID, timeMin: since.toISOString(), timeMax: new Date().toISOString(),
        singleEvents: true, showDeleted: true, maxResults: 2500, pageToken
      });
      for (const e of r.data.items ?? []) {
        const start = e.start?.dateTime ?? (e.start?.date ? `${e.start.date}T12:00:00Z` : null);
        if (!start) continue;
        out.push({ day: mtDay(new Date(start)), summary: e.summary ?? "", description: e.description ?? "", cancelled: e.status === "cancelled" });
      }
      pageToken = r.data.nextPageToken ?? undefined;
    } while (pageToken);
    return out;
  } catch {
    return null;
  }
}

/** Remove the given steps (only rows still from Paycom invites and still bare). Returns the undo snapshot. */
export async function removeStatusSteps(plans: StepPlan[], opts: { runBy?: string | null } = {}): Promise<Snapshot[]> {
  const ids = plans.filter((p) => p.verdict === "remove").map((p) => p.interviewId);
  if (!ids.length) return [];
  // Re-read at write time: only bare invite rows. Anything somebody wrote on since the plan stays.
  const rows = (await prisma.interview.findMany({
    where: {
      id: { in: ids }, source: INVITE_SOURCE,
      notes: null, notesHtml: null, outcome: null, rating: null, interviewer: null, interviewerEmail: null,
      scorecards: { none: {} }
    }
  })) as unknown as Snapshot[];
  if (!rows.length) return [];
  await prisma.interview.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, source: INVITE_SOURCE } });
  const byCandidate = new Map<string, number>();
  for (const r of rows) byCandidate.set(String(r.candidateId), (byCandidate.get(String(r.candidateId)) ?? 0) + 1);
  for (const [candidateId, n] of byCandidate) {
    await logActivity({
      userEmail: opts.runBy ?? undefined,
      activityType: "CANDIDATE_EDITED",
      description: `Removed ${n} Paycom status step${n === 1 ? "" : "s"} with no note (an interview that did not happen)`,
      entityType: "Candidate",
      entityId: candidateId,
      metadata: { source: "paycom-status-steps", rule: STEP_RULE_VERSION, interviewIds: rows.filter((r) => r.candidateId === candidateId).map((r) => r.id) }
    });
  }
  return rows;
}

/** Put removed steps back exactly as they were (same ids). Skips any id that exists again. */
export async function restoreStatusSteps(rows: Snapshot[]): Promise<number> {
  if (!rows.length) return 0;
  const DATE_FIELDS = ["startDateTime", "endDateTime", "lastSyncedAt", "createdAt", "updatedAt"];
  const data = rows.map((r) => {
    const o: Record<string, unknown> = { ...r };
    for (const f of DATE_FIELDS) if (typeof o[f] === "string") o[f] = new Date(o[f] as string);
    return o;
  });
  const r = await prisma.interview.createMany({ data: data as never, skipDuplicates: true });
  return r.count;
}
