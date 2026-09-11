import { NextResponse } from "next/server";
import { scanCandidateDuplicates } from "@/lib/duplicates/candidate-scan";
import { authFailureResponse, requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

// POST /api/duplicate-review/candidates/scan — sweep the whole candidate pool for
// duplicate pairs and write the review items.
//
// This handler had NO authorization check of any kind until now: it imported no auth
// helper, so its only protection was middleware proving that SOME valid JWT existed.
// Any signed-in account — a VIEWER, or a hiring manager restricted to two candidates —
// could trigger a full-pool scan that WRITES DuplicateReviewItem rows into the shared
// live database. Its sibling, ../resolve, has always required duplicates:write, so this
// was an inconsistency rather than a deliberate exception.
//
// duplicates:write is ADMIN and RECRUITER (lib/auth/roles.ts), which is who the Duplicate
// Review workflow belongs to, and matches the resolve route exactly.
//
// WHAT THIS WRITES, since it is a POST against the one shared live database:
//   1. a DuplicateReviewItem row (status OPEN) per NEWLY detected pair — zero if every
//      detected pair was already recorded, which is the case on today's data;
//   2. status RESOLVED + resolvedAt on any already-OPEN item whose candidate has since
//      been merged away or deleted, which could never reach a merge anyway;
//   3. the ActivityLog row written below.
// It touches no Candidate, merges nobody, and deletes nothing.
//
// The response DOES name the pairs (as of 2026-09-11): each detected pair carries both
// candidates' display name, email, phone and status, so the card can show WHO was found
// instead of a count with nothing behind it — Aimee, 2026-08-31, "doesn't show me who it
// is". That is not a new disclosure: duplicates:write is ADMIN + RECRUITER
// (lib/auth/roles.ts), who can already open the whole candidate list and every profile on
// it. The earlier "counts only ... never a name or an email" note here described the
// response, not a rule, and is gone rather than left standing to contradict the code.
export async function POST() {
  const auth = await requireApiPermission("duplicates:write");
  if (!auth.ok) {
    return authFailureResponse(auth);
  }

  try {
    const result = await scanCandidateDuplicates();

    // Logged because this is an expensive, pool-wide write that anyone with the
    // permission can fire from a button. Knowing who ran it and what it created is
    // what makes an unexpected pile of review items answerable after the fact.
    await logActivity({
      userId: auth.user.id ?? undefined,
      userEmail: auth.user.email ?? undefined,
      activityType: "DUPLICATE_SCAN_RUN",
      description: `Ran the candidate duplicate scan: ${result.scannedCandidates} scanned, ${result.newReviewItems} new review items`,
      entityType: "DuplicateReviewItem",
      metadata: {
        scannedCandidates: result.scannedCandidates,
        newReviewItems: result.newReviewItems
      }
    });

    return NextResponse.json({
      ok: true,
      message: `Scanned ${result.scannedCandidates} candidates and added ${result.newReviewItems} review items.`,
      ...result
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ message: "Unable to scan candidate duplicates." }, { status: 500 });
  }
}
