import { NextResponse } from "next/server";
import { cancelOrder, getLinkView, placeOrder, StoreError } from "@/lib/party-store/server";
import { readJson, storeErrorResponse } from "@/lib/party-store/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

// PUBLIC — the employee's personal pre-order link (/store/<token>). No login:
// the token IS the access, and it only reaches this one person's own credit.
// Deliberately NOT in middleware.ts's protected list.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

function limited(request: Request, token: string) {
  const byToken = rateLimit(`party-store:${token}`, 30, 60_000);
  const byIp = rateLimit(`party-store-ip:${clientIp(request)}`, 300, 60_000);
  if (byToken.ok && byIp.ok) return null;
  return NextResponse.json({ message: "Too many tries. Wait a minute and try again." }, { status: 429 });
}

export async function GET(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const blocked = limited(request, token);
  if (blocked) return blocked;
  const view = await getLinkView(token);
  if (!view) return NextResponse.json({ message: "This link isn't valid." }, { status: 404 });
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}

/** POST { lines } — place a pre-order with this person's own credit. */
export async function POST(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const blocked = limited(request, token);
  if (blocked) return blocked;
  try {
    const view = await getLinkView(token);
    if (!view) throw new StoreError("This link isn't valid.", 404);
    const body = await readJson(request);
    const result = await placeOrder({
      storeId: view.storeId,
      newHireId: view.newHireId,
      kind: "PREORDER",
      lines: body.lines,
      createdBy: "employee link"
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return storeErrorResponse("link pre-order", error);
  }
}

/** DELETE ?order=<id> — change of mind on a pre-order HR has not filled yet. */
export async function DELETE(request: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const blocked = limited(request, token);
  if (blocked) return blocked;
  try {
    const view = await getLinkView(token);
    if (!view) throw new StoreError("This link isn't valid.", 404);
    const orderId = new URL(request.url).searchParams.get("order") ?? "";
    await cancelOrder(orderId, { onlyPendingPreorder: true, accountId: view.accountId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return storeErrorResponse("link cancel", error);
  }
}
