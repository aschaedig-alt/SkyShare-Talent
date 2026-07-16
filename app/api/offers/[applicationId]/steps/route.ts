import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { recordOfferStep } from "@/lib/offers/record-offer-step";
import { isOfferStepKey } from "@/lib/offers/steps";

type RouteContext = { params: Promise<{ applicationId: string }> };

/**
 * Tick or untick one offer step. A thin caller, like its sibling route: all the
 * behaviour lives in recordOfferStep / recordOfferStatus.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  const { applicationId } = await context.params;

  try {
    const body = (await request.json()) as { key?: unknown; done?: unknown };
    if (!isOfferStepKey(body.key)) {
      return NextResponse.json({ message: "Unknown offer step." }, { status: 400 });
    }
    if (typeof body.done !== "boolean") {
      return NextResponse.json({ message: "Missing done." }, { status: 400 });
    }

    const result = await recordOfferStep(applicationId, body.key, body.done, {
      id: auth.user.id,
      email: auth.user.email
    });
    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });

    return NextResponse.json({ ok: true, steps: result.steps, status: result.status });
  } catch (error) {
    console.error("Offer step error:", error);
    return NextResponse.json({ message: "Unable to update the offer step." }, { status: 500 });
  }
}
