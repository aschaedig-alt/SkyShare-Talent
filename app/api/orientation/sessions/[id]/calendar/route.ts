import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  addOrientationAttendeesToEvent,
  createOrientationCalendarEvent,
  previewOrientationCalendar
} from "@/lib/orientation/calendar-sync";

// The orientation calendar invite: preview it, create it, then invite the guests.
//
// Split across GET and two explicit POST actions rather than one do-everything
// endpoint, because "create the event" and "email seven new hires" have very
// different consequences and should never be reachable by the same request.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  try {
    // The calendar is reached with the SIGNED-IN USER'S own Google token, so every
    // call needs to know who is asking. Locally auth is bypassed and this is null,
    // which the preview reports as a blocker rather than failing on click.
    return NextResponse.json(await previewOrientationCalendar(id, auth.user.email));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't build the calendar preview.";
    return NextResponse.json({ message }, { status: 400 });
  }
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;

  let action: unknown;
  try {
    ({ action } = (await request.json()) as { action?: unknown });
  } catch {
    return NextResponse.json({ message: "Expected a JSON body with an action." }, { status: 400 });
  }

  try {
    if (action === "create") {
      const record = await createOrientationCalendarEvent(id, auth.user.email);
      return NextResponse.json({ ok: true, record });
    }

    if (action === "add-attendees") {
      const result = await addOrientationAttendeesToEvent(id, auth.user.email);
      return NextResponse.json({ ok: true, ...result });
    }

    return NextResponse.json({ message: 'Unknown action. Expected "create" or "add-attendees".' }, { status: 400 });
  } catch (error) {
    // These messages are written to be read by the person clicking the button —
    // a missing supervisor or an unconfigured Google is not a 500.
    const message = error instanceof Error ? error.message : "Something went wrong.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
