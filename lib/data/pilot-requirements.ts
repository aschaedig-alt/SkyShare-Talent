import { prisma } from "@/lib/prisma";
import { positionFor, fleetPositionBySlug, resolveFleetPosition } from "@/lib/fleet/positions";
import { parseStringArray } from "@/lib/json";

// A pilot requirement is the rule sheet for one pilot job, so it lives on that
// job's page as the "Pilot requirement" tab (/recruiting-jobs/<id>?tab=requirement).
// This module builds what that tab shows. The old standalone Pilot Requirements
// workspace, and the loader it had here, are gone: /pilot-requirements now only
// forwards an old link to the job that owns the requirement.

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

export type ManagedVariantView = {
  id: string;
  tailNumber: string;
  name: string | null;
  baseCity: string | null;
  baseState: string | null;
  baseAirport: string | null;
  payScaleRaw: string | null;
  scheduleSummary: string | null;
  notes: string | null;
  status: string;
};

export type PilotRequirementDetail = PilotRequirementListItem & {
  version: number;
  payScaleRaw: string | null;
  managedVariants: ManagedVariantView[];
  /** Additional fleet positions this role also covers (dual-aircraft). */
  linkedPositions: Array<{ slug: string; title: string }>;
  sourceJobTitle: string | null;
  sourceJobStatus: string | null;
  rawMinimumRequirements: string | null;
  originalJobDescriptionText: string | null;
  extractionConfidence: number | null;
  extractionWarnings: string[];
  // Only the enabled gates, grouped for the read-only blocks.
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

/** One saved edit, already put into words. The raw JSON never leaves the server. */
export type RequirementChangeView = {
  id: string;
  at: string;
  /** Null when nobody was recorded. The original editor wrote "local-user" for everyone. */
  by: string | null;
  /** The person's own note, when they wrote one. */
  note: string | null;
  summary: string;
  details: string[];
};

/**
 * The job this requirement is saved together with, and where the two rows
 * disagree today.
 *
 * Only a DIRECT link makes a pair. Seat, aircraft and base are stored on both
 * rows; the job's copy is edited from the job page and the requirement's copy is
 * what the Matchboard scores from, and until the Role block wrote both together
 * nothing kept them the same. Measured Sep 23: 9 of the 20 direct pairs list
 * different aircraft. They are shown, not reconciled — which one is right is a
 * person's call.
 */
export type RolePairView = {
  jobId: string;
  jobTitle: string;
  seat: string | null;
  aircraftTypes: string[];
  city: string | null;
  state: string | null;
  differs: { seat: boolean; aircraft: boolean; base: boolean };
};

export type JobRequirementView = PilotRequirementDetail & {
  /** The fleet position the Matchboard files this under, or null when none resolves. */
  positionTitle: string | null;
  /** True when a person picked the fleet position; false when it was matched from the title. */
  positionChosen: boolean;
  createdAt: string;
  lastReviewedAt: string | null;
  /**
   * How it belongs to the job whose page it is on. "merged": its own job was
   * merged into this one and the merge never re-pointed the requirement.
   * "none": no live job at all.
   */
  link: "direct" | "merged" | "none";
  mergedFromJobTitle: string | null;
  pair: RolePairView | null;
  changes: RequirementChangeView[];
};

export type RequirementSuggestion = {
  id: string;
  title: string;
  status: string;
  operatorType: string | null;
  pilotSeat: string | null;
  tails: string[];
};

export type JobRequirementTabData = {
  requirements: JobRequirementView[];
  /** Requirements with no job that look like this job's. Only filled when it has none. */
  suggestions: RequirementSuggestion[];
};

export type NoJobRequirement = {
  id: string;
  title: string;
  fleetPositionSlug: string | null;
  status: string;
  reviewStatus: string;
  operatorType: string | null;
  pilotSeat: string | null;
  aircraftTypes: string[];
  tails: string[];
  enabledGateCount: number;
  gateCount: number;
  /** The job it came from, when that job was merged into one that no longer exists. */
  lostJobTitle: string | null;
};

export type NoJobRequirementPage = {
  requirement: JobRequirementView;
  /** Live pilot jobs that look like this requirement's, for the person to open and attach from. */
  matchingJobs: Array<{ id: string; title: string; status: string; hasRequirement: boolean }>;
};

/**
 * Requirement statuses that are in use. HISTORICAL, RETIRED and ARCHIVED rows are
 * earlier versions of a role, kept for their gates and history; the old Pilot
 * Requirements list hid them too.
 */
const CURRENT_STATUSES = ["ACTIVE", "INACTIVE", "EVERGREEN"];

const STATUS_ORDER: Record<string, number> = { ACTIVE: 0, EVERGREEN: 1, INACTIVE: 2 };

function formatBase(city: string | null, state: string | null, airport: string | null) {
  const location = [city, state].filter(Boolean).join(", ");
  return [airport, location].filter(Boolean).join(" - ") || null;
}

function serializeGate(gate: RequirementGateView): RequirementGateView {
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

function getNumericSummary(gates: RequirementGateView[]) {
  const priority = ["total_time", "pic_time", "sic_time", "multi_engine_time", "turbine_time", "jet_time"];
  return priority
    .map((key) => gates.find((gate) => gate.key === key && gate.enabled && typeof gate.numericValue === "number"))
    .filter((gate): gate is RequirementGateView => Boolean(gate))
    .slice(0, 5)
    .map((gate) => ({ label: gate.label, value: gate.numericValue ?? 0 }));
}

function groupGates(gates: RequirementGateView[], enabledOnly: boolean) {
  const groups = new Map<string, RequirementGateView[]>();
  for (const gate of gates) {
    if (enabledOnly && !gate.enabled) continue;
    const group = groups.get(gate.category) ?? [];
    group.push(gate);
    groups.set(gate.category, group);
  }
  return Array.from(groups.entries()).map(([category, group]) => ({ category, gates: group }));
}

// --- Which job does a requirement belong to? --------------------------------

type JobNode = { id: string; title: string; status: string; isPilotRole: boolean; mergedIntoJobId: string | null };

/**
 * Every job's merge pointer, so a requirement can be followed to the job that
 * survived. 152 small rows today; one query instead of one per hop.
 *
 * WHY THIS IS NEEDED: merging duplicate jobs never re-pointed their requirements
 * at the surviving job. Measured Sep 23: 36 of 65 requirements hang off a job
 * that was merged away — 4 of them current (Inactive) versions of a role, the
 * other 32 superseded (Historical) ones. Read naively they look like requirements
 * with no job at all; followed through mergedIntoJobId, every one lands on a live
 * job.
 */
async function loadJobGraph() {
  const jobs: JobNode[] = await prisma.job.findMany({
    select: { id: true, title: true, status: true, isPilotRole: true, mergedIntoJobId: true }
  });
  const byId = new Map(jobs.map((job) => [job.id, job]));

  /** The live job at the end of the merge chain, or null when it ends nowhere. */
  function survivor(jobId: string | null | undefined): JobNode | null {
    let current = jobId ? byId.get(jobId) ?? null : null;
    const seen = new Set<string>();
    while (current && current.mergedIntoJobId) {
      if (seen.has(current.id)) return null;
      seen.add(current.id);
      current = byId.get(current.mergedIntoJobId) ?? null;
    }
    return current;
  }

  /** Jobs merged (directly or down a chain) into this one. */
  function mergedInto(jobId: string): string[] {
    return jobs.filter((job) => job.mergedIntoJobId && survivor(job.id)?.id === jobId).map((job) => job.id);
  }

  return { jobs, byId, survivor, mergedInto };
}

// --- "Looks like the same role" ----------------------------------------------

function titleKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+]+/g, " ").trim();
}

