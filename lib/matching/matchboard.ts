import { prisma } from "@/lib/prisma";
import {
  scanRequirementPool,
  scoreSpecificCandidates,
  scoreCandidate,
  candidateMatchSelect,
  type MatchRequirement,
  type PilotRequirementCandidateMatch
} from "@/lib/matching/pilot-requirement-matches";
import { resolveProfileConfig, profileKey } from "@/lib/matching/scoring-config";
import { canEditScoring, getProfileScoringConfig, getScoringConfigDoc } from "@/lib/matching/scoring-config.server";
import { getRequirementFeedback, getCandidateFeedback } from "@/lib/matching/match-feedback";
import { getRequirementTierOverrides, getCandidateTierOverrides } from "@/lib/matching/tier-override";
import { getRequirementSkips, getCandidateSkips } from "@/lib/matching/position-skip.server";
import { FLEET_POSITIONS, resolveFleetPosition, positionFor } from "@/lib/fleet/positions";
import type { JobScreeningData } from "@/lib/data/job-screening";
import { parseStringArray } from "@/lib/json";
import { getScanPoolCounts } from "@/lib/candidates/scan-pool.server";
import { scanPoolWhere, isArchivedCandidateStatus } from "@/lib/candidates/scan-pool";
import { isScanExclusionReason, type ScanExclusionReason } from "@/lib/candidates/scan-exclusion";
import { findPriorSkips, type PriorSkip } from "@/lib/candidates/skipped-pool";


// ---------------------------------------------------------------------------
// Subjects for the two pickers
// ---------------------------------------------------------------------------

export type RoleSubject = {
  id: string; // representative requirement id to scan
  title: string; // canonical fleet title (or the raw requirement title when unmatched)
  seat: string | null;
  aircraft: string | null;
  typeRating: string | null;
  status: "Active" | "Archived" | null; // from the fleet registry; null when unmatched
  applicantCount: number;
  dupeCount: number; // requirement rows collapsed into this canonical position
  unmatched: boolean; // true = didn't resolve to a canonical fleet position
  noProfile: boolean; // active fleet position with no requirement record yet (not scannable)
};

export type CandidateSubject = {
  id: string;
  name: string;
  title: string | null;
  totalTime: number | null;
  excluded: boolean;
  /** Historical (archived Jazz) record rather than a live pipeline one. */
  fromArchive: boolean;
};

export type MatchboardSubjects = {
  roles: RoleSubject[];
  candidates: CandidateSubject[];
};

export async function getMatchboardSubjects(): Promise<MatchboardSubjects> {
  const [requirements, candidates] = await Promise.all([
    prisma.pilotRequirement.findMany({
      where: { status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      take: 300,
      select: {
        id: true,
        title: true,
        fleetPositionSlug: true,
        pilotSeat: true,
        aircraftTypesJson: true,
        sourceJobRecord: { select: { title: true } },
        _count: { select: { applications: true } }
      }
    }),
    // The whole pool, not just live records — looking someone up in the archive
    // is the point. Skipped people stay in the picker (badged) so they can be
    // opened and restored; the scan filter is what holds them out of results.
    prisma.candidate.findMany({
      where: scanPoolWhere(true),
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        currentTitle: true,
        status: true,
        scanExcludedReason: true,
        metrics: { where: { key: "total_time" }, select: { valueNumber: true }, take: 1 }
      }
    })
  ]);

  // Collapse the messy requirement rows onto canonical fleet positions via the
  // registry resolver, so the picker shows the canonical, deduped list.
  type Group = { reqIds: string[]; applicants: number };
  const bySlug = new Map<string, Group>();
  const unmatched: RoleSubject[] = [];

  for (const req of requirements) {
    const position = positionFor(req.fleetPositionSlug, req.title);
    if (position) {
      const group = bySlug.get(position.slug);
      if (group) {
        group.reqIds.push(req.id);
        group.applicants += req._count.applications;
      } else {
        bySlug.set(position.slug, { reqIds: [req.id], applicants: req._count.applications });
      }
    } else {
      unmatched.push({
        id: req.id,
        title: req.title,
        seat: req.pilotSeat,
        aircraft: parseStringArray(req.aircraftTypesJson)[0] ?? null,
        typeRating: null,
        status: null,
        applicantCount: req._count.applications,
        dupeCount: 1,
        unmatched: true,
        noProfile: false
      });
    }
  }

  // Driven by the fleet registry: show EVERY active position (so positions with
  // no requirement record still appear, flagged), then archived positions that
  // do have records, then any requirement that didn't resolve to a position.
  const toSubject = (slug: string): RoleSubject | null => {
    const position = FLEET_POSITIONS.find((p) => p.slug === slug);
    if (!position) return null;
    const group = bySlug.get(slug);
    return {
      id: group ? group.reqIds[0] : "",
      title: position.title,
      seat: position.seat,
      aircraft: position.aircraft,
      typeRating: position.typeRating || null,
      status: position.status,
      applicantCount: group ? group.applicants : 0,
      dupeCount: group ? group.reqIds.length : 0,
      unmatched: false,
      noProfile: !group
    };
  };

  const activeRoles = FLEET_POSITIONS.filter((p) => p.status === "Active")
    .map((p) => toSubject(p.slug))
    .filter((r): r is RoleSubject => r !== null);
  const archivedRoles = FLEET_POSITIONS.filter((p) => p.status === "Archived" && bySlug.has(p.slug))
    .map((p) => toSubject(p.slug))
    .filter((r): r is RoleSubject => r !== null);

  return {
    roles: [...activeRoles, ...archivedRoles, ...unmatched],
    candidates: candidates.map((cand) => ({
      id: cand.id,
      name: cand.displayName,
      title: cand.currentTitle,
      totalTime: cand.metrics[0]?.valueNumber ?? null,
      excluded: Boolean(cand.scanExcludedReason),
      fromArchive: isArchivedCandidateStatus(cand.status)
    }))
  };
}

