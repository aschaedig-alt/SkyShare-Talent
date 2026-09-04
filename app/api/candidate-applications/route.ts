import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { linkCandidateToJob } from "@/lib/candidates/link-to-job";

type LinkBody = {
  candidateId?: string;
  jobId?: string;
  stage?: string;
  status?: string;
};

// POST /api/candidate-applications — link an existing candidate to a job (creates the
// application record that makes them appear under the job's "Linked candidates").
//
// The rules that used to live in this handler — reuse an existing application,
// reactivate an archived candidate, but NOT an employed hire and NOT a merged-away
// tombstone — now live in lib/candidates/link-to-job.ts, because the batch add at
// ./batch needs exactly the same three and a second copy would drift. Each of them
// is there for an incident; read the comment block before changing one.
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

    const result = await linkCandidateToJob({
      candidateId: body.candidateId,
      jobId: body.jobId,
      status: body.status,
      stage: body.stage
    });

    if (result.error === "missing") {
      return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
    }

    return NextResponse.json({
      application: { id: result.applicationId },
      reused: result.reused,
      reactivated: result.reactivated
    });
  } catch {
    return NextResponse.json({ message: "Unable to link candidate to job." }, { status: 500 });
  }
}
