import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isMergedAway } from "@/lib/candidates/merged-guard";

type LinkBody = {
  candidateId?: string;
  jobId?: string;
  stage?: string;
  status?: string;
};

// POST /api/candidate-applications — link an existing candidate to a job (creates the
// application record that makes them appear under the job's "Linked candidates").
export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json()) as LinkBody;
    if (!body.candidateId || !body.jobId) {
      return NextResponse.json({ message: "candidateId and jobId are required." }, { status: 400 });
    }

    const existing = await prisma.candidateApplication.findFirst({
      where: { candidateId: body.candidateId, jobId: body.jobId }
    });

    if (existing) {
      return NextResponse.json({ application: { id: existing.id }, reused: true });
    }

    const application = await prisma.candidateApplication.create({
      data: {
        candidateId: body.candidateId,
        jobId: body.jobId,
        status: body.status?.trim() || "New",
        stage: body.stage?.trim() || "Applied",
        source: "Manual entry",
        appliedAt: new Date()
      }
    });

    // Linking an ARCHIVED candidate to a job means you are actively considering
    // them again, so bring them back into the active pipeline — UNLESS they are
    // archived because they were already HIRED and are a current employee. Those
    // candidate records are archived precisely because the person graduated to a
    // NewHire; reactivating them would wrongly shove an employee back into the
    // candidate pipeline (e.g. Matt Dahle, an active PC-12 Captain).
    const candidate = await prisma.candidate.findUnique({
      where: { id: body.candidateId },
      select: { archivedAt: true, status: true, mergeHistoryJson: true }
    });
    const employedHire = candidate?.archivedAt
      ? await prisma.newHire.findFirst({
          where: {
            candidateId: body.candidateId,
            stage: { in: ["ACTIVE", "POST_ONBOARD"] },
            NOT: { employmentStatus: "TERMINATED" }
          },
          select: { id: true }
        })
      : null;
    // SECOND exclusion, and this one had already fired in production: a candidate
    // that was MERGED AWAY into another record. That row is a tombstone — the merge
    // moved the files, metrics and history onto the keeper and left this one hollow,
    // so reactivating it puts an EMPTY duplicate of a real person into the live scan
    // pool while the record holding the evidence stays archived.
    //
    // It happened on 2026-08-31. Candidate cmqjupt5b was merged into
    // cmqvr4z3r0fknxcrmnt8p5a4q on 2026-06-27; linking it to a job here flipped it
    // back to ACTIVE with 0 files and 0 metrics, against the keeper's 3 and 21. Both
    // rows are the same Matthew Smith on one email and one phone. The duplicate scan
    // then reported a pair it could not show anyone.
    //
    // A merged row is never the right one to reactivate. If the person genuinely
    // needs considering again, that belongs on the KEEPER.
    // Via the shared guard rather than testing mergeHistoryJson directly: three
    // paths used to write this check against two different columns. See
    // lib/candidates/merged-guard.ts.
    const mergedAway = isMergedAway(candidate);
    const reactivated = Boolean(candidate?.archivedAt) && !employedHire && !mergedAway;
    if (reactivated) {
      await prisma.candidate.update({
        where: { id: body.candidateId },
        data: { archivedAt: null, status: "ACTIVE" }
      });
    }

    return NextResponse.json({ application: { id: application.id }, reused: false, reactivated });
  } catch {
    return NextResponse.json({ message: "Unable to link candidate to job." }, { status: 500 });
  }
}
