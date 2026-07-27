import { prisma } from "@/lib/prisma";
import {
  getPilotRequirementCandidateMatches,
  type PilotRequirementCandidateMatch
} from "@/lib/matching/pilot-requirement-matches";
import { getProfileScoringConfig } from "@/lib/matching/scoring-config.server";
import { getRequirementFeedback } from "@/lib/matching/match-feedback";
import { getRequirementTierOverrides } from "@/lib/matching/tier-override";
import { aircraftForSlugs } from "@/lib/fleet/positions";
import { getScanPoolCounts } from "@/lib/candidates/scan-pool.server";
import { parseStringArray } from "@/lib/json";

export type RequirementScan = {
  matches: PilotRequirementCandidateMatch[];
  scannedCount: number; // everyone considered in this scan (current + archive)
  scannedCurrent: number;
  scannedArchive: number;
  scannedAt: string; // ISO timestamp
};


/**
 * Run a fresh candidate scan for one pilot requirement. Loads the requirement,
 * its per-position scoring config and feedback, scores every active candidate,
 * and returns the top matches plus how many candidates were considered. Used by
 * both the initial page load and the on-demand "Scan" button so new candidates
 * surface as soon as they exist.
 */
export async function runRequirementScan(requirementId: string, includeExcluded = false): Promise<RequirementScan> {
  const nowIso = new Date().toISOString();

  const requirement = await prisma.pilotRequirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true,
      title: true,
      pilotSeat: true,
      aircraftTypesJson: true,
      linkedFleetPositionSlugs: true,
      baseCity: true,
      baseState: true,
      baseAirport: true,
      gates: {
        where: { enabled: true },
        select: { key: true, label: true, category: true, valueType: true, numericValue: true }
      }
    }
  });

  const counts = await getScanPoolCounts(includeExcluded);
  const countFields = {
    scannedCount: counts.total,
    scannedCurrent: counts.current,
    scannedArchive: counts.archive
  };

  if (!requirement) {
    return { matches: [], ...countFields, scannedAt: nowIso };
  }

  const aircraftTypes = parseStringArray(requirement.aircraftTypesJson);
  const [config, feedback, overrides] = await Promise.all([
    getProfileScoringConfig(aircraftTypes[0] ?? null, requirement.pilotSeat),
    getRequirementFeedback(requirement.id),
    getRequirementTierOverrides(requirement.id)
  ]);

  const matches = await getPilotRequirementCandidateMatches(
    {
      id: requirement.id,
      title: requirement.title,
      pilotSeat: requirement.pilotSeat,
      // Fold linked dual-aircraft positions into the aircraft considered for fit.
      aircraftTypesJson: JSON.stringify([
        ...aircraftTypes,
        ...aircraftForSlugs(parseStringArray(requirement.linkedFleetPositionSlugs))
      ]),
      baseCity: requirement.baseCity,
      baseState: requirement.baseState,
      baseAirport: requirement.baseAirport,
      gates: requirement.gates
    },
    config,
    feedback,
    overrides,
    includeExcluded
  );

  return { matches, ...countFields, scannedAt: nowIso };
}
