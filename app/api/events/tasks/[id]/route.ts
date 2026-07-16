import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";

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
    if (typeof body.done === "boolean") data.done = body.done;
    if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim();
    if (typeof body.owner === "string") data.owner = body.owner.trim() || null;
    if (typeof body.dueAt === "string") {
      if (!body.dueAt) {
        data.dueAt = null;
      } else {
        const d = new Date(body.dueAt);
        if (Number.isNaN(d.getTime())) return NextResponse.json({ message: "That due date is not a real date." }, { status: 400 });
        data.dueAt = d;
      }
    }

    await prisma.eventTask.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update event task error:", error);
    return NextResponse.json({ message: "Unable to update that item." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  const { id } = await ctx.params;
  try {
    await prisma.eventTask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Remove event task error:", error);
    return NextResponse.json({ message: "Unable to remove that item." }, { status: 500 });
  }
}
