import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { generateCandidateSummary, AiSummaryNotConfiguredError } from "@/lib/archive/ai-summary";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  // An off-allowlist candidate gets the SAME answer an unknown id gets, and here
  // that answer is { summary: null } rather than a 404 — this route never checks
  // that the candidate exists, so a 404 would be the one response that only ever
  // comes back for a real person the viewer is not allowed to see. Answering
  // before the query also keeps it off the database entirely.
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ summary: null });
  }

  const summary = await prisma.candidateAiSummary.findUnique({ where: { candidateId: id } });
  if (!summary) return NextResponse.json({ summary: null });
  return NextResponse.json({ summary: summary.summary, generatedAt: summary.generatedAt.toISOString() });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Already covered by candidates:write, which no allowlistable role holds — an
  // allowlisted viewer is 403'd above and never reaches this. Kept so generation
  // does not silently open up if that permission is ever widened. The message
  // matches what generateCandidateSummary throws for an unknown id, though this
  // returns 404 rather than letting it surface as a 500.
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  try {
    const result = await generateCandidateSummary(id, true);
    await logActivity({
      userId: auth.user?.id,
      userEmail: auth.user?.email,
      activityType: "CANDIDATE_AI_SUMMARY",
      description: "Generated AI summary",
      entityType: "Candidate",
      entityId: id
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AiSummaryNotConfiguredError) {
      return NextResponse.json({ message: err.message, notConfigured: true }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Failed to generate summary.";
    return NextResponse.json({ message }, { status: 500 });
  }
}
