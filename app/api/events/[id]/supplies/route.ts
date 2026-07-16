import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const supplyItemId = typeof body.supplyItemId === "string" && body.supplyItemId ? body.supplyItemId : null;
    const rawQty = typeof body.quantity === "number" ? Math.floor(body.quantity) : 1;
    const quantity = Math.max(1, rawQty);

    // Either pick a stocked item (label comes from it) or type a one-off label.
    let label = typeof body.label === "string" ? body.label.trim() : "";
    if (supplyItemId) {
      const item = await prisma.supplyItem.findUnique({ where: { id: supplyItemId }, select: { name: true } });
      if (!item) {
        return NextResponse.json({ message: "That supply is no longer in the stock room." }, { status: 400 });
      }
      label = item.name;
    }
    if (!label) {
      return NextResponse.json({ message: "Pick a supply or type what you are bringing." }, { status: 400 });
    }

    const line = await prisma.eventSupply.create({
      data: { eventId: id, supplyItemId, label, quantity }
    });
    return NextResponse.json({ ok: true, id: line.id });
  } catch (error) {
    console.error("Add event supply error:", error);
    return NextResponse.json({ message: "Unable to add that supply." }, { status: 500 });
  }
}
