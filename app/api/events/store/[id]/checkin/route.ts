import { NextResponse } from "next/server";
import { setCheckedIn, StoreError } from "@/lib/party-store/server";
import { actorOf, readJson, storeAdminRoute } from "@/lib/party-store/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** POST { newHireId, checkedIn } — mark somebody arrived (or undo it). */
export async function POST(request: Request, ctx: Ctx) {
  return storeAdminRoute("check in", async (user) => {
    const { id } = await ctx.params;
    const body = await readJson(request);
    const newHireId = typeof body.newHireId === "string" ? body.newHireId : "";
    if (!newHireId) throw new StoreError("Pick who is checking in.");
    await setCheckedIn(id, newHireId, body.checkedIn !== false, actorOf(user));
    return NextResponse.json({ ok: true });
  });
}
