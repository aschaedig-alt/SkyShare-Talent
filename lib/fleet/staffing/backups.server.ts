// "If our tentative hire falls through, who else could fly this seat?" — the
// OUTSIDE half of the answer.
//
// Takes a seat as it reads on the crew chart ("G450 / GV Captain", "PC-12 First
// Officer (N418T)"), resolves it to a canonical fleet position, finds the ACTIVE
// PilotRequirement behind that position the same way the Matchboard does, and
// hands back the ranked shortlist getRoleScreening already produces.
//
// THE PART THAT MATTERS MOST IS WHAT IT SAYS WHEN THERE IS NOTHING.
//
// Only 7 of the 20 active fleet positions have an ACTIVE PilotRequirement today,
// so for most seats on the chart there is genuinely nothing to rank. An empty
// panel with no explanation is the same failure as an unfalsifiable claim: the
// reader cannot tell "nobody qualifies" from "this never ran". So the result
// carries an explicit `state`, plus the size of the pool that WAS scanned and
// the count of inactive profiles on file, and the panel says which it is.
//
// It deliberately does NOT narrow scanPoolWhere. That predicate is the one
// chokepoint shared by Matchboard, Job Screening and Pilot Requirements;
// narrowing it here would silently shrink all three. Stage filtering belongs in
// the panel, which is why `stage` is carried on every row below.

import { prisma } from "@/lib/prisma";
import { getRoleScreening } from "@/lib/matching/matchboard";
import { positionFor, resolveFleetPosition } from "@/lib/fleet/positions";
import type { ReadinessLabel } from "@/lib/matching/pilot-requirement-matches";
import type { ViewerScope } from "@/lib/auth/viewer-scope";

/** How many ranked people to hand the panel. The panel filters and badges them,
    so this has to be wider than what it shows or a list of Rejected rows at the
    top would leave nothing behind the toggle. */
const SHORTLIST_LIMIT = 25;

export type SeatBackupMatch = {
  candidateId: string;
  name: string;
  currentTitle: string | null;
  /** Pipeline stage as stored. NOT filtered here — see the note above. */
  stage: string | null;
  score: number;
  qualified: number;
  readiness: ReadinessLabel;
  hardGaps: string[];
  minsMet: number;
  minsTotal: number;
  /** A historical (archived Jazz) record rather than a live pipeline one. */
  fromArchive: boolean;
  likelyOverqualified: boolean;
};

export type SeatBackups = {
  /** The seat label exactly as the caller asked for it. */
  requestedTitle: string;
  /** Canonical fleet position, when the label resolved to one. */
  positionTitle: string | null;
  positionSlug: string | null;
  /**
   * unresolved — the seat label does not map to a fleet position at all.
   * no-profile — it does, but no ACTIVE hiring profile exists to rank against.
   * scanned    — a profile exists and the pool was scanned (matches may be []).
   */
  state: "unresolved" | "no-profile" | "scanned";
  requirementId: string | null;
  requirementTitle: string | null;
  /** INACTIVE pilot requirements on file — the raw material behind "no profile
      exists", so the message can say what reactivating one would cost. */
  inactiveProfileCount: number;
  /** How many candidates the scan actually looked at. 0 when no scan ran. */
  scannedCount: number;
  scannedCurrent: number;
  scannedArchive: number;
  matches: SeatBackupMatch[];
};

function emptyResult(requestedTitle: string): SeatBackups {
  return {
    requestedTitle,
    positionTitle: null,
    positionSlug: null,
    state: "unresolved",
    requirementId: null,
    requirementTitle: null,
    inactiveProfileCount: 0,
    scannedCount: 0,
    scannedCurrent: 0,
    scannedArchive: 0,
    matches: []
  };
}

/**
 * Ranked outside candidates for one seat on the crew chart.
 *
 * `seatTitle` is what positionLabel() produces for the seat — the managed tail
 * in parentheses is fine, resolveFleetPosition ignores it.
 */
export async function getSeatBackups(seatTitle: string, viewer?: ViewerScope | null): Promise<SeatBackups> {
  const requestedTitle = seatTitle.trim();
  const result = emptyResult(requestedTitle);
  if (!requestedTitle) return result;

  const position = resolveFleetPosition(requestedTitle);
  if (!position) return result;

  result.positionTitle = position.title;
  result.positionSlug = position.slug;
  result.state = "no-profile";

  // Both counts in one place so "no profile exists" can be stated with the
  // positive control beside it: here is the whole ACTIVE set, and here is how
  // many INACTIVE ones are on file.
  const [active, inactiveProfileCount] = await Promise.all([
    prisma.pilotRequirement.findMany({
      where: { status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: { id: true, title: true, fleetPositionSlug: true }
    }),
    prisma.pilotRequirement.count({ where: { status: "INACTIVE" } })
  ]);
  result.inactiveProfileCount = inactiveProfileCount;

  // Same resolution the Matchboard uses to collapse requirement rows onto
  // canonical positions — a stored slug wins, the title is the fallback — so a
  // seat resolves to the same requirement here as it does over there.
  const requirement = active.find((req) => positionFor(req.fleetPositionSlug, req.title)?.slug === position.slug);
  if (!requirement) return result;

  const screening = await getRoleScreening(requirement.id, false, viewer);
  result.state = "scanned";
  result.requirementId = screening.requirementId;
  result.requirementTitle = screening.requirementTitle;
  result.scannedCount = screening.scannedCount;
  result.scannedCurrent = screening.scannedCurrent;
  result.scannedArchive = screening.scannedArchive;
  result.matches = screening.best.slice(0, SHORTLIST_LIMIT).map((m) => ({
    candidateId: m.candidateId,
    name: m.candidateName,
    currentTitle: m.currentTitle,
    stage: m.stage,
    score: m.score,
    qualified: m.qualified,
    readiness: m.readiness,
    hardGaps: m.hardGaps,
    minsMet: m.minsMet,
    minsTotal: m.minsTotal,
    fromArchive: m.fromArchive,
    likelyOverqualified: m.likelyOverqualified
  }));
  return result;
}
