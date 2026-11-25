import { NextResponse } from "next/server";
import { sendCreditEmails } from "@/lib/party-store/email";
import { actorOf, readJson, storeAdminRoute } from "@/lib/party-store/http";
import { StoreError } from "@/lib/party-store/server";

// SENDS EMAIL to real employees (in production). Only ever called from the
// store's Send dialog after a person has picked the recipients and confirmed.
// Nothing schedules it.

export const dynamic = "force-dynamic";
// A batch of 20 Front sends, with Front's own 429 backoff, fits comfortably.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  return storeAdminRoute("send credit emails", async (user) => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    // The dialog sends this; a stray or replayed call without it does nothing.
    if (body.confirmed !== true) throw new StoreError("Confirm the send first.");
    const newHireIds = Array.isArray(body.newHireIds) ? body.newHireIds.filter((v): v is string => typeof v === "string") : [];
    const results = await sendCreditEmails({
      storeId: id,
      newHireIds,
      subject: typeof body.subject === "string" ? body.subject : "",
      editedBodyHtml: typeof body.bodyHtml === "string" ? body.bodyHtml : null,
      actor: actorOf(user)
    });
    return NextResponse.json({ ok: true, results });
  });
}
