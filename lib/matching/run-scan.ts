import { prisma } from "@/lib/prisma";
import {
  scanRequirementPool,
  type MatchRequirement,
  type PilotRequirementCandidateMatch
} from "@/lib/matching/pilot-requirement-matches";
import { getProfileScoringConfig } from "@/lib/matching/scoring-config.server";
import { getRequirementFeedback } from "@/lib/matching/match-feedback";
import { getRequirementTierOverrides } from "@/lib/matching/tier-override";
import { getRequirementSkips } from "@/lib/matching/position-skip.server";
import { aircraftForSlugs } from "@/lib/fleet/positions";
import { getScanPoolCounts } from "@/lib/candidates/scan-pool.server";
import { parseStringArray } from "@/lib/json";
import type { ScoringProfileConfig } from "@/lib/matching/scoring-config";

export type RequirementScan = {
  matches: PilotRequirementCandidateMatch[];
  /** Held out of `matches` for this position — a skip or the automatic 2x catch. */
  setAside: PilotRequirementCandidateMatch[];
  scannedCount: number; // everyone considered in this scan (current + archive)
  scannedCurrent: number;
  scannedArchive: number;
  scannedAt: string; // ISO timestamp
};

/**
 * Load one requirement in the shape the scorer wants, together with its
 * per-position scoring config. Shared so the scan and the unverified queue
 * always read the SAME requirement — including the linked dual-aircraft
 * positions folded into aircraft fit, which is easy to forget when rebuilding
 * this by hand.
 */
export async function loadScorableRequirement(
  requirementId: string
): Promise<{ requirement: MatchRequirement; config: ScoringProfileConfig } | null> {
  const row = await prisma.pilotRequirement.findUnique({
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
  if (!row) return null;

  const aircraftTypes = parseStringArray(row.aircraftTypesJson);
  const config = await getProfileScoringConfig(aircraftTypes[0] ?? null, row.pilotSeat);

  return {
    config,
    requirement: {
      id: row.id,
      title: row.title,
      pilotSeat: row.pilotSeat,
      // Fold linked dual-aircraft positions into the aircraft considered for fit.
      aircraftTypesJson: JSON.stringify([
        ...aircraftTypes,
        ...aircraftForSlugs(parseStringArray(row.linkedFleetPositionSlugs))
      ]),
      baseCity: row.baseCity,
      baseState: row.baseState,
      baseAirport: row.baseAirport,
      gates: row.gates
    }
  };
}


/**
 * Run a fresh candidate scan for one pilot requirement. Loads the requirement,
 * its per-position scoring config and feedback, scores every active candidate,
 * and returns the top matches plus how many candidates were considered. Used by
 * both the initial page load and the on-demand "Scan" button so new candidates
 * surface as soon as they exist.
 */
export async function runRequirementScan(requirementId: string, includeExcluded = false): Promise<RequirementScan> {
  const nowIso = new Date().toISOString();

  const counts = await getScanPoolCounts(includeExcluded);
  const countFields = {
    scannedCount: counts.total,
    scannedCurrent: counts.current,
    scannedArchive: counts.archive
  };

  const loaded = await loadScorableRequirement(requirementId);
  if (!loaded) {
    return { matches: [], setAside: [], ...countFields, scannedAt: nowIso };
  }

  const [feedback, overrides, skips] = await Promise.all([
    getRequirementFeedback(loaded.requirement.id),
    getRequirementTierOverrides(loaded.requirement.id),
    // Without this a rescan would drag every set-aside candidate back onto the
    // board until the next full page load.
    getRequirementSkips(loaded.requirement.id)
  ]);

  const { ranked, setAside } = await scanRequirementPool(
    loaded.requirement,
    loaded.config,
    feedback,
    overrides,
    skips,
    includeExcluded
  );

  return { matches: ranked, setAside, ...countFields, scannedAt: nowIso };
}
