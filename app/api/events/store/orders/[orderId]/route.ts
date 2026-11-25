import { NextResponse } from "next/server";
import { cancelOrder, setPreorderFulfilled, StoreError } from "@/lib/party-store/server";
import { readJson, storeAdminRoute } from "@/lib/party-store/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ orderId: string }> };

/**
 * PATCH { action } —
 *   "cancel"    refund: the credit and the stock come back; the order is kept as CANCELED
 *   "fulfill"   a pre-order was handed over
 *   "unfulfill" undo that
 */
export async function PATCH(request: Request, ctx: Ctx) {
  return storeAdminRoute("update order", async () => {
    const { orderId } = await ctx.params;
    const body = await readJson(request);
    if (body.action === "cancel") await cancelOrder(orderId);
    else if (body.action === "fulfill") await setPreorderFulfilled(orderId, true);
    else if (body.action === "unfulfill") await setPreorderFulfilled(orderId, false);
    else throw new StoreError("Unknown action.");
    return NextResponse.json({ ok: true });
  });
}
