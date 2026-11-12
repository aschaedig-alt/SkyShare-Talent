import { prisma } from "@/lib/prisma";
import { CANDIDATE_STATUS } from "@/lib/candidates/candidate-status";
import { isMergedAway } from "@/lib/candidates/merged-guard";
import { formatCalendarDay } from "@/lib/dates/display";

/**
 * Keep a candidate's record in step with the employee record they became.
 *
 * Asked for on 2026-11-11 (feedback cmwclwrfp + cmwclxn4v): "when an employee is
 * hired, automatically change the status to hired here" and "when someone is hired
 * or terminated, i want their candidate stage to be updated accordingly. or any
 * other stage change we know of moved."
 *
 * Before this nothing on the candidate moved when the hire did: a person moved to
 * onboarding sat at stage "Offer", status Active, forever; a terminated employee's
 * candidate still said Hired/Active, or Archived if they came from the Jazz import.
 *
 * THE RULE, read off every NewHire linked by candidateId (Model A: links, not one
 * Person table). The most current hire wins — working beats left beats canceled —
 * so a rehire is never shadowed by the record of their first stint:
 *
 *   employed (ACTIVE or CONTRACT, not canceled)
 *       status Current employee, stage Hired, held out of scans (skip list, reason HIRED),
 *       and the application that carried the offer goes to stage + status Hired.
 *   terminated
 *       status Former employee. Stage stays Hired — see FORMER_EMPLOYEE_STAGE.
 *       The application is left alone: they WERE hired for that job.
 *   canceled (offer fell through before day one)
 *       only undoes Current employee: status back to Inactive. The stage is left for a
 *       person to set, because "canceled" does not say whether they withdrew or
 *       the offer was pulled.
 *
 * PEOPLE WHO APPLIED AGAIN. Found in the 2026-11-11 dry run: current employees
 * apply internally (one was "In Hiring Process" for a C350 Captain seat, another
 * at Screening for a G200 seat), and a former employee can re-apply years later.
 * Their candidate stage is a LIVE application, so it is not overwritten:
 *   - employed, with an application dated after their start: status goes to
 *     Current employee, the stage they are at stays (Screening while it is live,
 *     Saved For Later when they were not chosen — his rule, 2026-11-11: "saved for
 *     later if they arent chosen for the position is good"), and the skip list is
 *     not touched.
 *   - terminated, with an application dated after their last day: they are an
 *     applicant again, so status and stage are both left alone.
 *
 * WHAT IT NEVER DOES
 *   - touch a MERGED tombstone (the keeper carries the link).
 *   - change archivedAt. The Jazz import marks history with archivedAt and the main
 *     list hides on it; who appears on which page is not this module's decision.
 *   - re-include anybody in scans. A former employee stays wherever the skip list
 *     already had them — whether to recruit somebody back is a person's call.
 *   - throw. A hire save must never fail because the candidate could not be moved.
 *
 * Every change writes one TimelineEvent on the candidate, saying what changed and
 * why, so the profile's history explains it.
 */

/**
 * The candidate stage a terminated employee is left at. "Hired" on purpose: the
 * stage is the pipeline OUTCOME and that outcome did happen. Reports count hires by
 * stage (quality-of-hire's hiredLike, the Hired bucket), so moving a leaver off it
 * would quietly remove them from "who did we hire". The employment ending is what
 * the status says. If a separate stage is ever wanted, change this one constant and
 * add the stage at /candidates/manage.
 */
export const FORMER_EMPLOYEE_STAGE = "Hired";
export const HIRED_STAGE = "Hired";
const HIRED_APP_STATUS = "Hired";

const SCAN_BY = "system:hire-lifecycle";

type HireRow = {
  id: string;
  name: string;
  position: string | null;
  employmentStatus: string;
  canceled: boolean;
  stage: string;
  startDate: Date | null;
  offerSignedDate: Date | null;
  terminationDate: Date | null;
  createdAt: Date;
};

