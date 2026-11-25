import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStoreSummary, StoreError } from "@/lib/party-store/server";
import { readJson, storeAdminRoute } from "@/lib/party-store/http";
import { parseDollarsToCents } from "@/lib/party-store/shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET — everything the store workspace shows. Polled, so several registers stay in step. */
export async function GET(_request: Request, ctx: Ctx) {
  return storeAdminRoute("load store", async () => {
    const { id } = await ctx.params;
    const summary = await getStoreSummary(id);
    if (!summary) throw new StoreError("That store no longer exists.", 404);
    return NextResponse.json(summary);
  });
}

/**
 * PATCH — store settings. Changing the starting credit only affects people who
 * have not been checked in, charged or sent a link yet: an account freezes its
 * credit when it is made.
 */
export async function PATCH(request: Request, ctx: Ctx) {
  return storeAdminRoute("update store", async () => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const data: { name?: string; startingCreditCents?: number; registerOpen?: boolean; preordersOpen?: boolean } = {};
    if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim().slice(0, 120);
    if (body.startingCredit !== undefined) {
      const cents = parseDollarsToCents(body.startingCredit);
      if (cents === null || cents < 0 || cents > 1_000_000) throw new StoreError("That starting credit is not a dollar amount.");
      data.startingCreditCents = cents;
    }
    if (typeof body.registerOpen === "boolean") data.registerOpen = body.registerOpen;
    if (typeof body.preordersOpen === "boolean") data.preordersOpen = body.preordersOpen;
    await prisma.partyStore.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  });
}
