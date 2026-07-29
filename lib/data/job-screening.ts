import { prisma } from "@/lib/prisma";
import {
  scanRequirementPool,
  scoreSpecificCandidates,
  type MatchRequirement,
  type PilotRequirementCandidateMatch
} from "@/lib/matching/pilot-requirement-matches";
import { canEditScoring, getProfileScoringConfig } from "@/lib/matching/scoring-config.server";
import { getRequirementFeedback } from "@/lib/matching/match-feedback";
import { getRequirementTierOverrides } from "@/lib/matching/tier-override";
import { getRequirementSkips } from "@/lib/matching/position-skip.server";
import { parseStringArray } from "@/lib/json";
import { getScanPoolCounts } from "@/lib/candidates/scan-pool.server";

export type JobScreeningData = {
  hasRequirement: boolean;
  requirementId: string | null;
  requirementTitle: string | null;
  applicants: PilotRequirementCandidateMatch[];
  best: PilotRequirementCandidateMatch[];
  /**
   * Held out of `best` for this position only — a recruiter's skip or the
   * automatic overqualified catch. Rendered as its own collapsed group so the
   * call stays visible and one click undoes it.
   */
  setAside: PilotRequirementCandidateMatch[];
  applicantIds: string[];
  scannedCount: number;
  /** Live pipeline candidates considered in the scan. */
  scannedCurrent: number;
  /** Historical (archived Jazz) candidates considered in the scan. */
  scannedArchive: number;
  canEdit: boolean;
};


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
    setAside: [],
    applicantIds: [],
    scannedCount: 0,
    scannedCurrent: 0,
    scannedArchive: 0,
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

  const counts = await getScanPoolCounts();
  const countFields = {
    scannedCount: counts.total,
    scannedCurrent: counts.current,
    scannedArchive: counts.archive
  };
  const requirement = job?.pilotRequirements[0];
  if (!job || !requirement) {
    return { ...empty, ...countFields };
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
  const [config, feedback, overrides, skips] = await Promise.all([
    getProfileScoringConfig(aircraftTypes[0] ?? null, requirement.pilotSeat),
    getRequirementFeedback(requirement.id),
    getRequirementTierOverrides(requirement.id),
    getRequirementSkips(requirement.id)
  ]);

  const applicantIds = [...new Set(job.applications.map((application) => application.candidateId))];
  const [applicants, scan] = await Promise.all([
    scoreSpecificCandidates(matchRequirement, applicantIds, config, feedback, overrides, skips),
    scanRequirementPool(matchRequirement, config, feedback, overrides, skips)
  ]);

  return {
    hasRequirement: true,
    requirementId: requirement.id,
    requirementTitle: requirement.title,
    applicants,
    best: scan.ranked,
    setAside: scan.setAside,
    applicantIds,
    ...countFields,
    canEdit
  };
}
