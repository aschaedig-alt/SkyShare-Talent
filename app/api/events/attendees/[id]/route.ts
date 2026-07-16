import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";
import { isAttendeeStatus } from "@/lib/events/constants";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (isAttendeeStatus(body.status)) data.status = body.status;
    if (typeof body.role === "string") data.role = body.role.trim() || null;
    if (typeof body.notes === "string") data.notes = body.notes.trim() || null;

    await prisma.eventAttendee.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update event attendee error:", error);
    return NextResponse.json({ message: "Unable to update that person." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  const { id } = await ctx.params;
  try {
    await prisma.eventAttendee.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Remove event attendee error:", error);
    return NextResponse.json({ message: "Unable to remove that person." }, { status: 500 });
  }
}
