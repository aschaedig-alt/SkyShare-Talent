import { prisma } from "@/lib/prisma";
import {
  getPilotRequirementCandidateMatches,
  type PilotRequirementCandidateMatch
} from "@/lib/matching/pilot-requirement-matches";
import { getProfileScoringConfig } from "@/lib/matching/scoring-config.server";
import { getRequirementFeedback } from "@/lib/matching/match-feedback";

export type RequirementScan = {
  matches: PilotRequirementCandidateMatch[];
  scannedCount: number; // active candidates considered in this scan
  scannedAt: string; // ISO timestamp
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
 * Run a fresh candidate scan for one pilot requirement. Loads the requirement,
 * its per-position scoring config and feedback, scores every active candidate,
 * and returns the top matches plus how many candidates were considered. Used by
 * both the initial page load and the on-demand "Scan" button so new candidates
 * surface as soon as they exist.
 */
export async function runRequirementScan(requirementId: string): Promise<RequirementScan> {
  const nowIso = new Date().toISOString();

  const requirement = await prisma.pilotRequirement.findUnique({
    where: { id: requirementId },
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
  });

  const scannedCount = await prisma.candidate.count({ where: { status: "ACTIVE" } });

  if (!requirement) {
    return { matches: [], scannedCount, scannedAt: nowIso };
  }

  const aircraftTypes = parseStringArray(requirement.aircraftTypesJson);
  const [config, feedback] = await Promise.all([
    getProfileScoringConfig(aircraftTypes[0] ?? null, requirement.pilotSeat),
    getRequirementFeedback(requirement.id)
  ]);

  const matches = await getPilotRequirementCandidateMatches(
    {
      id: requirement.id,
      title: requirement.title,
      pilotSeat: requirement.pilotSeat,
      aircraftTypesJson: requirement.aircraftTypesJson,
      baseCity: requirement.baseCity,
      baseState: requirement.baseState,
      baseAirport: requirement.baseAirport,
      gates: requirement.gates
    },
    config,
    feedback
  );

  return { matches, scannedCount, scannedAt: nowIso };
}
