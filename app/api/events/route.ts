import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";
import { isEventStatus, isEventType } from "@/lib/events/constants";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const startsAt = typeof body.startsAt === "string" ? new Date(body.startsAt) : null;

    if (!name) {
      return NextResponse.json({ message: "Give the event a name." }, { status: 400 });
    }
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      return NextResponse.json({ message: "Pick a start date." }, { status: 400 });
    }

    const endsAt = typeof body.endsAt === "string" && body.endsAt ? new Date(body.endsAt) : null;
    if (endsAt && Number.isNaN(endsAt.getTime())) {
      return NextResponse.json({ message: "That end date is not a real date." }, { status: 400 });
    }
    if (endsAt && endsAt < startsAt) {
      return NextResponse.json({ message: "The event cannot end before it starts." }, { status: 400 });
    }

    const event = await prisma.event.create({
      data: {
        name,
        startsAt,
        endsAt,
        type: isEventType(body.type) ? body.type : "CAREER_FAIR",
        status: isEventStatus(body.status) ? body.status : "PLANNED",
        venue: typeof body.venue === "string" && body.venue.trim() ? body.venue.trim() : null,
        city: typeof body.city === "string" && body.city.trim() ? body.city.trim() : null,
        state: typeof body.state === "string" && body.state.trim() ? body.state.trim() : null,
        website: typeof body.website === "string" && body.website.trim() ? body.website.trim() : null,
        ownerId: typeof body.ownerId === "string" && body.ownerId ? body.ownerId : null
      }
    });

    return NextResponse.json({ ok: true, id: event.id });
  } catch (error) {
    console.error("Create event error:", error);
    return NextResponse.json({ message: "Unable to create the event." }, { status: 500 });
  }
}
