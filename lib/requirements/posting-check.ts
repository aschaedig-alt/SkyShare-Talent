import { prisma } from "@/lib/prisma";
import { readJobPost, type JobPostReading } from "@/lib/extraction/job-post-llm";

/**
 * Compare a pilot requirement's GATES against the JOB POSTING they were built from,
 * and report every place the two disagree.
 *
 * READ-ONLY. This module never writes. A finding is a question for a person, and
 * accepting one only fills the editor's form — the existing "Save requirement"
 * button is still what commits it. That separation is deliberate: the reader was
 * measured wrong at least once on the nine live roles (it read a sentence describing
 * the flight department as a Part 135 requirement), so nothing it says should reach
 * the database without someone agreeing to it.
 *
 * What this caught on its first real run, 2026-08-30: the G450 & GV Captain gates
 * said 4,000 total time where the posting said 5,000, and 2,000 jet where the
 * posting said 1,500 — a live role with 31 applications, simultaneously letting
 * through pilots below the stated minimum and screening out qualified ones.
 */

export type PostingCheckFinding =
  /** Gate is on with a number, the posting states a different one. */
  | { kind: "hours-differ"; gateId: string; key: string; label: string; storedValue: number; postingValue: number; evidence: string }
  /** Posting states an hour minimum; the gate is off or carries no number. */
  | { kind: "hours-missing"; gateId: string; key: string; label: string; storedValue: number | null; postingValue: number; evidence: string }
  /** Gate is on, the posting does not mention it. NOT offered for one-click apply. */
  | { kind: "hours-not-in-posting"; gateId: string; key: string; label: string; storedValue: number }
  /** Posting requires something; the matching gate is off. */
  | { kind: "boolean-missing"; gateId: string; key: string; label: string; evidence: string }
  /** A real requirement no catalog gate can express. Nothing to apply. */
  | { kind: "unmappable"; description: string; evidence: string; whyNoGate: string };

export type PostingCheckResult = {
  ok: boolean;
  error?: string;
  requirementId: string;
  requirementTitle: string;
  /** Characters of posting text the check actually read. */
  sourceChars: number;
  readAs: { roleTitle: string; seat: string; aircraft: string[] } | null;
  findings: PostingCheckFinding[];
  /** Gates the posting confirmed unchanged — the reassuring half, counted not listed. */
  agreedCount: number;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
};

/** Findings a person can accept with one click. The rest are for reading only. */
export function isApplyable(finding: PostingCheckFinding) {
  return finding.kind === "hours-differ" || finding.kind === "hours-missing" || finding.kind === "boolean-missing";
}

/**
 * Order findings by how much they cost to be wrong about. A stored number that
 * contradicts the posting is actively mis-screening people right now; a requirement
 * no gate can hold is a gap to think about later.
 */
const KIND_ORDER: Record<PostingCheckFinding["kind"], number> = {
  "hours-differ": 0,
  "hours-missing": 1,
  "boolean-missing": 2,
  "hours-not-in-posting": 3,
  unmappable: 4
};

function diff(
  reading: JobPostReading,
  gates: Array<{ id: string; key: string; label: string; valueType: string; enabled: boolean; numericValue: number | null }>
) {
  const findings: PostingCheckFinding[] = [];
  let agreed = 0;

  const gateByKey = new Map(gates.map((g) => [g.key, g]));
  const readHourKeys = new Set(reading.hour_minimums.map((h) => h.key));

  for (const hour of reading.hour_minimums) {
    const gate = gateByKey.get(hour.key);
    // A key the catalog no longer carries. The schema should prevent this, but a
    // catalog item archived between two runs would produce exactly this.
    if (!gate) continue;

    if (gate.enabled && gate.numericValue != null) {
      if (gate.numericValue === hour.value) agreed += 1;
      else
        findings.push({
          kind: "hours-differ",
          gateId: gate.id,
          key: gate.key,
          label: gate.label,
          storedValue: gate.numericValue,
          postingValue: hour.value,
          evidence: hour.evidence
        });
    } else {
      findings.push({
        kind: "hours-missing",
        gateId: gate.id,
        key: gate.key,
        label: gate.label,
        storedValue: gate.numericValue,
        postingValue: hour.value,
        evidence: hour.evidence
      });
    }
  }

  // Gates set to a number the posting never mentions. Surfaced but never offered as
  // a one-click change: the reader missing a line looks identical to the posting not
  // containing one, and switching a live gate off on that basis is the expensive
  // direction to be wrong in.
  for (const gate of gates) {
    if (gate.valueType !== "hours" || !gate.enabled || gate.numericValue == null) continue;
    if (readHourKeys.has(gate.key)) continue;
    findings.push({
      kind: "hours-not-in-posting",
      gateId: gate.id,
      key: gate.key,
      label: gate.label,
      storedValue: gate.numericValue
    });
  }

  for (const bool of reading.boolean_requirements) {
    if (!bool.required) continue;
    const gate = gateByKey.get(bool.key);
    if (!gate || gate.valueType === "hours") continue;
    if (gate.enabled) {
      agreed += 1;
      continue;
    }
    findings.push({ kind: "boolean-missing", gateId: gate.id, key: gate.key, label: gate.label, evidence: bool.evidence });
  }

  for (const u of reading.unmappable_requirements) {
    findings.push({ kind: "unmappable", description: u.description, evidence: u.evidence, whyNoGate: u.why_no_gate });
  }

  findings.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
  return { findings, agreed };
}

/** Run the check for one requirement. Never writes. */
export async function checkRequirementAgainstPosting(requirementId: string): Promise<PostingCheckResult> {
  const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  const requirement = await prisma.pilotRequirement.findUnique({
    where: { id: requirementId },
    select: {
      id: true,
      title: true,
      originalJobDescriptionText: true,
      rawMinimumRequirements: true,
      gates: { select: { id: true, key: true, label: true, valueType: true, enabled: true, numericValue: true } }
    }
  });

  if (!requirement) {
    return {
      ok: false,
      error: "Requirement not found.",
      requirementId,
      requirementTitle: "",
      sourceChars: 0,
      readAs: null,
      findings: [],
      agreedCount: 0,
      usage: zero
    };
  }

  // Prefer the full posting; fall back to the minimum-requirements block, which is
  // all some rows carry.
  const text = (requirement.originalJobDescriptionText || requirement.rawMinimumRequirements || "").trim();

  const catalog = await prisma.requirementCatalogItem.findMany({
    where: { archivedAt: null },
    select: { key: true, valueType: true }
  });
  const hourKeys = catalog.filter((c) => c.valueType === "hours").map((c) => c.key);
  const booleanKeys = catalog.filter((c) => c.valueType !== "hours").map((c) => c.key);

  const { reading, usage, error } = await readJobPost(text, hourKeys, booleanKeys);

  if (!reading) {
    return {
      ok: false,
      error: error ?? "The posting could not be read.",
      requirementId: requirement.id,
      requirementTitle: requirement.title,
      sourceChars: text.length,
      readAs: null,
      findings: [],
      agreedCount: 0,
      usage
    };
  }

  const { findings, agreed } = diff(reading, requirement.gates);

  return {
    ok: true,
    requirementId: requirement.id,
    requirementTitle: requirement.title,
    sourceChars: text.length,
    readAs: { roleTitle: reading.role_title, seat: reading.seat, aircraft: reading.aircraft },
    findings,
    agreedCount: agreed,
    usage
  };
}
