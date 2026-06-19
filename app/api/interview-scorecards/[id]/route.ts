import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { scorecardUpdateSchema } from "@/lib/validation/interview-scorecard";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
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
  const auth = await requireApiPermission("calendar:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const { id } = await params;
  try {
    await prisma.interviewScorecard.delete({ where: { id } });
    return NextResponse.json({ ok: true, message: "Scorecard removed." });
  } catch (error) {
    console.error("Delete scorecard failed:", error);
    return NextResponse.json({ message: "Unable to delete scorecard." }, { status: 500 });
  }
}
