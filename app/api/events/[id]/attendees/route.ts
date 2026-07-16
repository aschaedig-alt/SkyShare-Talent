import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const newHireId = typeof body.newHireId === "string" ? body.newHireId : "";
    if (!newHireId) {
      return NextResponse.json({ message: "Pick someone to add." }, { status: 400 });
    }

    // Upsert so adding the same person twice is a no-op rather than a crash.
    const attendee = await prisma.eventAttendee.upsert({
      where: { eventId_newHireId: { eventId: id, newHireId } },
      create: {
        eventId: id,
        newHireId,
        role: typeof body.role === "string" && body.role.trim() ? body.role.trim() : null
      },
      update: {}
    });

    return NextResponse.json({ ok: true, id: attendee.id });
  } catch (error) {
    console.error("Add event attendee error:", error);
    return NextResponse.json({ message: "Unable to add that person." }, { status: 500 });
  }
}
