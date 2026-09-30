import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { invitePlanForAttendee } from "@/lib/orientation/calendar-sync";

// Before an attendee is removed or moved: who of theirs is on the session's
// Google invite, and which of their supervisors still have somebody else at the
// session - so the page can ask what should come off. Reads only; the removal is
// the calendar route's "remove-guests" action, sent after the person has chosen.

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    return NextResponse.json(await invitePlanForAttendee(id, auth.user.email));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't read the invite.";
    return NextResponse.json({ message }, { status: 400 });
  }
}
