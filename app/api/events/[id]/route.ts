import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";
import { isEventStatus, isEventType } from "@/lib/events/constants";

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

    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
    if (isEventType(body.type)) data.type = body.type;
    if (isEventStatus(body.status)) data.status = body.status;
    if (typeof body.startsAt === "string") {
      const d = new Date(body.startsAt);
      if (Number.isNaN(d.getTime())) return NextResponse.json({ message: "That start date is not a real date." }, { status: 400 });
      data.startsAt = d;
    }
    if (typeof body.endsAt === "string") {
      if (!body.endsAt) {
        data.endsAt = null;
      } else {
        const d = new Date(body.endsAt);
        if (Number.isNaN(d.getTime())) return NextResponse.json({ message: "That end date is not a real date." }, { status: 400 });
        data.endsAt = d;
      }
    }
    for (const field of ["venue", "city", "state", "website", "notes"]) {
      if (typeof body[field] === "string") data[field] = (body[field] as string).trim() || null;
    }
    if (typeof body.ownerId === "string") data.ownerId = body.ownerId || null;
    if (body.budget === null) data.budget = null;
    if (typeof body.budget === "number" && Number.isFinite(body.budget)) data.budget = body.budget;

    await prisma.event.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update event error:", error);
    return NextResponse.json({ message: "Unable to update the event." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  const { id } = await ctx.params;
  try {
    // Attendees, supplies, and tasks cascade with the event.
    await prisma.event.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete event error:", error);
    return NextResponse.json({ message: "Unable to delete the event." }, { status: 500 });
  }
}
