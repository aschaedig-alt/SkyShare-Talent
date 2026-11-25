import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";
import { isActivityStatus } from "@/lib/events/constants";

// Change or remove an event activity. events:write - suggesting one is open to
// anyone who can see events (app/api/events/[id]/activities), deciding is not.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 160);
    if (typeof body.description === "string") data.description = body.description.trim().slice(0, 4000) || null;
    if (typeof body.owner === "string") data.owner = body.owner.trim().slice(0, 120) || null;
    if (isActivityStatus(body.status)) data.status = body.status;
    if (!Object.keys(data).length) return NextResponse.json({ message: "Nothing to change." }, { status: 400 });
    await prisma.eventActivity.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update activity error:", error);
    return NextResponse.json({ message: "Unable to save that activity." }, { status: 500 });
  }
}

/** Removes the activity and its comments. Removing the scavenger hunt activity does not touch the hunt itself. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  try {
    await prisma.eventActivity.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Remove activity error:", error);
    return NextResponse.json({ message: "Unable to remove that activity." }, { status: 500 });
  }
}
