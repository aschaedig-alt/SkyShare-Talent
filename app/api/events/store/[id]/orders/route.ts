import { NextResponse } from "next/server";
import { placeOrder, StoreError } from "@/lib/party-store/server";
import { actorOf, readJson, storeAdminRoute } from "@/lib/party-store/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST — ring up a sale at the register, or place a pre-order on somebody's
 * behalf (kind "PREORDER"). Prices, stock and balance are all checked server
 * side; the client sends only which items and how many.
 */
export async function POST(request: Request, ctx: Ctx) {
  return storeAdminRoute("place order", async (user) => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const newHireId = typeof body.newHireId === "string" ? body.newHireId : "";
    if (!newHireId) throw new StoreError("Pick who this is for.");
    const result = await placeOrder({
      storeId: id,
      newHireId,
      kind: body.kind === "PREORDER" ? "PREORDER" : "SALE",
      lines: body.lines,
      createdBy: actorOf(user)
    });
    return NextResponse.json({ ok: true, ...result });
  });
}
