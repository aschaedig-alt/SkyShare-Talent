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
// Nothing leaks either way: the response is counts only (scannedCandidates, pairsFound,
// newReviewItems and friends) and never a name or an email. The problem was the WRITE and
// the full-table scan it costs, not disclosure.
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
