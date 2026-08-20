import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { syncHireOrientationDates } from "@/lib/data/orientation";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id: sessionId } = await ctx.params;
  try {
    const body = (await request.json()) as { newHireId?: string };
    if (!body?.newHireId) {
      return NextResponse.json({ message: "newHireId is required." }, { status: 400 });
    }
    const attendee = await prisma.orientationAttendee.upsert({
      where: { sessionId_newHireId: { sessionId, newHireId: body.newHireId } },
      create: { sessionId, newHireId: body.newHireId },
      update: {}
    });
    // Seating somebody also sets the date on their own record, so the profile and
    // the new-hires grid agree with the session rather than staying blank.
    await syncHireOrientationDates([body.newHireId], sessionId);
    return NextResponse.json({ ok: true, id: attendee.id });
  } catch (error) {
    console.error("Add attendee error:", error);
    return NextResponse.json({ message: "Unable to add attendee." }, { status: 500 });
  }
}
