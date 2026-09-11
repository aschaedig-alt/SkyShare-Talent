/**
 * Has this person applied AGAIN since they were last closed out?
 *
 * ONE definition, shared by everything that reacts to it — the badge on the
 * row, the row opening itself, and anything added later. The three had to agree
 * or the page would open a row it did not flag, or flag one it did not open.
 *
 * WHAT IT IS FOR. 11 people are sitting in the Active segment carrying a closed
 * stage, and every one of them is there for a good reason: they applied again
 * after being turned down and nobody has looked at the new application. Several
 * did it within days, for the SAME job — one the day after failing the
 * interview for it. That is a real thing to action, and until now the only sign
 * of it was the bare word "New" under a status reading "Rejected", two columns
 * from a badge that said the person was closed.
 *
 * THE RULE, deliberately narrow: the NEWEST application is still unreviewed,
 * and they were already closed out FOR THAT SAME JOB. All three halves matter,
 * and the sizes below are why — measured against the live list of 730.
 *
 *   - Without "newest", somebody whose open application PREDATES their closures
 *     would be called a re-applicant. Two people are in exactly that position
 *     (an application left open from before the decision), and they are a stale
 *     record rather than a return. Different problem, different words.
 *   - Without "an older closed one", every ordinary first-time applicant would
 *     be flagged, which would make the flag meaningless.
 *   - Without SAME JOB it flags 162 people instead of 41, and the first version
 *     of this did exactly that: 154 badges rendered on one screen. A pilot with
 *     five applications open across five seats, four of them declined, is normal
 *     parallel activity — not a return. Coming back for the job you were already
 *     turned down for is the thing worth interrupting somebody about.
 *
 * A different-job application after a closure is deliberately NOT flagged here.
 * The one case where it should still matter is a standing bar like a PRD block,
 * which is not a judgement about one seat — that belongs to the rules that act
 * on arrival, not to this badge.
 *
 * PURE module (no Prisma) so client components can import it.
 */
import type { ApplicationOutcome } from "@/lib/candidates/buckets";

export type ReapplyApplication = {
  outcome: ApplicationOutcome;
  appliedAt: string | null;
  jobTitle: string | null;
};

export type ReapplyInfo = {
  /** The unreviewed application that brought them back. */
  appliedAt: string | null;
  jobTitle: string | null;
  /** When they were last closed out, so the row can say how soon after. */
  previousAt: string | null;
  previousJobTitle: string | null;
  /** Always true — the rule requires it. Kept so callers read as intended. */
  sameJob: boolean;
  /** Whole days between the closure and the return, when both dates are known. */
  daysBetween: number | null;
};

/** An outcome nobody has acted on yet. */
function isOpen(outcome: ApplicationOutcome): boolean {
  return outcome === "Active" || outcome === "Offered";
}

/**
 * `applications` MUST be most-recent-first, which is the order the list query
 * already sorts them into once, so every consumer reads the same array.
 */
export function reapplyInfo(applications: ReapplyApplication[]): ReapplyInfo | null {
  if (applications.length < 2) return null;
  const newest = applications[0];
  if (!isOpen(newest.outcome)) return null;

  const title = (newest.jobTitle ?? "").trim().toLowerCase();
  if (!title) return null;

  // The most recent CLOSED application for this same job. Matched on the title
  // rather than the job id, because most of these applications carry a title
  // string and no linked job — 118 of the 122 Paycom requisitions are not jobs
  // we hold, and the Jazz history is titles all the way down.
  const previous = applications
    .slice(1)
    .find((a) => !isOpen(a.outcome) && (a.jobTitle ?? "").trim().toLowerCase() === title);
  if (!previous) return null;

  const a = newest.appliedAt ? Date.parse(newest.appliedAt) : NaN;
  const b = previous.appliedAt ? Date.parse(previous.appliedAt) : NaN;
  const daysBetween =
    Number.isFinite(a) && Number.isFinite(b) ? Math.round((a - b) / 86400000) : null;

  const sameJob = true;

  return {
    appliedAt: newest.appliedAt,
    jobTitle: newest.jobTitle,
    previousAt: previous.appliedAt,
    previousJobTitle: previous.jobTitle,
    sameJob,
    daysBetween
  };
}

export function hasReapplied(applications: ReapplyApplication[]): boolean {
  return reapplyInfo(applications) !== null;
}

/**
 * Job titles this person has open MORE THAN ONCE.
 *
 * Real and commoner than it sounds: David Nudelman has Gulfstream G200 First
 * Officer open twice eleven days apart, and Kamren Capener has Aircraft
 * Maintenance Technician open twice on the same day. Paycom lets somebody
 * submit the same requisition again, and nothing merges them.
 *
 * DELIBERATELY NOT COLLAPSED — his call. Each one is a real row in Paycom and
 * still has to be closed out individually, so hiding the second would leave an
 * application open that nobody can see. They are marked, and both stay
 * actionable.
 *
 * Returned lowercased, because that is how the panel looks them up.
 */
export function duplicateOpenTitles(applications: ReapplyApplication[]): Set<string> {
  const seen = new Map<string, number>();
  for (const a of applications) {
    if (!isOpen(a.outcome)) continue;
    const key = (a.jobTitle ?? "").trim().toLowerCase();
    if (!key) continue;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return new Set([...seen].filter(([, n]) => n > 1).map(([k]) => k));
}

/** Does this outcome still need somebody to decide it? Exported so the panel
 *  and the badge cannot disagree about what "open" means. */
export function isOpenOutcome(outcome: ApplicationOutcome): boolean {
  return isOpen(outcome);
}
