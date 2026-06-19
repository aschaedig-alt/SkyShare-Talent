import { prisma } from "@/lib/prisma";
import {
  getPilotRequirementCandidateMatches,
  type PilotRequirementCandidateMatch
} from "@/lib/matching/pilot-requirement-matches";
import { canEditScoring, getProfileScoringConfig } from "@/lib/matching/scoring-config.server";
import { getRequirementFeedback } from "@/lib/matching/match-feedback";
import { positionFor, fleetOrderIndex, fleetSeatRank } from "@/lib/fleet/positions";

/** SkyShare roles first, then Managed, then anything unspecified. */
function operatorRank(operatorType: string | null): number {
  const value = (operatorType ?? "").toLowerCase();
  if (value === "skyshare") return 0;
  if (value === "managed") return 1;
  return 2;
}

// Canonical order: trust the TITLE first (the authoritative position name, e.g.
// "M2 Captain"). Only fall back to the aircraft tags when the title can't be
// resolved — tags can be ambiguous shared ratings ("CE-525") or mislabeled.
function bestFleetOrder(aircraftTypes: string[], title: string): number {
  const byTitle = fleetOrderIndex(title);
  if (byTitle !== Number.MAX_SAFE_INTEGER) return byTitle;
  return aircraftTypes.reduce((best, clue) => Math.min(best, fleetOrderIndex(clue)), Number.MAX_SAFE_INTEGER);
}

export type RequirementGateView = {
  id: string;
  key: string;
  label: string;
  category: string;
  valueType: string;
  enabled: boolean;
  numericValue: number | null;
  textValue: string | null;
  evidenceText: string | null;
};

export type PilotRequirementListItem = {
  id: string;
  title: string;
  fleetPositionSlug: string | null;
  advertisedTitle: string | null;
  status: string;
  reviewStatus: string;
  operatorType: string | null;
  pilotSeat: string | null;
  aircraftTypes: string[];
  base: string | null;
  baseCity: string | null;
  baseState: string | null;
  baseAirport: string | null;
  updatedAt: string;
  activeGateCount: number;
  numericSummary: Array<{ label: string; value: number }>;
};

export type PilotRequirementDetail = PilotRequirementListItem & {
  version: number;
  payScaleRaw: string | null;
  sourceJobTitle: string | null;
  sourceJobStatus: string | null;
  rawMinimumRequirements: string | null;
  originalJobDescriptionText: string | null;
  extractionConfidence: number | null;
  extractionWarnings: string[];
  // Only the enabled gates — used for the read-only "Enabled requirement gates" summary.
  gatesByCategory: Array<{
    category: string;
    gates: RequirementGateView[];
  }>;
  // ALL gates (enabled + disabled) so the editor can turn any requirement on/off.
  editableGatesByCategory: Array<{
    category: string;
    gates: RequirementGateView[];
  }>;
};

export type PilotRequirementsData = {
  requirements: PilotRequirementListItem[];
  selectedRequirement: PilotRequirementDetail | null;
  candidateMatches: PilotRequirementCandidateMatch[];
  canEditScoring: boolean;
  scannedCount: number;
  stats: {
    total: number;
    active: number;
    needsReview: number;
    catalogItems: number;
  };
};

function parseStringArray(value: string | null) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function formatBase(city: string | null, state: string | null, airport: string | null) {
  const location = [city, state].filter(Boolean).join(", ");
  return [airport, location].filter(Boolean).join(" - ") || null;
}

function getNumericSummary(gates: RequirementGateView[]) {
  const priority = ["total_time", "pic_time", "sic_time", "multi_engine_time", "turbine_time", "jet_time"];
  return priority
    .map((key) => gates.find((gate) => gate.key === key && gate.enabled && typeof gate.numericValue === "number"))
    .filter((gate): gate is RequirementGateView => Boolean(gate))
    .slice(0, 5)
    .map((gate) => ({
      label: gate.label
        .replace("Aircraft ", "")
        .replace("Multi-Engine", "Multi")
        .replace("Fixed-wing Turbine", "Turbine")
        .replace("Jet Aircraft", "Jet"),
      value: gate.numericValue ?? 0
    }));
}