// ---------------------------------------------------------------------------
// Role -> candidates (reuses the screening shape so the existing panel renders)
// ---------------------------------------------------------------------------

const REQUIREMENT_SELECT = {
  id: true,
  title: true,
  pilotSeat: true,
  aircraftTypesJson: true,
  baseCity: true,
  baseState: true,
  baseAirport: true,
  gates: {
    where: { enabled: true },
    select: { key: true, label: true, category: true, valueType: true, numericValue: true }
  }
} as const;

function toMatchRequirement(requirement: {
  id: string;
  title: string;
  pilotSeat: string | null;
  aircraftTypesJson: string | null;
  baseCity: string | null;
  baseState: string | null;
  baseAirport: string | null;
  gates: Array<{ key: string; label: string; category: string; valueType: string; numericValue: number | null }>;
}): MatchRequirement {
  return {
    id: requirement.id,
    title: requirement.title,
    pilotSeat: requirement.pilotSeat,
    aircraftTypesJson: requirement.aircraftTypesJson,
    baseCity: requirement.baseCity,
    baseState: requirement.baseState,
    baseAirport: requirement.baseAirport,
    gates: requirement.gates
  };
}

export async function getRoleScreening(requirementId: string | null, includeExcluded = false): Promise<JobScreeningData> {
  const canEdit = await canEditScoring();
  const empty: JobScreeningData = {
    hasRequirement: false,
    requirementId: null,
    requirementTitle: null,
    applicants: [],
    best: [],
    setAside: [],
    applicantIds: [],
    scannedCount: 0,
    scannedCurrent: 0,
    scannedArchive: 0,
    canEdit
  };
  if (!requirementId) return empty;

  const requirement = await prisma.pilotRequirement.findUnique({
    where: { id: requirementId },
    select: { ...REQUIREMENT_SELECT, applications: { select: { candidateId: true } } }
  });

  const counts = await getScanPoolCounts(includeExcluded);
  const countFields = {
    scannedCount: counts.total,
    scannedCurrent: counts.current,
    scannedArchive: counts.archive
  };
  if (!requirement) return { ...empty, ...countFields };

  const matchRequirement = toMatchRequirement(requirement);
  const aircraftTypes = parseStringArray(requirement.aircraftTypesJson);
  const [config, feedback, overrides, skips] = await Promise.all([
    getProfileScoringConfig(aircraftTypes[0] ?? null, requirement.pilotSeat),
    getRequirementFeedback(requirement.id),
    getRequirementTierOverrides(requirement.id),
    getRequirementSkips(requirement.id)
  ]);

  const applicantIds = [...new Set(requirement.applications.map((application) => application.candidateId))];
  const [applicants, scan] = await Promise.all([
    scoreSpecificCandidates(matchRequirement, applicantIds, config, feedback, overrides, skips),
    scanRequirementPool(matchRequirement, config, feedback, overrides, skips, includeExcluded)
  ]);

  return {
    hasRequirement: true,
    requirementId: requirement.id,
    requirementTitle: resolveFleetPosition(requirement.title)?.title ?? requirement.title,
    applicants,
    best: scan.ranked,
    setAside: scan.setAside,
    applicantIds,
    ...countFields,
    canEdit
  };
}

