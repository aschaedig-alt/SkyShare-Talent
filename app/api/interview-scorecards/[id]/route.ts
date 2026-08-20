import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { authFailureResponse, requireApiUser, type ApiRouteUser } from "@/lib/auth/route-auth";
import { hasPermission } from "@/lib/auth/roles";
import { canAnnotateCandidate } from "@/lib/auth/candidate-scope";
import { scorecardUpdateSchema } from "@/lib/validation/interview-scorecard";

const forbidden = () =>
  NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });

/**
 * May this caller change this scorecard?
 *
 * Two ways in. Anyone holding calendar:write behaves exactly as before — that is
 * the path every existing user takes, and it is deliberately checked first so
 * their behaviour is unchanged. The second is the narrow grant added alongside
 * the candidate allowlist: a hiring manager scoped to specific candidates may fix
 * up a scorecard they recorded themselves, on a candidate they were granted.
 * Without it they could create a scorecard and then not correct a typo in it.
 *
 * Ownership is matched on the interviewer NAME, because that is the only
 * attribution InterviewScorecard stores — there is no author column and
 * `interviewer` is a display name off the team roster, not an email. That is
 * softer than an id comparison and worth being honest about: a name that does not
 * match the caller's profile name simply fails closed with a 403, which is
 * recoverable, rather than opening somebody else's assessment for editing, which
 * is not.
 */
async function resolveScorecardAccess(user: ApiRouteUser, scorecardId: string) {
  const scorecard = await prisma.interviewScorecard.findUnique({
    where: { id: scorecardId },
    select: { id: true, interviewer: true, interview: { select: { candidateId: true } } }
  });

  if (hasPermission(user.role, "calendar:write")) {
    return { allowed: true as const, found: Boolean(scorecard) };
  }

  const ownName = (user.name ?? "").trim().toLowerCase();
  const isOwn = Boolean(ownName) && (scorecard?.interviewer ?? "").trim().toLowerCase() === ownName;
  const allowed = isOwn && canAnnotateCandidate(user.viewer, scorecard?.interview?.candidateId ?? null);

  // A missing scorecard and one belonging to somebody else both land on the same
  // refusal for an annotator, so neither can be used to probe for the other.
  return { allowed, found: Boolean(scorecard) };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const { id } = await params;

  const access = await resolveScorecardAccess(auth.user, id);
  if (!access.allowed) return forbidden();
  if (!access.found) return NextResponse.json({ message: "Scorecard not found." }, { status: 404 });

  try {
    const data = scorecardUpdateSchema.parse(await request.json());
    const scorecard = await prisma.interviewScorecard.update({
      where: { id },
      data: {
        ...(data.interviewer !== undefined && { interviewer: data.interviewer }),
        ...(data.recommendation !== undefined && { recommendation: data.recommendation ?? null }),
        ...(data.items !== undefined && { itemsJson: JSON.stringify(data.items) }),
        ...(data.comments !== undefined && { comments: data.comments ?? null })
      }
    });
    return NextResponse.json({ ok: true, scorecard });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Update scorecard failed:", error);
    return NextResponse.json({ message: "Unable to update scorecard." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const { id } = await params;

  const access = await resolveScorecardAccess(auth.user, id);
  if (!access.allowed) return forbidden();
  if (!access.found) return NextResponse.json({ message: "Scorecard not found." }, { status: 404 });

  try {
    await prisma.interviewScorecard.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "Scorecard removed." });
  } catch (error) {
    console.error("Delete scorecard failed:", error);
    return NextResponse.json({ message: "Unable to delete scorecard." }, { status: 500 });
  }
}
