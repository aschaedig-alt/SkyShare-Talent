"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { canEditScoring, saveScoringConfigDoc } from "@/lib/matching/scoring-config.server";
import { setMatchFeedback, type MatchVerdict } from "@/lib/matching/match-feedback";
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
export async function scanRequirementMatches(requirementId: string): Promise<ScanResult> {
  if (!requirementId) return { ok: false, error: "Missing requirement." };
  try {
    const scan = await runRequirementScan(requirementId);
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
  if (input.verdict !== "up" && input.verdict !== "down" && input.verdict !== null) {
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