/**
 * A suggestion, never a link. True when one title contains the other as whole
 * words ("M2 Captain" inside "M2 Captain & PC-12 Captain"), or both resolve to
 * the same fleet position ("Citation CE-525 (M2) Captain" and "M2 Captain").
 */
function looksLikeSameRole(jobTitle: string, requirementTitle: string, requirementSlug: string | null) {
  const job = titleKey(jobTitle);
  const requirement = titleKey(requirementTitle);
  if (!job || !requirement) return false;
  if (` ${job} `.includes(` ${requirement} `) || ` ${requirement} `.includes(` ${job} `)) return true;
  const jobPosition = resolveFleetPosition(jobTitle);
  const requirementPosition = positionFor(requirementSlug, requirementTitle);
  return Boolean(jobPosition && requirementPosition && jobPosition.slug === requirementPosition.slug);
}

// --- Change history -----------------------------------------------------------

// The one note the original editor wrote when the person left the box empty.
// Showing it on every row would only repeat "something was saved".
const DEFAULT_CHANGE_NOTE = "Updated pilot requirement profile.";

// Field keys as every writer records them, in the order they read best.
const CHANGE_FIELDS: Array<[string, string]> = [
  ["job", "Job"],
  ["title", "Name"],
  ["status", "Status"],
  ["reviewStatus", "Review"],
  ["operatorType", "Operator"],
  ["pilotSeat", "Seat"],
  ["aircraftTypes", "Aircraft"],
  ["baseAirport", "Base airport"],
  ["baseCity", "Base city"],
  ["baseState", "Base state"],
  ["payScaleRaw", "Pay"]
];

