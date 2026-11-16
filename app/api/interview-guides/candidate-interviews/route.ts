import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";

// GET /api/interview-guides/candidate-interviews?candidateId=
// A candidate's interviews, newest first, for the guide's "Which interview?" picker.
export async function GET(request: Request) {
  const auth = await requireApiPermission("calendar:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const candidateId = new URL(request.url).searchParams.get("candidateId")?.trim() ?? "";
  if (!candidateId || !isCandidateVisible(auth.user.viewer, candidateId)) return NextResponse.json({ interviews: [] });
  const rows = await prisma.interview.findMany({
    where: { candidateId },
    orderBy: { startDateTime: "desc" },
    take: 50,
    select: { id: true, title: true, interviewType: true, startDateTime: true, timezone: true, interviewer: true, status: true }
  });
  return NextResponse.json({ interviews: rows.map((r) => ({ ...r, startDateTime: r.startDateTime.toISOString() })) });
}