export type LifecycleState = "EMPLOYED" | "TERMINATED" | "CANCELED";

export type CandidateSyncPlan = {
  candidateId: string;
  displayName: string;
  hireId: string;
  state: LifecycleState;
  /** Set when they applied again after the hire/termination — see above. */
  reapplied: null | { appliedAt: string; job: string | null };
  before: {
    status: string;
    stage: string | null;
    scanExcludedReason: string | null;
    scanExcludedNote: string | null;
    scanExcludedAt: string | null;
    scanExcludedBy: string | null;
  };
  /** Only the fields that change. Empty object = nothing to do on the candidate. */
  candidate: { status?: string; stage?: string; scanExcludedReason?: string; scanExcludedNote?: string; scanExcludedAt?: Date; scanExcludedBy?: string };
  application: null | {
    id: string;
    jobTitle: string | null;
    before: { stage: string | null; status: string | null };
    after: { stage: string; status: string };
  };
  /** Why no application was moved, when one might have been expected. */
  applicationSkipped: string | null;
  timeline: { type: string; title: string; detail: string; occurredAt: Date };
};

function stateOf(h: HireRow): LifecycleState {
  if (h.canceled) return "CANCELED";
  if (h.employmentStatus === "TERMINATED") return "TERMINATED";
  return "EMPLOYED";
}

const STATE_RANK: Record<LifecycleState, number> = { EMPLOYED: 3, TERMINATED: 2, CANCELED: 1 };

/** The hire that decides the candidate's state: most current state, then newest. */
function decidingHire(hires: HireRow[]): HireRow | null {
  if (hires.length === 0) return null;
  return [...hires].sort(
    (a, b) => STATE_RANK[stateOf(b)] - STATE_RANK[stateOf(a)] || b.createdAt.getTime() - a.createdAt.getTime()
  )[0];
}

const OFFER_RANK: Record<string, number> = { SIGNED: 5, SENT: 4, STARTED: 3 };

/**
 * Which application they were hired through. Only an application with an offer in
 * flight or signed counts — or the ONLY application, when there is just one.
 * Guessing between several jobs with no offer recorded could stamp Hired on the
 * wrong job, which is worse than leaving it for a person.
 */
async function hiredApplication(candidateId: string) {
  const apps = await prisma.candidateApplication.findMany({
    where: { candidateId },
    select: { id: true, stage: true, status: true, offerStatus: true, updatedAt: true, job: { select: { title: true } }, historicalJobTitle: true }
  });
  if (apps.length === 0) return { app: null, skipped: null };
  const offered = apps
    .filter((a) => OFFER_RANK[a.offerStatus] !== undefined)
    .sort((a, b) => OFFER_RANK[b.offerStatus] - OFFER_RANK[a.offerStatus] || b.updatedAt.getTime() - a.updatedAt.getTime());
  if (offered[0]) return { app: offered[0], skipped: null };
  if (apps.length === 1) return { app: apps[0], skipped: null };
  const alreadyHired =
    apps.find((a) => (a.status ?? "").toLowerCase() === "hired") ?? apps.find((a) => a.stage === HIRED_STAGE);
  if (alreadyHired) return { app: alreadyHired, skipped: null };
  return { app: null, skipped: `${apps.length} applications and none carries an offer, so none was guessed at` };
}

