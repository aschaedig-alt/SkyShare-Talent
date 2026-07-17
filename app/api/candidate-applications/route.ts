import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

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
    // them again, so bring them back into the active pipeline — otherwise they'd
    // have a live application but stay hidden from the candidate list.
    const candidate = await prisma.candidate.findUnique({
      where: { id: body.candidateId },
      select: { archivedAt: true }
    });
    const reactivated = Boolean(candidate?.archivedAt);
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