const MAX_CHANGE_DETAILS = 8;

function readJson(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function sentenceCase(value: string) {
  return value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, " ");
}

function describeValue(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "none";
  if (value === null || value === undefined || value === "") return "blank";
  if (typeof value === "number") return value.toLocaleString("en-US");
  const text = String(value);
  // Status and review values are stored shouting ("NEEDS_REVIEW").
  const shown = /^[A-Z_]+$/.test(text) ? sentenceCase(text) : text;
  return shown.length > 80 ? `${shown.slice(0, 77)}...` : shown;
}

type GateSnapshot = { id?: unknown; label?: unknown; enabled?: unknown; numericValue?: unknown; textValue?: unknown; evidenceText?: unknown };

function isGateSnapshot(value: unknown): value is GateSnapshot {
  return Boolean(value) && typeof value === "object";
}

/**
 * Gate edits by name. The editor stores the full gate rows before the save and
 * only id/enabled/value/text after it, so the label comes from the "before" side.
 */
function describeGateChanges(before: unknown, after: unknown): string[] {
  if (!Array.isArray(before) || !Array.isArray(after)) return [];
  const previous = new Map(before.filter(isGateSnapshot).map((gate) => [gate.id, gate]));
  const lines: string[] = [];
  let otherEdits = 0;
  for (const gate of after.filter(isGateSnapshot)) {
    const prior = previous.get(gate.id);
    if (!prior) continue;
    const label = typeof prior.label === "string" ? prior.label : "A requirement";
    const switched = Boolean(prior.enabled) !== Boolean(gate.enabled);
    const valueChanged = (prior.numericValue ?? null) !== (gate.numericValue ?? null);
    if (switched) lines.push(`${label} switched ${gate.enabled ? "on" : "off"}`);
    if (valueChanged) lines.push(`${label}: ${describeValue(prior.numericValue)} to ${describeValue(gate.numericValue)}`);
    if (!switched && !valueChanged && ((prior.textValue ?? null) !== (gate.textValue ?? null) || (prior.evidenceText ?? null) !== (gate.evidenceText ?? null))) {
      otherEdits += 1;
    }
  }
  if (otherEdits) lines.push(`${otherEdits} note or evidence edit${otherEdits === 1 ? "" : "s"}`);
  return lines;
}

