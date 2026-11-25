import { NextResponse } from "next/server";
import { getCreditEmailPlan, previewParts, EMAIL_BATCH_MAX } from "@/lib/party-store/email";
import { storeAdminRoute } from "@/lib/party-store/http";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET — read only. Who can be emailed, the default wording, a sample preview,
 *  and what the send guard will do here. Sends nothing. */
export async function GET(_request: Request, ctx: Ctx) {
  return storeAdminRoute("email plan", async () => {
    const { id } = await ctx.params;
    const plan = await getCreditEmailPlan(id);
    const sample = plan.recipients.find((r) => !r.blocked) ?? plan.recipients[0];
    return NextResponse.json({
      ...plan,
      batchMax: EMAIL_BATCH_MAX,
      preview: sample ? { name: sample.name, ...previewParts(sample.name, sample.balanceCents) } : null
    });
  });
}
