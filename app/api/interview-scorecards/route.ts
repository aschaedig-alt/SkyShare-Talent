import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { hasPermission } from "@/lib/auth/roles";
import { canAnnotateCandidate, isCandidateAllowlisted } from "@/lib/auth/candidate-scope";
import { scorecardCreateSchema } from "@/lib/validation/interview-scorecard";

/**
 * Scoring an interview is one of the very few write paths an allowlist-scoped
 * viewer gets, so creating a scorecard no longer demands calendar:write
 * outright. Editing and deleting one (the [id] route next door) still does.
 *
 * The candidate is read off the INTERVIEW, never taken from the request body, so
 * a caller cannot name a candidate they are allowed to annotate and hang the
 * scorecard off somebody else's interview.
 */

const forbidden = () =>
  NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  // Anyone holding calendar:write behaves exactly as before. Anyone who is not
  // allowlist-scoped at all cannot qualify by the other route either, so refuse
  // them here — before the body is read — rather than after a lookup that would
  // let a 404 and a 403 be told apart.
  const canScoreAnyInterview = hasPermission(auth.user.role, "calendar:write");
  if (!canScoreAnyInterview && !isCandidateAllowlisted(auth.user.viewer)) return forbidden();

  try {
    const data = scorecardCreateSchema.parse(await request.json());
    const interview = await prisma.interview.findUnique({
      where: { id: data.interviewId },
      select: { id: true, candidateId: true }
    });

    // Decided BEFORE the not-found, deliberately: for an allowlisted annotator a
    // missing interview and one belonging to an off-allowlist candidate both
    // land on this same 403, so neither can be used to probe for the other.
    if (!canScoreAnyInterview && !canAnnotateCandidate(auth.user.viewer, interview?.candidateId ?? null)) {
      return forbidden();
    }

    if (!interview) return NextResponse.json({ message: "Interview not found." }, { status: 404 });

    const scorecard = await prisma.interviewScorecard.create({
      data: {
        interviewId: data.interviewId,
        interviewer: data.interviewer,
        recommendation: data.recommendation ?? null,
        itemsJson: JSON.stringify(data.items ?? []),
        comments: data.comments ?? null
      }
    });
    return NextResponse.json({ ok: true, scorecard });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }
    console.error("Create scorecard failed:", error);
    return NextResponse.json({ message: "Unable to save scorecard." }, { status: 500 });
  }
}