/** Work out what would change. Reads only — the backfill's dry run is this. */
export async function planCandidateSync(candidateId: string, now: Date = new Date()): Promise<CandidateSyncPlan | null> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      id: true,
      displayName: true,
      status: true,
      stage: true,
      mergeHistoryJson: true,
      scanExcludedReason: true,
      scanExcludedNote: true,
      scanExcludedAt: true,
      scanExcludedBy: true
    }
  });
  if (!candidate || isMergedAway(candidate)) return null;

  const hires = await prisma.newHire.findMany({
    where: { candidateId },
    select: {
      id: true,
      name: true,
      position: true,
      employmentStatus: true,
      canceled: true,
      stage: true,
      startDate: true,
      offerSignedDate: true,
      terminationDate: true,
      createdAt: true
    }
  });
  const hire = decidingHire(hires);
  if (!hire) return null;
  const state = stateOf(hire);

  const plan: CandidateSyncPlan = {
    candidateId,
    displayName: candidate.displayName,
    hireId: hire.id,
    state,
    before: {
      status: candidate.status,
      stage: candidate.stage,
      scanExcludedReason: candidate.scanExcludedReason,
      scanExcludedNote: candidate.scanExcludedNote,
      scanExcludedAt: candidate.scanExcludedAt ? candidate.scanExcludedAt.toISOString() : null,
      scanExcludedBy: candidate.scanExcludedBy
    },
    reapplied: null,
    candidate: {},
    application: null,
    applicationSkipped: null,
    timeline: { type: "HIRED", title: "", detail: "", occurredAt: now }
  };

  const role = hire.position ? ` — ${hire.position}` : "";
  const changes: string[] = [];

  // Did they apply again after this hire started, or after they left?
  const anchor = state === "TERMINATED" ? hire.terminationDate : state === "EMPLOYED" ? (hire.startDate ?? hire.createdAt) : null;
  if (anchor) {
    const later = await prisma.candidateApplication.findFirst({
      // The hire's OWN application doesn't count: the Sep 2026 "Hired backfill"
      // stamped its import day as appliedAt, which would read as re-applying.
      where: {
        candidateId,
        appliedAt: { gt: anchor },
        OR: [{ status: null }, { NOT: { status: { equals: HIRED_APP_STATUS, mode: "insensitive" } } }]
      },
      orderBy: { appliedAt: "desc" },
      select: { appliedAt: true, job: { select: { title: true } }, historicalJobTitle: true }
    });
    if (later?.appliedAt) plan.reapplied = { appliedAt: later.appliedAt.toISOString(), job: later.job?.title ?? later.historicalJobTitle ?? null };
  }
  // Any stage they are already at is kept; only a blank one is filled with Hired.
  const internalApplicant = state === "EMPLOYED" && Boolean(plan.reapplied) && Boolean(candidate.stage);

  if (state === "EMPLOYED") {
    if (candidate.status !== CANDIDATE_STATUS.CURRENT_EMPLOYEE) {
      plan.candidate.status = CANDIDATE_STATUS.CURRENT_EMPLOYEE;
      changes.push(`status ${candidate.status} → Current employee`);
    }
    if (internalApplicant) {
      changes.push(`stage left at ${candidate.stage}: they applied again on ${formatCalendarDay(plan.reapplied!.appliedAt)}${plan.reapplied!.job ? ` for ${plan.reapplied!.job}` : ""}`);
    } else if (candidate.stage !== HIRED_STAGE) {
      plan.candidate.stage = HIRED_STAGE;
      changes.push(`stage ${candidate.stage ?? "none"} → Hired`);
    }
    if (!candidate.scanExcludedReason && !internalApplicant) {
      plan.candidate.scanExcludedReason = "HIRED";
      plan.candidate.scanExcludedNote = "Set automatically: they are now an employee.";
      plan.candidate.scanExcludedAt = now;
      plan.candidate.scanExcludedBy = SCAN_BY;
      changes.push("held out of requirement scans");
    }
    const { app, skipped } = await hiredApplication(candidateId);
    plan.applicationSkipped = skipped;
    if (app && (app.stage !== HIRED_STAGE || app.status !== HIRED_APP_STATUS)) {
      plan.application = {
        id: app.id,
        jobTitle: app.job?.title ?? app.historicalJobTitle ?? null,
        before: { stage: app.stage, status: app.status },
        after: { stage: HIRED_STAGE, status: HIRED_APP_STATUS }
      };
      changes.push(`application${plan.application.jobTitle ? ` for ${plan.application.jobTitle}` : ""} → Hired (was ${app.status ?? "no status"} / ${app.stage ?? "no stage"})`);
    }
    plan.timeline = {
      type: "HIRED",
      title: `Hired${role}`,
      detail: "",
      occurredAt: hire.startDate ?? hire.offerSignedDate ?? now
    };
  } else if (state === "TERMINATED" && plan.reapplied) {
    // Re-applied after leaving: an applicant again. Nothing on the candidate moves.
    return { ...plan, timeline: { type: "EMPLOYMENT_ENDED", title: `Left SkyShare${role}`, detail: "", occurredAt: hire.terminationDate ?? now } };
  } else if (state === "TERMINATED") {
    if (candidate.status !== CANDIDATE_STATUS.FORMER_EMPLOYEE) {
      plan.candidate.status = CANDIDATE_STATUS.FORMER_EMPLOYEE;
      changes.push(`status ${candidate.status} → Former employee`);
    }
    if (candidate.stage !== FORMER_EMPLOYEE_STAGE) {
      plan.candidate.stage = FORMER_EMPLOYEE_STAGE;
      changes.push(`stage ${candidate.stage ?? "none"} → ${FORMER_EMPLOYEE_STAGE}`);
    }
    const lastDay = hire.terminationDate ? formatCalendarDay(hire.terminationDate) : null;
    plan.timeline = {
      type: "EMPLOYMENT_ENDED",
      title: `Left SkyShare${role}${lastDay ? ` — last day ${lastDay}` : ""}`,
      detail: "",
      occurredAt: hire.terminationDate ?? now
    };
  } else {
    // CANCELED: only undo a Hired this module (or anyone) set. Anything else is a
    // status somebody chose and is left alone.
    if (candidate.status === CANDIDATE_STATUS.CURRENT_EMPLOYEE) {
      plan.candidate.status = CANDIDATE_STATUS.INACTIVE;
      changes.push("status Current employee → Inactive");
    }
    plan.timeline = {
      type: "EMPLOYMENT_ENDED",
      title: `Hire canceled before their first day${role}`,
      detail: "",
      occurredAt: now
    };
  }

  plan.timeline.detail = changes.length ? `Updated automatically from their employee record: ${changes.join("; ")}.` : "";
  return plan;
}

