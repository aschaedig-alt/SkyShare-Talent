import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StoreError } from "@/lib/party-store/server";
import { readJson, storeAdminRoute } from "@/lib/party-store/http";
import { parseDollarsToCents } from "@/lib/party-store/shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST — add an item to the store's inventory. */
export async function POST(request: Request, ctx: Ctx) {
  return storeAdminRoute("add item", async () => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) throw new StoreError("Name the item.");
    const price = parseDollarsToCents(body.price);
    if (price === null || price < 0 || price > 1_000_000) throw new StoreError("Give it a price in dollars.");
    const qty = typeof body.quantity === "number" ? Math.floor(body.quantity) : Number.parseInt(String(body.quantity ?? ""), 10);
    if (!Number.isFinite(qty) || qty < 0 || qty > 100_000) throw new StoreError("Say how many you have.");
    const count = await prisma.partyStoreItem.count({ where: { storeId: id } });
    const item = await prisma.partyStoreItem.create({
      data: { storeId: id, name, priceCents: price, startingQty: qty, sortOrder: count }
    });
    return NextResponse.json({ ok: true, id: item.id });
  });
}
