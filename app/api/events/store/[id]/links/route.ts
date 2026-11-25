import { NextResponse } from "next/server";
import { ensureLinksForEveryoneWithCredit, ensureLinkToken, StoreError } from "@/lib/party-store/server";
import { readJson, storeAdminRoute } from "@/lib/party-store/http";
import { partyStoreLinkPath } from "@/lib/party-store/shared";
import { cardLinkOrigin } from "@/lib/new-hire-contacts/hire-card-link";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST { newHireId } — that person's personal pre-order link (made once, then
 * the same link every time). POST { all: true } — make links for everyone who
 * still has credit, ready for the CSV export. Sends nothing.
 */
export async function POST(request: Request, ctx: Ctx) {
  return storeAdminRoute("make link", async () => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    if (body.all === true) {
      const made = await ensureLinksForEveryoneWithCredit(id);
      return NextResponse.json({ ok: true, made });
    }
    const newHireId = typeof body.newHireId === "string" ? body.newHireId : "";
    if (!newHireId) throw new StoreError("Pick whose link this is.");
    const token = await ensureLinkToken(id, newHireId);
    return NextResponse.json({ ok: true, url: `${cardLinkOrigin()}${partyStoreLinkPath(token)}` });
  });
}
