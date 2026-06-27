import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { generateCandidateSummary, AiSummaryNotConfiguredError } from "@/lib/archive/ai-summary";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:read");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const summary = await prisma.candidateAiSummary.findUnique({ where: { candidateId: id } });
  if (!summary) return NextResponse.json({ summary: null });
  return NextResponse.json({ summary: summary.summary, generatedAt: summary.generatedAt.toISOString() });
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
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
