"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canEditScoring, saveScoringConfigDoc } from "@/lib/matching/scoring-config.server";
import { isScanExclusionReason, type ScanExclusionReason } from "@/lib/candidates/scan-exclusion";
import { fleetPositionBySlug } from "@/lib/fleet/positions";
import { setMatchFeedback, MATCH_VERDICTS, type MatchVerdict } from "@/lib/matching/match-feedback";
import { setTierOverride, OVERRIDE_TIERS, type OverrideTier } from "@/lib/matching/tier-override";
import { runRequirementScan, type RequirementScan } from "@/lib/matching/run-scan";

export type ActionResult = { ok: boolean; error?: string };
export type ScanResult = { ok: boolean; data?: RequirementScan; error?: string };

async function guard(): Promise<ActionResult | null> {
  if (!(await canEditScoring())) {
    return { ok: false, error: "Only recruiters and admins can change scoring." };
  }
  return null;
}

async function actorLabel(): Promise<string | null> {
  const session = await getServerSession(authOptions).catch(() => null);
  return session?.user?.email ?? session?.user?.name ?? null;
}

export async function saveScoringConfig(input: unknown): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;

  try {
    await saveScoringConfigDoc(input);
  } catch {
    return { ok: false, error: "Could not save scoring configuration." };
  }

  revalidatePath("/pilot-requirements");
  revalidatePath("/pilot-requirements/scoring");
  return { ok: true };
}

// Read-only re-scan of candidates for a requirement (no edit permission needed).
export async function scanRequirementMatches(requirementId: string, includeExcluded = false): Promise<ScanResult> {
  if (!requirementId) return { ok: false, error: "Missing requirement." };
  try {
    const scan = await runRequirementScan(requirementId, includeExcluded);
    return { ok: true, data: scan };
  } catch {
    return { ok: false, error: "Could not scan candidates." };
  }
}

export async function submitMatchFeedback(input: {
  requirementId: string;
  candidateId: string;
  verdict: MatchVerdict | null;
  reason?: string;
}): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;

  if (!input?.requirementId || !input?.candidateId) {
    return { ok: false, error: "Missing candidate or requirement." };
  }
  if (input.verdict !== null && !MATCH_VERDICTS.includes(input.verdict)) {
    return { ok: false, error: "Invalid feedback." };
  }

  try {
    await setMatchFeedback({
      requirementId: input.requirementId,
      candidateId: input.candidateId,
      verdict: input.verdict,
      reason: input.reason,
      by: await actorLabel(),
      nowIso: new Date().toISOString()
    });
  } catch {
    return { ok: false, error: "Could not save feedback." };
  }

  revalidatePath("/pilot-requirements");
  return { ok: true };
}

export async function setCandidateTier(input: {
  requirementId: string;
  candidateId: string;
  tier: OverrideTier | null; // null clears the manual move (back to the engine's tier)
}): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;

  if (!input?.requirementId || !input?.candidateId) {
    return { ok: false, error: "Missing candidate or requirement." };
  }
  if (input.tier !== null && !OVERRIDE_TIERS.includes(input.tier)) {
    return { ok: false, error: "Invalid tier." };
  }

  try {
    await setTierOverride({
      requirementId: input.requirementId,
      candidateId: input.candidateId,
      tier: input.tier
    });
  } catch {
    return { ok: false, error: "Could not move candidate." };
  }

  revalidatePath("/pilot-requirements");
  revalidatePath("/recruiting-jobs");
  return { ok: true };
}

export type CandidatePreview = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  status: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  owner: string | null;
  source: string | null;
  scanExcludedReason: string | null;
  scanExcludedNote: string | null;
  metrics: Array<{ key: string; label: string; value: string }>;
  fileCount: number;
  noteCount: number;
  applicationCount: number;
};

export type CandidatePreviewResult = { ok: boolean; data?: CandidatePreview; error?: string };