export function planHasChanges(plan: CandidateSyncPlan | null): boolean {
  return Boolean(plan && (Object.keys(plan.candidate).length > 0 || plan.application));
}

/** Write a plan. One transaction: candidate, application, timeline entry. */
export async function applyCandidateSync(plan: CandidateSyncPlan, reason: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    if (Object.keys(plan.candidate).length > 0) {
      await tx.candidate.update({ where: { id: plan.candidateId }, data: plan.candidate });
    }
    if (plan.application) {
      await tx.candidateApplication.update({
        where: { id: plan.application.id },
        data: { stage: plan.application.after.stage, status: plan.application.after.status }
      });
    }
    await tx.timelineEvent.create({
      data: {
        candidateId: plan.candidateId,
        type: plan.timeline.type,
        title: plan.timeline.title,
        detail: `${plan.timeline.detail} Why: ${reason}`,
        occurredAt: plan.timeline.occurredAt,
        origin: "MANUAL",
        sourceType: "NewHire",
        sourceId: plan.hireId
      }
    });
  });
}

/**
 * The one call every hire path makes after it saves. Never throws.
 * `reason` is written on the candidate's timeline — say what just happened
 * ("Moved to onboarding", "Marked terminated on their employee record").
 */
export async function syncCandidateFromHire(hireId: string, reason: string): Promise<void> {
  try {
    const hire = await prisma.newHire.findUnique({ where: { id: hireId }, select: { candidateId: true } });
    if (!hire?.candidateId) return;
    const plan = await planCandidateSync(hire.candidateId);
    if (plan && planHasChanges(plan)) await applyCandidateSync(plan, reason);
  } catch (error) {
    console.error("Candidate hire-lifecycle sync failed:", hireId, error);
  }
}