// ---------------------------------------------------------------------------
// Candidate -> roles (new lens)
// ---------------------------------------------------------------------------

export type RoleMatch = {
  requirementId: string;
  title: string;
  seat: string | null;
  aircraft: string[];
  jobTitle: string | null;
  match: PilotRequirementCandidateMatch;
};

export type CandidateRoleMatches = {
  candidateId: string;
  candidateName: string;
  currentTitle: string | null;
  stage: string | null;
  totalTime: number | null;
  excludedReason: ScanExclusionReason | null;
  excludedNote: string | null;
  excludedAt: string | null;
  excludedBy: string | null;
  fromArchive: boolean;
  canEdit: boolean;
  roles: RoleMatch[];
  /**
   * Earlier records for what looks like the same person, already on the skip
   * list. Surfaced, never acted on — the point is to be reminded of the history
   * and decide again, not to have a new application silently re-excluded.
   */
  priorSkips: PriorSkip[];
};

export async function getCandidateRoleMatches(candidateId: string | null): Promise<CandidateRoleMatches | null> {
  if (!candidateId) return null;
  const canEdit = await canEditScoring();

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: {
      ...candidateMatchSelect,
      normalizedEmail: true,
      normalizedName: true,
      scanExcludedAt: true,
      scanExcludedBy: true
    }
  });
  if (!candidate) return null;

  const [requirements, doc, candidateFeedback, candidateOverrides, candidateSkips, priorSkips] = await Promise.all([
    prisma.pilotRequirement.findMany({
      where: { status: "ACTIVE" },
      take: 300,
      select: { ...REQUIREMENT_SELECT, sourceJobRecord: { select: { title: true } } }
    }),
    getScoringConfigDoc(),
    getCandidateFeedback(candidateId),
    getCandidateTierOverrides(candidateId),
    getCandidateSkips(candidateId),
    findPriorSkips({
      id: candidate.id,
      displayName: candidate.displayName,
      normalizedEmail: candidate.normalizedEmail,
      normalizedName: candidate.normalizedName
    })
  ]);

  const roles: RoleMatch[] = requirements
    .map((requirement) => {
      const aircraft = parseStringArray(requirement.aircraftTypesJson);
      const config = resolveProfileConfig(doc, profileKey(aircraft[0] ?? null, requirement.pilotSeat));
      const match = scoreCandidate(
        toMatchRequirement(requirement),
        candidate,
        config,
        candidateFeedback[requirement.id] ?? null,
        candidateOverrides[requirement.id] ?? null,
        candidateSkips[requirement.id] ?? null
      );
      return {
        requirementId: requirement.id,
        title: requirement.title,
        seat: requirement.pilotSeat,
        aircraft,
        jobTitle: requirement.sourceJobRecord?.title ?? null,
        match
      };
    })
    .filter((role) => role.match.score > 0 || role.match.factors.some((factor) => factor.status === "met"))
    .sort((a, b) => b.match.score - a.match.score || a.title.localeCompare(b.title));

  const totalTime = candidate.metrics.find((metric) => metric.key === "total_time")?.valueNumber ?? null;

  return {
    candidateId: candidate.id,
    candidateName: candidate.displayName,
    currentTitle: candidate.currentTitle,
    stage: candidate.stage,
    totalTime,
    excludedReason: isScanExclusionReason(candidate.scanExcludedReason) ? candidate.scanExcludedReason : null,
    excludedNote: candidate.scanExcludedNote,
    excludedAt: candidate.scanExcludedAt?.toISOString() ?? null,
    excludedBy: candidate.scanExcludedBy,
    fromArchive: isArchivedCandidateStatus(candidate.status),
    canEdit,
    roles,
    priorSkips
  };
}