// Read-only compact profile for the screening preview pane (no edit permission needed).
export async function getCandidatePreview(candidateId: string): Promise<CandidatePreviewResult> {
  if (!candidateId) return { ok: false, error: "Missing candidate." };
  try {
    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        id: true,
        displayName: true,
        currentTitle: true,
        stage: true,
        status: true,
        primaryEmail: true,
        primaryPhone: true,
        owner: true,
        source: true,
        scanExcludedReason: true,
        scanExcludedNote: true,
        metrics: { select: { key: true, label: true, valueNumber: true, valueText: true, unit: true }, take: 14 },
        _count: { select: { files: true, notes: true, applications: true } }
      }
    });
    if (!candidate) return { ok: false, error: "Candidate not found." };

    const metrics = candidate.metrics
      .map((metric) => ({
        key: metric.key,
        label: metric.label,
        value:
          metric.valueNumber !== null && metric.valueNumber !== undefined
            ? `${metric.valueNumber.toLocaleString()}${metric.unit ? ` ${metric.unit}` : ""}`
            : metric.valueText ?? ""
      }))
      .filter((metric) => metric.value);

    return {
      ok: true,
      data: {
        id: candidate.id,
        displayName: candidate.displayName,
        currentTitle: candidate.currentTitle,
        stage: candidate.stage,
        status: candidate.status,
        primaryEmail: candidate.primaryEmail,
        primaryPhone: candidate.primaryPhone,
        owner: candidate.owner,
        source: candidate.source,
        scanExcludedReason: candidate.scanExcludedReason,
        scanExcludedNote: candidate.scanExcludedNote,
        metrics,
        fileCount: candidate._count.files,
        noteCount: candidate._count.notes,
        applicationCount: candidate._count.applications
      }
    };
  } catch {
    return { ok: false, error: "Could not load candidate." };
  }
}

export async function setRequirementFleetPosition(input: {
  requirementId: string;
  fleetPositionSlug: string | null; // null = clear (fall back to title matching)
  advertisedTitle: string | null;
}): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;
  if (!input?.requirementId) return { ok: false, error: "Missing requirement." };
  if (input.fleetPositionSlug && !fleetPositionBySlug(input.fleetPositionSlug)) {
    return { ok: false, error: "Unknown fleet position." };
  }

  try {
    await prisma.pilotRequirement.update({
      where: { id: input.requirementId },
      data: {
        fleetPositionSlug: input.fleetPositionSlug,
        advertisedTitle: input.advertisedTitle?.trim() ? input.advertisedTitle.trim().slice(0, 200) : null
      }
    });
  } catch {
    return { ok: false, error: "Could not save fleet position." };
  }

  revalidatePath("/pilot-requirements");
  revalidatePath("/matching");
  return { ok: true };
}

export async function setCandidateScanExclusion(input: {
  candidateId: string;
  reason: ScanExclusionReason | null; // null clears the exclusion (back in the pool)
  note?: string;
}): Promise<ActionResult> {
  const denied = await guard();
  if (denied) return denied;

  if (!input?.candidateId) return { ok: false, error: "Missing candidate." };
  if (input.reason !== null && !isScanExclusionReason(input.reason)) {
    return { ok: false, error: "Invalid exclusion reason." };
  }

  try {
    await prisma.candidate.update({
      where: { id: input.candidateId },
      data:
        input.reason === null
          ? { scanExcludedReason: null, scanExcludedNote: null, scanExcludedAt: null, scanExcludedBy: null }
          : {
              scanExcludedReason: input.reason,
              scanExcludedNote: (input.note ?? "").slice(0, 500) || null,
              scanExcludedAt: new Date(),
              scanExcludedBy: await actorLabel()
            }
    });
  } catch {
    return { ok: false, error: "Could not update candidate." };
  }

  revalidatePath("/recruiting-jobs");
  revalidatePath("/pilot-requirements");
  revalidatePath("/candidates");
  return { ok: true };
}
