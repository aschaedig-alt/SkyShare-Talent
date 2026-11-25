import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { hasPermission } from "@/lib/auth/roles";
import { prisma } from "@/lib/prisma";
import { isActivityStatus } from "@/lib/events/constants";

// Add an activity to an internal event (Nov 25 2026).
//
// events:READ, deliberately: Aimee asked for "room for people to contribute", so
// anyone who can see events may SUGGEST one. A suggestion always starts as IDEA,
// with no owner. Someone with events:write can also set its status and owner, and
// only they can add the scavenger hunt (it carries the hunt's admin screen).

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  const canWrite = hasPermission(auth.user.role, "events:write");

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 160) : "";
    if (!name) return NextResponse.json({ message: "Give the activity a name." }, { status: 400 });
    const description =
      typeof body.description === "string" && body.description.trim() ? body.description.trim().slice(0, 4000) : null;
    const kind = canWrite && body.kind === "SCAVENGER_HUNT" ? "SCAVENGER_HUNT" : "CUSTOM";

    const event = await prisma.event.findUnique({ where: { id }, select: { audience: true } });
    if (!event) return NextResponse.json({ message: "That event no longer exists." }, { status: 404 });
    if (event.audience !== "INTERNAL") {
      return NextResponse.json({ message: "Activities are for company events." }, { status: 400 });
    }
    if (kind === "SCAVENGER_HUNT") {
      const already = await prisma.eventActivity.findFirst({ where: { eventId: id, kind: "SCAVENGER_HUNT" }, select: { id: true } });
      if (already) return NextResponse.json({ message: "This event already has the scavenger hunt." }, { status: 409 });
    }

    const activity = await prisma.eventActivity.create({
      data: {
        eventId: id,
        name,
        description,
        kind,
        status: canWrite && isActivityStatus(body.status) ? body.status : "IDEA",
        owner: canWrite && typeof body.owner === "string" && body.owner.trim() ? body.owner.trim().slice(0, 120) : null,
        suggestedBy: auth.user.name ?? auth.user.email ?? null
      }
    });
    return NextResponse.json({ ok: true, id: activity.id });
  } catch (error) {
    console.error("Add activity error:", error);
    return NextResponse.json({ message: "Unable to add that activity." }, { status: 500 });
  }
}