function joinWords(words: string[]) {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

function summarizeChange(change: {
  id: string;
  changeNote: string | null;
  changedFieldsJson: string | null;
  previousValuesJson: string | null;
  newValuesJson: string | null;
  changedBy: string | null;
  changedAt: Date;
}): RequirementChangeView {
  const fields = readJson(change.changedFieldsJson);
  const before = readJson(change.previousValuesJson);
  const after = readJson(change.newValuesJson);

  const changed: string[] = [];
  const details: string[] = [];
  for (const [key, label] of CHANGE_FIELDS) {
    if (fields[key] !== true) continue;
    changed.push(label.toLowerCase());
    details.push(`${label}: ${describeValue(before[key])} to ${describeValue(after[key])}`);
  }
  const gateCount = typeof fields.gates === "number" ? fields.gates : 0;
  if (gateCount > 0) {
    changed.push(`${gateCount} requirement${gateCount === 1 ? "" : "s"}`);
    details.push(...describeGateChanges(before.gates, after.gates));
  }
  if (fields.jobChanged === true) details.push("Saved to the job as well, so the two match");

  const summary =
    fields.created === true ? "Set up" : changed.length > 0 ? `Changed ${joinWords(changed)}` : "Saved with no changes";
  const shown = details.slice(0, MAX_CHANGE_DETAILS);
  if (details.length > shown.length) shown.push(`and ${details.length - shown.length} more`);

  const by = change.changedBy && change.changedBy !== "local-user" ? change.changedBy : null;
  const note = change.changeNote && change.changeNote !== DEFAULT_CHANGE_NOTE ? change.changeNote : null;
  return { id: change.id, at: change.changedAt.toISOString(), by, note, summary, details: shown };
}

// --- Building one requirement's view -----------------------------------------

function aircraftKey(list: string[]) {
  return [...new Set(list.map((item) => item.trim().toLowerCase()).filter(Boolean))].sort().join("|");
}

function baseKey(city: string | null, state: string | null) {
  return [city, state].map((part) => (part ?? "").trim().toLowerCase()).join("|");
}

function findRequirementRows(where: Parameters<typeof prisma.pilotRequirement.findMany>[0]["where"]) {
  return prisma.pilotRequirement.findMany({
    where,
    include: {
      sourceJobRecord: {
        select: {
          id: true,
          title: true,
          status: true,
          mergedIntoJobId: true,
          pilotSeat: true,
          aircraftTypesJson: true,
          city: true,
          state: true
        }
      },
      gates: { orderBy: [{ category: "asc" }, { sortOrder: "asc" }] },
      managedVariants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      // Every edit is recorded, and until this tab nothing showed any of it.
      changes: { orderBy: { changedAt: "desc" }, take: 40 }
    }
  });
}

type RequirementRow = Awaited<ReturnType<typeof findRequirementRows>>[number];

function buildRequirementView(
  row: RequirementRow,
  link: JobRequirementView["link"],
  mergedFromJobTitle: string | null
): JobRequirementView {
  const gates = row.gates.map(serializeGate);
  const aircraftTypes = parseStringArray(row.aircraftTypesJson);
  const position = positionFor(row.fleetPositionSlug, row.title);

  const job = row.sourceJobRecord;
  let pair: RolePairView | null = null;
  if (link === "direct" && job && !job.mergedIntoJobId) {
    const jobAircraft = parseStringArray(job.aircraftTypesJson);
    pair = {
      jobId: job.id,
      jobTitle: job.title,
      seat: job.pilotSeat,
      aircraftTypes: jobAircraft,
      city: job.city,
      state: job.state,
      differs: {
        seat: (job.pilotSeat ?? "") !== (row.pilotSeat ?? ""),
        aircraft: aircraftKey(jobAircraft) !== aircraftKey(aircraftTypes),
        base: baseKey(job.city, job.state) !== baseKey(row.baseCity, row.baseState)
      }
    };
  }

  return {
    id: row.id,
    // The requirement's OWN stored name. The old workspace showed the canonical
    // fleet-position title here, which also pre-filled the editor's name box, so
    // saving any gate quietly renamed the requirement. The fleet position is
    // shown on its own line instead.
    title: row.title,
    fleetPositionSlug: row.fleetPositionSlug,
    advertisedTitle: row.advertisedTitle,
    status: row.status,
    reviewStatus: row.reviewStatus,
    operatorType: row.operatorType,
    pilotSeat: row.pilotSeat,
    aircraftTypes,
    base: formatBase(row.baseCity, row.baseState, row.baseAirport),
    baseCity: row.baseCity,
    baseState: row.baseState,
    baseAirport: row.baseAirport,
    updatedAt: row.updatedAt.toISOString(),
    activeGateCount: gates.filter((gate) => gate.enabled).length,
    numericSummary: getNumericSummary(gates),
    version: row.requirementVersion,
    payScaleRaw: row.payScaleRaw,
    managedVariants: row.managedVariants.map((variant) => ({
      id: variant.id,
      tailNumber: variant.tailNumber,
      name: variant.name,
      baseCity: variant.baseCity,
      baseState: variant.baseState,
      baseAirport: variant.baseAirport,
      payScaleRaw: variant.payScaleRaw,
      scheduleSummary: variant.scheduleSummary,
      notes: variant.notes,
      status: variant.status
    })),
    linkedPositions: parseStringArray(row.linkedFleetPositionSlugs).map((slug) => ({
      slug,
      title: fleetPositionBySlug(slug)?.title ?? slug
    })),
    sourceJobTitle: job?.title ?? null,
    sourceJobStatus: job?.status ?? null,
    rawMinimumRequirements: row.rawMinimumRequirements,
    originalJobDescriptionText: row.originalJobDescriptionText,
    extractionConfidence: row.extractionConfidence,
    extractionWarnings: parseStringArray(row.extractionWarningsJson),
    gatesByCategory: groupGates(gates, true),
    editableGatesByCategory: groupGates(gates, false),
    positionTitle: position?.title ?? null,
    positionChosen: Boolean(row.fleetPositionSlug && fleetPositionBySlug(row.fleetPositionSlug)),
    createdAt: row.createdAt.toISOString(),
    lastReviewedAt: row.lastReviewedAt ? row.lastReviewedAt.toISOString() : null,
    link,
    mergedFromJobTitle,
    pair,
    changes: row.changes.map(summarizeChange)
  };
}

function statusRank(status: string) {
  return STATUS_ORDER[status] ?? 3;
}

// --- Public loaders -------------------------------------------------------------

/**
 * Everything a job's Pilot requirement tab shows.
 *
 * The job's own requirements (any status) come first, then the CURRENT ones left
 * behind on jobs that were merged into it. Superseded (Historical) versions from
 * merged jobs are not listed — the Pilot Requirements page never listed them
 * either — except the one an old link asked for by id, so the link still lands
 * on exactly what it pointed at.
 */
export async function getJobRequirementTab(
  jobId: string,
  requestedRequirementId?: string | null
): Promise<JobRequirementTabData> {
  const graph = await loadJobGraph();
  const job = graph.byId.get(jobId);
  if (!job || job.mergedIntoJobId) return { requirements: [], suggestions: [] };

  const mergedIds = graph.mergedInto(jobId);
  const rows = await findRequirementRows({
    OR: [
      { sourceJobRecordId: jobId },
      ...(mergedIds.length > 0
        ? [
            { sourceJobRecordId: { in: mergedIds }, status: { in: CURRENT_STATUSES } },
            ...(requestedRequirementId ? [{ id: requestedRequirementId, sourceJobRecordId: { in: mergedIds } }] : [])
          ]
        : [])
    ]
  });

  const requirements = rows
    .map((row) =>
      row.sourceJobRecordId === jobId
        ? buildRequirementView(row, "direct", null)
        : buildRequirementView(row, "merged", row.sourceJobRecord?.title ?? null)
    )
    .sort(
      (a, b) =>
        (a.link === "direct" ? 0 : 1) - (b.link === "direct" ? 0 : 1) ||
        statusRank(a.status) - statusRank(b.status) ||
        a.title.localeCompare(b.title)
    );

  const suggestions: RequirementSuggestion[] = [];
  if (requirements.length === 0 && job.isPilotRole) {
    for (const candidate of await listNoJobRequirements(graph)) {
      if (looksLikeSameRole(job.title, candidate.title, candidate.fleetPositionSlug)) {
        suggestions.push({
          id: candidate.id,
          title: candidate.title,
          status: candidate.status,
          operatorType: candidate.operatorType,
          pilotSeat: candidate.pilotSeat,
          tails: candidate.tails
        });
      }
    }
  }

  return { requirements, suggestions: suggestions.slice(0, 3) };
}

/**
 * Requirements that belong to no live job: never attached to one, or attached to
 * a job whose merge chain ends at a job that no longer exists. Listed under the
 * Jobs list so they stay findable and editable now that there is no requirements
 * page to find them on.
 */
export async function getNoJobRequirements(): Promise<NoJobRequirement[]> {
  return listNoJobRequirements(await loadJobGraph());
}

async function listNoJobRequirements(graph: Awaited<ReturnType<typeof loadJobGraph>>): Promise<NoJobRequirement[]> {
  const lostJobIds = graph.jobs.filter((job) => !graph.survivor(job.id)).map((job) => job.id);
  const rows = await prisma.pilotRequirement.findMany({
    where: {
      OR: [{ sourceJobRecordId: null }, ...(lostJobIds.length > 0 ? [{ sourceJobRecordId: { in: lostJobIds } }] : [])]
    },
    select: {
      id: true,
      title: true,
      fleetPositionSlug: true,
      status: true,
      reviewStatus: true,
      operatorType: true,
      pilotSeat: true,
      aircraftTypesJson: true,
      sourceJobRecordId: true,
      managedVariants: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { tailNumber: true } },
      gates: { select: { enabled: true } }
    }
  });

  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      fleetPositionSlug: row.fleetPositionSlug,
      status: row.status,
      reviewStatus: row.reviewStatus,
      operatorType: row.operatorType,
      pilotSeat: row.pilotSeat,
      aircraftTypes: parseStringArray(row.aircraftTypesJson),
      tails: row.managedVariants.map((variant) => variant.tailNumber),
      enabledGateCount: row.gates.filter((gate) => gate.enabled).length,
      gateCount: row.gates.length,
      lostJobTitle: row.sourceJobRecordId ? graph.byId.get(row.sourceJobRecordId)?.title ?? null : null
    }))
    .sort((a, b) => statusRank(a.status) - statusRank(b.status) || a.title.localeCompare(b.title));
}

