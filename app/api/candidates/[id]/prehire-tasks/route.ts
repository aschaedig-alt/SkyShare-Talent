import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission, authFailureResponse } from "@/lib/auth/route-auth";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";
import { getCandidateStageSections } from "@/lib/data/onboarding-grid-config";
import { isPreHireStatus, setPreHireTick } from "@/lib/onboarding/prehire";
import { logActivity } from "@/lib/activity/logger";

/**
 * PATCH /api/candidates/[id]/prehire-tasks — set one pre-offer checklist step
 * (the PRD section) on a candidate: { key, status: "TODO" | "DONE" | "NA" }.
 *
 * Only keys in a section the layout says starts on the candidate are accepted,
 * so this cannot become a side door for writing arbitrary keys onto a person.
 *
 * ONCE THERE IS A HIRE, the hire's own task row is written instead. The page
 * already sends hire-owned steps to /api/onboarding-tasks/[id], so this branch
 * only catches a page left open across the move into onboarding — and writing
 * the candidate's stored copy then would be writing to history the hire's
 * checklist no longer reads. See lib/onboarding/prehire.ts.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return authFailureResponse(auth);

  const { id } = await params;
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { key?: unknown; status?: unknown };
  const key = typeof body.key === "string" ? body.key : "";
  if (!isPreHireStatus(body.status)) {
    return NextResponse.json({ message: "Invalid status." }, { status: 400 });
  }
  const status = body.status;

  const sections = await getCandidateStageSections();
  const task = sections.flatMap((s) => s.tasks).find((t) => t.key === key);
  if (!task) {
    return NextResponse.json({ message: "That step is not one worked on the candidate." }, { status: 400 });
  }

  try {
    const hire = await prisma.newHire.findFirst({ where: { candidateId: id }, select: { id: true } });
    if (hire) {
      const updated = await prisma.onboardingTask.updateMany({
        where: { newHireId: hire.id, key },
        data: { status, completedAt: status === "DONE" ? new Date() : null }
      });
      return NextResponse.json({ ok: true, hireId: hire.id, updated: updated.count });
    }

    const actor = auth.user.email ?? auth.user.name ?? null;
    const ticks = await setPreHireTick(id, key, status, actor);
    await logActivity({
      userId: auth.user.id ?? undefined,
      userEmail: auth.user.email ?? undefined,
      activityType: "CANDIDATE_EDITED",
      description: `Pre-offer step "${task.label}" set to ${status === "NA" ? "N/A" : status === "DONE" ? "done" : "to do"}`,
      entityType: "Candidate",
      entityId: id,
      metadata: { taskKey: key, status }
    });
    return NextResponse.json({ ok: true, tick: ticks[key] });
  } catch (error) {
    console.error("Pre-hire task update error:", error);
    return NextResponse.json({ message: "Unable to save that step." }, { status: 500 });
  }
}
