import { prisma } from "@/lib/prisma";
import {
  getPilotRequirementCandidateMatches,
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
import { FLEET_POSITIONS, resolveFleetPosition } from "@/lib/fleet/positions";
import type { JobScreeningData } from "@/lib/data/job-screening";

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

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
};

export type CandidateSubject = {
  id: string;
  name: string;
  title: string | null;
  totalTime: number | null;
  excluded: boolean;
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
        pilotSeat: true,
        aircraftTypesJson: true,
        sourceJobRecord: { select: { title: true } },
        _count: { select: { applications: true } }
      }
    }),
    prisma.candidate.findMany({
      where: { status: "ACTIVE" },
      orderBy: { displayName: "asc" },
      take: 500,
      select: {
        id: true,
        displayName: true,
        currentTitle: true,
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
    const position = resolveFleetPosition(req.title);
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
        unmatched: true
      });
    }
  }

  const canonicalRoles: RoleSubject[] = FLEET_POSITIONS.filter((position) => bySlug.has(position.slug)).map(
    (position) => {
      const group = bySlug.get(position.slug)!;
      return {
        id: group.reqIds[0],
        title: position.title,
        seat: position.seat,
        aircraft: position.aircraft,
        typeRating: position.typeRating || null,
        status: position.status,
        applicantCount: group.applicants,
        dupeCount: group.reqIds.length,
        unmatched: false
      };
    }
  );
  // Active positions first (stable sort keeps fleet/size order within each group).
  canonicalRoles.sort((a, b) => (a.status === "Archived" ? 1 : 0) - (b.status === "Archived" ? 1 : 0));

  return {
    roles: [...canonicalRoles, ...unmatched],
    candidates: candidates.map((cand) => ({
      id: cand.id,
      name: cand.displayName,
      title: cand.currentTitle,
      totalTime: cand.metrics[0]?.valueNumber ?? null,
      excluded: Boolean(cand.scanExcludedReason)
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
    applicantIds: [],
    scannedCount: 0,
    canEdit
  };
  if (!requirementId) return empty;

  const requirement = await prisma.pilotRequirement.findUnique({
    where: { id: requirementId },
    select: { ...REQUIREMENT_SELECT, applications: { select: { candidateId: true } } }
  });

  const scannedCount = await prisma.candidate.count({
    where: { status: "ACTIVE", ...(includeExcluded ? {} : { scanExcludedReason: null }) }
  });
  if (!requirement) return { ...empty, scannedCount };

  const matchRequirement = toMatchRequirement(requirement);
  const aircraftTypes = parseStringArray(requirement.aircraftTypesJson);
  const [config, feedback, overrides] = await Promise.all([
    getProfileScoringConfig(aircraftTypes[0] ?? null, requirement.pilotSeat),
    getRequirementFeedback(requirement.id),
    getRequirementTierOverrides(requirement.id)
  ]);

  const applicantIds = [...new Set(requirement.applications.map((application) => application.candidateId))];
  const [applicants, best] = await Promise.all([
    scoreSpecificCandidates(matchRequirement, applicantIds, config, feedback, overrides),
    getPilotRequirementCandidateMatches(matchRequirement, config, feedback, overrides, includeExcluded)
  ]);

  return {
    hasRequirement: true,
    requirementId: requirement.id,
    requirementTitle: resolveFleetPosition(requirement.title)?.title ?? requirement.title,
    applicants,
    best,
    applicantIds,
    scannedCount,
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
  excludedReason: string | null;
  canEdit: boolean;
  roles: RoleMatch[];
};

export async function getCandidateRoleMatches(candidateId: string | null): Promise<CandidateRoleMatches | null> {
  if (!candidateId) return null;
  const canEdit = await canEditScoring();

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: candidateMatchSelect
  });
  if (!candidate) return null;

  const [requirements, doc, candidateFeedback, candidateOverrides] = await Promise.all([
    prisma.pilotRequirement.findMany({
      where: { status: "ACTIVE" },
      take: 300,
      select: { ...REQUIREMENT_SELECT, sourceJobRecord: { select: { title: true } } }
    }),
    getScoringConfigDoc(),
    getCandidateFeedback(candidateId),
    getCandidateTierOverrides(candidateId)
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
        candidateOverrides[requirement.id] ?? null
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
    excludedReason: candidate.scanExcludedReason,
    canEdit,
    roles
  };
}