/**
 * Where a requirement lives now: the live job it resolves to (following merges),
 * or null for one with no job. `exists` is false for an id that matches nothing.
 */
export async function resolveRequirementHome(requirementId: string): Promise<{ exists: boolean; jobId: string | null }> {
  const row = await prisma.pilotRequirement.findUnique({
    where: { id: requirementId },
    select: { sourceJobRecordId: true }
  });
  if (!row) return { exists: false, jobId: null };
  if (!row.sourceJobRecordId) return { exists: true, jobId: null };
  const graph = await loadJobGraph();
  return { exists: true, jobId: graph.survivor(row.sourceJobRecordId)?.id ?? null };
}

/** The page for a requirement with no job: its full view, plus jobs that look like its own. */
export async function getNoJobRequirementPage(requirementId: string): Promise<NoJobRequirementPage | null> {
  const [rows, jobs] = await Promise.all([
    findRequirementRows({ id: requirementId }),
    prisma.job.findMany({
      where: { mergedIntoJobId: null, isPilotRole: true },
      orderBy: { title: "asc" },
      select: { id: true, title: true, status: true, _count: { select: { pilotRequirements: true } } }
    })
  ]);
  const row = rows[0];
  if (!row) return null;

  return {
    requirement: buildRequirementView(row, "none", null),
    matchingJobs: jobs
      .filter((job) => looksLikeSameRole(job.title, row.title, row.fleetPositionSlug))
      .map((job) => ({ id: job.id, title: job.title, status: job.status, hasRequirement: job._count.pilotRequirements > 0 }))
  };
}

/**
 * How many CURRENT requirements each live job holds only through a merge — added
 * to its own count so the jobs list and the tab chip agree with what the tab shows.
 */
export async function getMergedInRequirementCounts(): Promise<Map<string, number>> {
  const graph = await loadJobGraph();
  const mergedIds = graph.jobs.filter((job) => job.mergedIntoJobId).map((job) => job.id);
  const counts = new Map<string, number>();
  if (mergedIds.length === 0) return counts;

  const rows = await prisma.pilotRequirement.findMany({
    where: { sourceJobRecordId: { in: mergedIds }, status: { in: CURRENT_STATUSES } },
    select: { sourceJobRecordId: true }
  });
  for (const row of rows) {
    const live = graph.survivor(row.sourceJobRecordId);
    if (live) counts.set(live.id, (counts.get(live.id) ?? 0) + 1);
  }
  return counts;
}