function serializeGate(gate: {
  id: string;
  key: string;
  label: string;
  category: string;
  valueType: string;
  enabled: boolean;
  numericValue: number | null;
  textValue: string | null;
  evidenceText: string | null;
}): RequirementGateView {
  return {
    id: gate.id,
    key: gate.key,
    label: gate.label,
    category: gate.category,
    valueType: gate.valueType,
    enabled: gate.enabled,
    numericValue: gate.numericValue,
    textValue: gate.textValue,
    evidenceText: gate.evidenceText
  };
}

function matchesSearch(requirement: PilotRequirementListItem, query: string) {
  if (!query) {
    return true;
  }

  const searchable = [
    requirement.title,
    requirement.status,
    requirement.reviewStatus,
    requirement.operatorType,
    requirement.pilotSeat,
    requirement.base,
    ...requirement.aircraftTypes,
    ...requirement.numericSummary.map((item) => `${item.label} ${item.value}`)
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(query.toLowerCase());
}

function toListItem(requirement: {
  id: string;
  title: string;
  fleetPositionSlug: string | null;
  advertisedTitle: string | null;
  status: string;
  reviewStatus: string;
  operatorType: string | null;
  pilotSeat: string | null;
  aircraftTypesJson: string | null;
  baseCity: string | null;
  baseState: string | null;
  baseAirport: string | null;
  updatedAt: Date;
  gates: Array<Parameters<typeof serializeGate>[0]>;
}): PilotRequirementListItem {
  const gates = requirement.gates.map(serializeGate);
  return {
    id: requirement.id,
    title: positionFor(requirement.fleetPositionSlug, requirement.title)?.title ?? requirement.title,
    fleetPositionSlug: requirement.fleetPositionSlug,
    advertisedTitle: requirement.advertisedTitle,
    status: requirement.status,
    reviewStatus: requirement.reviewStatus,
    operatorType: requirement.operatorType,
    pilotSeat: requirement.pilotSeat,
    aircraftTypes: parseStringArray(requirement.aircraftTypesJson),
    base: formatBase(requirement.baseCity, requirement.baseState, requirement.baseAirport),
    baseCity: requirement.baseCity,
    baseState: requirement.baseState,
    baseAirport: requirement.baseAirport,
    updatedAt: requirement.updatedAt.toISOString(),
    activeGateCount: gates.filter((gate) => gate.enabled).length,
    numericSummary: getNumericSummary(gates)
  };
}

function groupGates(gates: RequirementGateView[]) {
  const groups = new Map<string, RequirementGateView[]>();
  for (const gate of gates) {
    if (!gate.enabled) {
      continue;
    }

    const group = groups.get(gate.category) ?? [];
    group.push(gate);
    groups.set(gate.category, group);
  }

  return Array.from(groups.entries()).map(([category, group]) => ({ category, gates: group }));
}

// Like groupGates but keeps disabled gates too — the editor needs every gate so
// any requirement (e.g. jet time, turbine time) can be turned on.
function groupAllGates(gates: RequirementGateView[]) {
  const groups = new Map<string, RequirementGateView[]>();
  for (const gate of gates) {
    const group = groups.get(gate.category) ?? [];
    group.push(gate);
    groups.set(gate.category, group);
  }

  return Array.from(groups.entries()).map(([category, group]) => ({ category, gates: group }));
}

export async function getPilotRequirementsData(query = "", selectedId?: string): Promise<PilotRequirementsData> {
  // Hide requirements whose source job was merged away as a duplicate. Requirements
  // with no source job stay visible. This mirrors the deduped Jobs list and self-heals:
  // unmerging the source job brings its requirement back automatically.
  const hideMergedSourceJob = {
    NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } }
  };

  const [rows, total, active, needsReview, catalogItems, scannedCount] = await Promise.all([
    prisma.pilotRequirement.findMany({
      where: hideMergedSourceJob,
      orderBy: [{ status: "asc" }, { title: "asc" }],
      include: {
        sourceJobRecord: {
          select: {
            title: true,
            status: true
          }
        },
        gates: {
          orderBy: [{ category: "asc" }, { sortOrder: "asc" }]
        }
      }
    }),
    prisma.pilotRequirement.count({ where: hideMergedSourceJob }),
    prisma.pilotRequirement.count({ where: { ...hideMergedSourceJob, status: "ACTIVE" } }),
    prisma.pilotRequirement.count({ where: { ...hideMergedSourceJob, reviewStatus: { not: "APPROVED" } } }),
    prisma.requirementCatalogItem.count({ where: { archivedAt: null } }),
    prisma.candidate.count({ where: { status: "ACTIVE" } })
  ]);

  const allListItems = rows.map(toListItem);
  const requirements = allListItems
    .filter((requirement) => matchesSearch(requirement, query))
    // Canonical order: SkyShare vs Managed, then fleet size order, then seat, then title.
    .sort(
      (a, b) =>
        operatorRank(a.operatorType) - operatorRank(b.operatorType) ||
        bestFleetOrder(a.aircraftTypes, a.title) - bestFleetOrder(b.aircraftTypes, b.title) ||
        fleetSeatRank(a.pilotSeat) - fleetSeatRank(b.pilotSeat) ||
        a.title.localeCompare(b.title)
    );
  const selectedRow =
    rows.find((row) => row.id === selectedId) ??
    rows.find((row) => requirements.some((requirement) => requirement.id === row.id)) ??
    rows[0] ??
    null;

  const selectedListItem = selectedRow ? toListItem(selectedRow) : null;
  const selectedGates = selectedRow?.gates.map(serializeGate) ?? [];
  const selectedRequirement: PilotRequirementDetail | null =
    selectedRow && selectedListItem
      ? {
          ...selectedListItem,
          version: selectedRow.requirementVersion,
          payScaleRaw: selectedRow.payScaleRaw,
          sourceJobTitle: selectedRow.sourceJobRecord?.title ?? null,
          sourceJobStatus: selectedRow.sourceJobRecord?.status ?? null,
          rawMinimumRequirements: selectedRow.rawMinimumRequirements,
          originalJobDescriptionText: selectedRow.originalJobDescriptionText,
          extractionConfidence: selectedRow.extractionConfidence,
          extractionWarnings: parseStringArray(selectedRow.extractionWarningsJson),
          gatesByCategory: groupGates(selectedGates),
          editableGatesByCategory: groupAllGates(selectedGates)
        }
      : null;

  const selectedAircraftTypes = selectedRow ? parseStringArray(selectedRow.aircraftTypesJson) : [];
  const [scoringConfig, requirementFeedback] = selectedRow
    ? await Promise.all([
        getProfileScoringConfig(selectedAircraftTypes[0] ?? null, selectedRow.pilotSeat),
        getRequirementFeedback(selectedRow.id)
      ])
    : [undefined, {}];

  const candidateMatches = await getPilotRequirementCandidateMatches(
    selectedRow
      ? {
          id: selectedRow.id,
          title: selectedRow.title,
          pilotSeat: selectedRow.pilotSeat,
          aircraftTypesJson: selectedRow.aircraftTypesJson,
          baseCity: selectedRow.baseCity,
          baseState: selectedRow.baseState,
          baseAirport: selectedRow.baseAirport,
          gates: selectedRow.gates
            .filter((gate) => gate.enabled)
            .map((gate) => ({
              key: gate.key,
              label: gate.label,
              category: gate.category,
              valueType: gate.valueType,
              numericValue: gate.numericValue
            }))
        }
      : null,
    scoringConfig,
    requirementFeedback
  );

  return {
    requirements,
    selectedRequirement,
    candidateMatches,
    canEditScoring: await canEditScoring(),
    scannedCount,
    stats: {
      total,
      active,
      needsReview,
      catalogItems
    }
  };
}
