import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StoreError } from "@/lib/party-store/server";
import { readJson, storeAdminRoute } from "@/lib/party-store/http";
import { parseDollarsToCents } from "@/lib/party-store/shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ itemId: string }> };

/**
 * PATCH — edit an item. A price change applies to new sales only (each order
 * line keeps the price it was sold at). The count is the STARTING count — what
 * came in the boxes — so a delivery mid-party is an increase here.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  return storeAdminRoute("edit item", async () => {
    const { itemId } = await ctx.params;
    const body = await readJson(request);
    const data: { name?: string; priceCents?: number; startingQty?: number; active?: boolean } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
    if (body.price !== undefined) {
      const price = parseDollarsToCents(body.price);
      if (price === null || price < 0 || price > 1_000_000) throw new StoreError("Give it a price in dollars.");
      data.priceCents = price;
    }
    if (body.quantity !== undefined) {
      const qty = typeof body.quantity === "number" ? Math.floor(body.quantity) : Number.parseInt(String(body.quantity), 10);
      if (!Number.isFinite(qty) || qty < 0 || qty > 100_000) throw new StoreError("Say how many you have.");
      const used = await prisma.partyStoreOrderLine.aggregate({
        where: { itemId, order: { status: { not: "CANCELED" } } },
        _sum: { quantity: true }
      });
      const committed = used._sum.quantity ?? 0;
      if (qty < committed) throw new StoreError(`Already sold or held: ${committed}. The count can't go below that.`);
      data.startingQty = qty;
    }
    if (typeof body.active === "boolean") data.active = body.active;
    await prisma.partyStoreItem.update({ where: { id: itemId }, data });
    return NextResponse.json({ ok: true });
  });
}

/** DELETE — only an item nothing has been sold of. Otherwise retire it (active false). */
export async function DELETE(_request: Request, ctx: Ctx) {
  return storeAdminRoute("delete item", async () => {
    const { itemId } = await ctx.params;
    const lines = await prisma.partyStoreOrderLine.count({ where: { itemId } });
    if (lines > 0) throw new StoreError("This item is on orders, so it can't be deleted. Take it off sale instead.");
    await prisma.partyStoreItem.delete({ where: { id: itemId } });
    return NextResponse.json({ ok: true });
  });
}
