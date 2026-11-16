import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ApiRouteUser } from "@/lib/auth/route-auth";
import { hasPermission } from "@/lib/auth/roles";
import { canAnnotateCandidate, isCandidateVisible } from "@/lib/auth/candidate-scope";

// Who may fill in a guide. Same two ways in as an interview scorecard
// (app/api/interview-scorecards/route.ts), because a guide is the same kind of
// thing — what one interviewer heard in one interview:
//
//   1. calendar:write, exactly as for scorecards and the question bank; or
//   2. the narrow allowlist grant: a hiring manager brought in for a search may
//      write on the candidates they were given (canAnnotateCandidate). That is
//      what lets "the team" fill in a guide during their own interviews.
//
// A guide not yet linked to a candidate needs calendar:write — there is no
// candidate to check an allowlist against.

export const forbidden = () =>
  NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });

export function canWriteGuideFor(user: ApiRouteUser, candidateId: string | null | undefined): boolean {
  if (hasPermission(user.role, "calendar:write")) return true;
  return Boolean(candidateId) && canAnnotateCandidate(user.viewer, candidateId);
}

/**
 * Load a guide for writing. Returns the guide's candidateId, or a response to
 * send. A missing guide and one the caller may not touch answer alike for an
 * annotator, so neither can probe for the other.
 */
export async function resolveGuideWrite(
  user: ApiRouteUser,
  guideId: string
): Promise<{ ok: true; candidateId: string | null } | { ok: false; response: Response }> {
  const guide = await prisma.interviewGuide.findUnique({ where: { id: guideId }, select: { candidateId: true } });
  if (!canWriteGuideFor(user, guide?.candidateId)) return { ok: false, response: forbidden() };
  if (!guide) return { ok: false, response: NextResponse.json({ message: "Guide not found." }, { status: 404 }) };
  return { ok: true, candidateId: guide.candidateId };
}

/**
 * Check a candidate / interview pair a caller wants to link a guide to. The
 * interview must belong to the candidate (or, with no candidate given, supplies
 * it), and the caller must be allowed to write on that candidate.
 */
export async function resolveLink(
  user: ApiRouteUser,
  candidateId: string | null | undefined,
  interviewId: string | null | undefined
): Promise<{ ok: true; candidateId: string | null; interviewId: string | null } | { ok: false; response: Response }> {
  let cid = candidateId ?? null;
  const iid = interviewId ?? null;
  if (iid) {
    const interview = await prisma.interview.findUnique({ where: { id: iid }, select: { candidateId: true } });
    if (!interview) return { ok: false, response: NextResponse.json({ message: "Interview not found." }, { status: 404 }) };
    if (cid && cid !== interview.candidateId) {
      return { ok: false, response: NextResponse.json({ message: "That interview belongs to a different candidate." }, { status: 400 }) };
    }
    cid = interview.candidateId;
  }
  if (cid) {
    if (!isCandidateVisible(user.viewer, cid) || !canWriteGuideFor(user, cid)) return { ok: false, response: forbidden() };
    const exists = await prisma.candidate.findUnique({ where: { id: cid }, select: { id: true } });
    if (!exists) return { ok: false, response: NextResponse.json({ message: "Candidate not found." }, { status: 404 }) };
  } else if (!canWriteGuideFor(user, null)) {
    return { ok: false, response: forbidden() };
  }
  return { ok: true, candidateId: cid, interviewId: iid };
}
