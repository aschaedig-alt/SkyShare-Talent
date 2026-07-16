import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";
import { isSupplyCategory } from "@/lib/events/constants";

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
    if (isSupplyCategory(body.category)) data.category = body.category;
    if (typeof body.unit === "string" && body.unit.trim()) data.unit = body.unit.trim();
    if (typeof body.onHand === "number" && Number.isFinite(body.onHand)) {
      data.onHand = Math.max(0, Math.floor(body.onHand));
    }
    if (typeof body.reorderThreshold === "number" && Number.isFinite(body.reorderThreshold)) {
      data.reorderThreshold = Math.max(0, Math.floor(body.reorderThreshold));
    }
    for (const field of ["vendor", "reorderUrl", "notes"]) {
      if (typeof body[field] === "string") data[field] = (body[field] as string).trim() || null;
    }
    if (body.unitCost === null) data.unitCost = null;
    if (typeof body.unitCost === "number" && Number.isFinite(body.unitCost)) data.unitCost = body.unitCost;
    if (typeof body.active === "boolean") data.active = body.active;

    await prisma.supplyItem.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update supply item error:", error);
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
    // Event lines keep their label and go loose (supplyItemId -> null), so an
    // event's packing list never loses a row because the catalog changed.
    await prisma.supplyItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Delete supply item error:", error);
    return NextResponse.json({ message: "Unable to delete that supply." }, { status: 500 });
  }
}
