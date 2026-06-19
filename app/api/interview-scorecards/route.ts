import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { scorecardCreateSchema } from "@/lib/validation/interview-scorecard";

export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  try {
    const data = scorecardCreateSchema.parse(await request.json());
    const interview = await prisma.interview.findUnique({ where: { id: data.interviewId }, select: { id: true } });
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
