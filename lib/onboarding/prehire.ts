import { prisma } from "@/lib/prisma";
import { getTaskSendRecord, recordTaskSend } from "@/lib/front/task-email";

/**
 * Checklist steps worked BEFORE somebody is a new hire.
 *
 * Asked for on 2026-09-22 (feedback cmuctrf78), about the PRD section: "this
 * part of the checklist should start when they are a candidate and then carry
 * over to new hires with the accurate status. we only use it for pilots but i
 * need to be able to pull a PRD on all pilots before we officially offer them.
 * so add it on the candidate side, then when they move to onboarding have it
 * show up exactly where it shows up now for checking off."
 *
 * The shape follows the offer steps, which solved the same problem first: the
 * work lives on the CANDIDATE while there is no hire (Candidate.preHireTasksJson,
 * as offerStepsJson lives on the application), and on the move into onboarding
 * each status is copied onto the hire's own task row. From then on the ROW is the
 * one truth — the candidate's Checklists tab reads and writes that row directly,
 * so there is never a second copy to drift. Which sections behave like this is a
 * layout setting (candidateGroups in lib/data/onboarding-grid-config.ts), not a
 * list in code, so it moves when the checklist does.
 */

export type PreHireStatus = "TODO" | "DONE" | "NA";

/** One step's state on a candidate: the status, when it was set, and by whom. */
export type PreHireTick = { status: PreHireStatus; at: string | null; by: string | null };

export type PreHireTicks = Record<string, PreHireTick>;

export function isPreHireStatus(value: unknown): value is PreHireStatus {
  return value === "TODO" || value === "DONE" || value === "NA";
}

/** Tolerant read: anything malformed is dropped rather than trusted. */
export function parsePreHireTicks(json: string | null | undefined): PreHireTicks {
  if (!json) return {};
  try {
    const raw = JSON.parse(json) as unknown;
    if (!raw || typeof raw !== "object") return {};
    const out: PreHireTicks = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      if (!isPreHireStatus(v.status)) continue;
      out[key] = {
        status: v.status,
        at: typeof v.at === "string" ? v.at : null,
        by: typeof v.by === "string" ? v.by : null
      };
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Set one step on a candidate who is not yet a hire. Read-modify-write on the
 * one JSON column; the window for two people ticking the same person's PRD step
 * in the same second is not worth a transaction.
 *
 * `forwardOnly` is for a SEND ticking its own step: a send is evidence the step
 * happened, so it moves To do or N/A to Done and never touches a Done — the same
 * rule the hire-side send follows (it updates every row that is "not DONE").
 */
export async function setPreHireTick(
  candidateId: string,
  taskKey: string,
  status: PreHireStatus,
  by: string | null,
  opts: { forwardOnly?: boolean } = {}
): Promise<PreHireTicks> {
  const row = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { preHireTasksJson: true } });
  if (!row) throw new Error("Candidate not found.");
  const ticks = parsePreHireTicks(row.preHireTasksJson);
  if (opts.forwardOnly && ticks[taskKey]?.status === "DONE") return ticks;
  ticks[taskKey] = { status, at: status === "TODO" ? null : new Date().toISOString(), by };
  await prisma.candidate.update({ where: { id: candidateId }, data: { preHireTasksJson: JSON.stringify(ticks) } });
  return ticks;
}

/**
 * Copy what was worked on the candidate onto the hire's checklist.
 *
 * Called when a hire comes into existence FROM this candidate (POST
 * /api/new-hires) and when a candidate is LINKED to a hire typed in by hand
 * (PATCH /api/new-hires/[id] with a candidateId). Both are the moment she meant
 * by "when they move to onboarding have it show up exactly where it shows up now".
 *
 * ONLY ROWS STILL AT TO DO ARE WRITTEN. A hire that already exists may have been
 * worked on its own checklist, and a candidate's older tick must never overwrite
 * a decision made there — so this fills gaps and changes nothing else. The done
 * time is the time it was done on the candidate, not the time of the move, so a
 * PRD requested on the 3rd still reads the 3rd.
 *
 * The send log comes along too. A Request PRD Access email sent from the
 * candidate page is recorded against the candidate; without this, the hire's
 * checklist would offer "Send email" as if it had never gone out, and a second
 * real email to the pilot is exactly what that label invites.
 *
 * Never throws: the hire is already created or linked, and that is the thing
 * the caller asked for. A failure here is logged and costs the carry-over only.
 */
export async function carryPreHireTicksToHire(candidateId: string, hireId: string): Promise<{ applied: number }> {
  try {
    const row = await prisma.candidate.findUnique({ where: { id: candidateId }, select: { preHireTasksJson: true } });
    const ticks = parsePreHireTicks(row?.preHireTasksJson);
    let applied = 0;
    for (const [taskKey, tick] of Object.entries(ticks)) {
      if (tick.status === "TODO") continue;
      const res = await prisma.onboardingTask.updateMany({
        where: { newHireId: hireId, key: taskKey, status: "TODO" },
        data: {
          status: tick.status,
          completedAt: tick.status === "DONE" ? (tick.at ? new Date(tick.at) : new Date()) : null
        }
      });
      applied += res.count;
    }
    for (const taskKey of Object.keys(ticks)) {
      const sent = await getTaskSendRecord(candidateId, taskKey);
      if (sent && !(await getTaskSendRecord(hireId, taskKey))) await recordTaskSend(hireId, taskKey, sent);
    }
    return { applied };
  } catch (error) {
    console.error(`Could not carry pre-hire checklist steps from candidate ${candidateId} to hire ${hireId}`, error);
    return { applied: 0 };
  }
}

/**
 * Is this a PILOT candidate? Decides only whether the pre-offer section opens
 * by itself on their Checklists tab — "we only use it for pilots" — and never
 * hides it: a non-pilot's section is folded, one click away, not gone.
 *
 * A job flagged isPilotRole settles it. Failing that, the job TITLE: 8,304 of the
 * applications imported from Paycom are not linked to a job at all and carry only
 * the title Paycom gave them ("Pilatus PC-12 Captain", "PC-12 SIC (PDP)
 * Evergreen"), so a flag-only test would call most pilots in the database
 * non-pilots. The words are the seat and role words a pilot title always
 * carries; "Cabin Attendant" and "Flight Coordinator" deliberately do not match.
 */
export const PILOT_TITLE = /\b(pilot|captain|first officer|co-captain|sic|pic|pdp)\b/i;

export function looksLikePilot(
  applications: Array<{ historicalJobTitle?: string | null; job?: { title: string; isPilotRole?: boolean | null } | null }>
): boolean {
  return applications.some(
    (a) =>
      Boolean(a.job?.isPilotRole) ||
      PILOT_TITLE.test(a.job?.title ?? "") ||
      PILOT_TITLE.test(a.historicalJobTitle ?? "")
  );
}
