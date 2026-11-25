import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StoreError } from "@/lib/party-store/server";
import { readJson, storeAdminRoute } from "@/lib/party-store/http";
import { DEFAULT_STARTING_CREDIT_CENTS, parseDollarsToCents } from "@/lib/party-store/shared";

export const dynamic = "force-dynamic";

/** POST — open a store for an event. */
export async function POST(request: Request) {
  return storeAdminRoute("create store", async () => {
    const body = await readJson(request);
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
    if (!name) throw new StoreError("Give the store a name.");
    const credit =
      body.startingCredit === undefined || body.startingCredit === ""
        ? DEFAULT_STARTING_CREDIT_CENTS
        : parseDollarsToCents(body.startingCredit);
    if (credit === null || credit < 0 || credit > 1_000_000) throw new StoreError("That starting credit is not a dollar amount.");
    const eventId = typeof body.eventId === "string" && body.eventId ? body.eventId : null;
    if (eventId && !(await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } }))) {
      throw new StoreError("That event no longer exists.");
    }
    const store = await prisma.partyStore.create({ data: { name, eventId, startingCreditCents: credit } });
    return NextResponse.json({ ok: true, id: store.id });
  });
}
