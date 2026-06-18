import { prisma } from "@/lib/prisma";
import {
  getPilotRequirementCandidateMatches,
  scoreSpecificCandidates,
  type MatchRequirement,
  type PilotRequirementCandidateMatch
} from "@/lib/matching/pilot-requirement-matches";
import { canEditScoring, getProfileScoringConfig } from "@/lib/matching/scoring-config.server";
import { getRequirementFeedback } from "@/lib/matching/match-feedback";
import { getRequirementTierOverrides } from "@/lib/matching/tier-override";

export type JobScreeningData = {
  hasRequirement: boolean;
  requirementId: string | null;
  requirementTitle: string | null;
  applicants: PilotRequirementCandidateMatch[];
  best: PilotRequirementCandidateMatch[];
  applicantIds: string[];
  scannedCount: number;
  canEdit: boolean;
};

function parseStringArray(value: string | null) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Screening for a single job: scores the people who applied AND the best
 * candidates in the system, both against the job's linked pilot requirement.
 * If the job has no linked requirement there is nothing to score against.
 */
export async function getJobScreening(jobId: string | null): Promise<JobScreeningData> {
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

  if (!jobId) return empty;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      applications: { select: { candidateId: true } },
      pilotRequirements: {
        select: {
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
        }
      }
    }
  });

  const scannedCount = await prisma.candidate.count({ where: { status: "ACTIVE", scanExcludedReason: null } });
  const requirement = job?.pilotRequirements[0];
  if (!job || !requirement) {
    return { ...empty, scannedCount };
  }

  const matchRequirement: MatchRequirement = {
    id: requirement.id,
    title: requirement.title,
    pilotSeat: requirement.pilotSeat,
    aircraftTypesJson: requirement.aircraftTypesJson,
    baseCity: requirement.baseCity,
    baseState: requirement.baseState,
    baseAirport: requirement.baseAirport,
    gates: requirement.gates
  };

  const aircraftTypes = parseStringArray(requirement.aircraftTypesJson);
  const [config, feedback, overrides] = await Promise.all([
    getProfileScoringConfig(aircraftTypes[0] ?? null, requirement.pilotSeat),
    getRequirementFeedback(requirement.id),
    getRequirementTierOverrides(requirement.id)
  ]);

  const applicantIds = [...new Set(job.applications.map((application) => application.candidateId))];
  const [applicants, best] = await Promise.all([
    scoreSpecificCandidates(matchRequirement, applicantIds, config, feedback, overrides),
    getPilotRequirementCandidateMatches(matchRequirement, config, feedback, overrides)
  ]);

  return {
    hasRequirement: true,
    requirementId: requirement.id,
    requirementTitle: requirement.title,
    applicants,
    best,
    applicantIds,
    scannedCount,
    canEdit
  };
}
