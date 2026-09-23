import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { hasPermission, isHrTeam, type RoleName } from "@/lib/auth/roles";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";
import { logActivity } from "@/lib/activity/logger";

/**
 * The hiring manager's offer details, pasted in as they sent them.
 *
 * WHY THIS ROUTE EXISTS AT ALL, rather than the box reading its text from the
 * page like every other offer field: this is the ONE place in the app allowed to
 * hold a pay amount (the user's decision on 2026-09-22, choosing it over a
 * version with the pay lines stripped). So the text must never travel to a
 * browser that should not see it. Loading it through its own HR-only route keeps
 * the gate in one place, on the server, for both reading and writing — where a
 * prop threaded down through two different pages would be a gate in four.
 *
 * GET answers { allowed, text, at, by } and tells a non-HR caller "allowed:
 * false" with NO text, rather than 403: the box simply does not render for them,
 * and a 403 in the console would itself say "there is something here".
 *
 * The same pattern as private HR notes (app/api/candidates/[id]/notes), which is
 * the precedent this follows deliberately.
 */

type Body = { text?: unknown };

/**
 * On localhost the auth bypass hands back an ADMIN with NO viewer (see
 * localBypassUser in lib/auth/route-auth.ts), so viewer?.isHr is undefined and
 * this box would be invisible in dev for the wrong reason. Falling back to the
 * role's own default answers the same question the viewer scope would have
 * — isHrTeam with no per-person override — so dev shows what an admin sees in
 * production, and a real session still goes through the viewer, per-person
 * override included.
 */
function viewerIsHr(user: { role: RoleName; viewer: { isHr: boolean } | null }): boolean {
  return user.viewer ? user.viewer.isHr : isHrTeam(user.role, null);
}

async function load(id: string) {
  return prisma.candidateApplication.findUnique({
    where: { id },
    select: { id: true, candidateId: true, offerDetailsText: true, offerDetailsAt: true, offerDetailsBy: true }
  });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;

  const app = await load(id);
  if (!app) return NextResponse.json({ message: "Application not found." }, { status: 404 });
  if (!isCandidateVisible(auth.user.viewer, app.candidateId)) {
    return NextResponse.json({ message: "Application not found." }, { status: 404 });
  }

  if (!viewerIsHr(auth.user)) return NextResponse.json({ allowed: false, text: null, at: null, by: null });
  return NextResponse.json({
    allowed: true,
    text: app.offerDetailsText,
    at: app.offerDetailsAt?.toISOString() ?? null,
    by: app.offerDetailsBy
  });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;

  const app = await load(id);
  if (!app) return NextResponse.json({ message: "Application not found." }, { status: 404 });
  if (!isCandidateVisible(auth.user.viewer, app.candidateId)) {
    return NextResponse.json({ message: "Application not found." }, { status: 404 });
  }
  // Both gates, not either: HR to see it at all, and the ordinary write
  // permission on top. Somebody on the HR team who cannot edit candidates can
  // read these details and cannot change them.
  if (!viewerIsHr(auth.user)) {
    return NextResponse.json({ message: "Only the HR team can see offer details." }, { status: 403 });
  }
  if (!hasPermission(auth.user.role, "candidates:write")) {
    return NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as Body;
  if (typeof body.text !== "string") {
    return NextResponse.json({ message: "Nothing to save." }, { status: 400 });
  }
  // A box holding only the blank template is empty, not filled in — otherwise
  // opening the box and clicking away would record "details received" forever.
  const text = body.text.trim();
  const next = text ? body.text : null;
  const by = auth.user.email ?? auth.user.name ?? null;

  const updated = await prisma.candidateApplication.update({
    where: { id },
    data: { offerDetailsText: next, offerDetailsAt: next ? new Date() : null, offerDetailsBy: next ? by : null },
    select: { offerDetailsAt: true, offerDetailsBy: true }
  });

  // WHAT was written is never logged, only THAT it changed and by whom. The
  // activity log is read by people outside HR, and the whole point of the gate is
  // that the amounts do not leave it. No metadata for the same reason.
  await logActivity({
    userId: auth.user.id ?? undefined,
    userEmail: auth.user.email ?? undefined,
    activityType: "CANDIDATE_EDITED",
    description: next
      ? "Saved the hiring manager's offer details (HR only; contents not recorded here)"
      : "Cleared the hiring manager's offer details",
    entityType: "Candidate",
    entityId: app.candidateId
  });

  return NextResponse.json({
    allowed: true,
    text: next,
    at: updated.offerDetailsAt?.toISOString() ?? null,
    by: updated.offerDetailsBy
  });
}
