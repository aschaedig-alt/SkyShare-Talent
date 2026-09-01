import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { completeOrientationSession } from "@/lib/data/orientation";

type Ctx = { params: Promise<{ id: string }> };

function str(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (body.status === "COMPLETE") {
      await completeOrientationSession(id);
      return NextResponse.json({ ok: true });
    }

    const data: Record<string, unknown> = {};
    for (const f of [
      "location", "address", "meetLink", "notes",
      "lunchVendor", "lunchContactName", "lunchContactPhone", "lunchNotes"
    ]) {
      const v = str(body[f]);
      if (v !== undefined) data[f] = v;
    }
    // Lunch arrival: a string sets it, an explicit null clears it. Deliberately
    // NOT validated against the session start — lunch can legitimately land
    // before doors open (an early drop-off) and rejecting that would be wrong.
    if (body.lunchArrivalAt === null) {
      data.lunchArrivalAt = null;
    } else if (typeof body.lunchArrivalAt === "string") {
      const t = new Date(body.lunchArrivalAt);
      if (Number.isNaN(t.getTime())) {
        return NextResponse.json({ message: "Invalid lunch arrival time." }, { status: 400 });
      }
      data.lunchArrivalAt = t;
    }
    if (typeof body.date === "string") {
      const d = new Date(body.date);
      if (!Number.isNaN(d.getTime())) data.date = d;
    }
    // endsAt: a string sets it, an explicit null clears it back to start-only.
    if (body.endsAt === null) {
      data.endsAt = null;
    } else if (typeof body.endsAt === "string") {
      const e = new Date(body.endsAt);
      if (Number.isNaN(e.getTime())) {
        return NextResponse.json({ message: "Invalid end time." }, { status: 400 });
      }
      // Validate against the new start if one is being set in the same request,
      // otherwise against the start already stored.
      const start =
        data.date instanceof Date
          ? data.date
          : (await prisma.orientationSession.findUnique({ where: { id }, select: { date: true } }))?.date;
      if (start && e.getTime() <= start.getTime()) {
        return NextResponse.json({ message: "The end time has to be after the start time." }, { status: 400 });
      }
      data.endsAt = e;
    }
    if (body.status === "UPCOMING" || body.status === "CANCELED") data.status = body.status;

    // Did anything the Google invite renders actually move?
    //
    // The invite's TITLE and DESCRIPTION are built from the date, its LOCATION
    // field from the address — so a change to any of these leaves the event in
    // Google stale, and the standing rule is that a time or place change has to
    // reach all of them.
    //
    // THIS DELIBERATELY DOES NOT PUSH THE CHANGE ITSELF. Patching Google from
    // here would either email every guest on every field edit (an address typo
    // becoming a "this event has changed" to seven new hires and their
    // supervisors), or push silently and leave everyone who already accepted
    // holding the old time with nobody telling them. Both are worse than
    // reporting it: the response says what moved, and the calendar panel turns
    // that into an explicit "update the invite", with emailing the guests as a
    // separate choice made by the person who moved it.
    const CALENDAR_FIELDS = ["date", "endsAt", "location", "address"] as const;
    const touched = CALENDAR_FIELDS.filter((f) => f in data);
    const before = touched.length
      ? await prisma.orientationSession.findUnique({
          where: { id },
          select: { date: true, endsAt: true, location: true, address: true }
        })
      : null;

    await prisma.orientationSession.update({ where: { id }, data });

    // Compare VALUES, not just "was it in the payload" — saving the reschedule
    // form without changing anything sends date and endsAt every time, and
    // warning that the invite is stale when nothing moved is how a real warning
    // stops being read.
    const same = (a: unknown, b: unknown) => {
      if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
      if (a instanceof Date || b instanceof Date) return false;
      return (a ?? null) === (b ?? null);
    };
    const calendarFieldsChanged = before ? touched.filter((f) => !same(before[f], data[f])) : [];

    return NextResponse.json({ ok: true, calendarFieldsChanged });
  } catch (error) {
    console.error("Update orientation session error:", error);
    return NextResponse.json({ message: "Unable to update session." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.orientationSession.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Unable to delete session." }, { status: 500 });
  }
}
