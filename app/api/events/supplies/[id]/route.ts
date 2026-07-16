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
    if (typeof body.quantity === "number" && Number.isFinite(body.quantity)) {
      data.quantity = Math.max(1, Math.floor(body.quantity));
    }
    if (typeof body.packed === "boolean") data.packed = body.packed;
    if (typeof body.notes === "string") data.notes = body.notes.trim() || null;

    await prisma.eventSupply.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update event supply error:", error);
    return NextResponse.json({ message: "Unable to update that supply." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  const { id } = await ctx.params;
  try {
    await prisma.eventSupply.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Remove event supply error:", error);
    return NextResponse.json({ message: "Unable to remove that supply." }, { status: 500 });
  }
}
