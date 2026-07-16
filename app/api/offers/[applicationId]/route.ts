import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { recordOfferStatus } from "@/lib/offers/record-offer-status";
import { isOfferStatus } from "@/lib/offers/constants";

type RouteContext = { params: Promise<{ applicationId: string }> };

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Set an offer's state by hand. This is a thin caller of recordOfferStatus —
 * deliberately so. All the behaviour lives in that function, which is why the
 * later Front/Paycom inbound handler can reuse it wholesale instead of
 * re-implementing this route's logic.
 */
export async function POST(request: Request, context: RouteContext) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }

  const { applicationId } = await context.params;

  try {
    const body = (await request.json()) as {
      status?: string;
      at?: string | null;
      reason?: string | null;
      startDate?: string | null;
    };

    if (!isOfferStatus(body.status)) {
      return NextResponse.json({ message: "Unknown offer status." }, { status: 400 });
    }

    const result = await recordOfferStatus(applicationId, {
      status: body.status,
      at: parseDate(body.at) ?? null,
      startDate: parseDate(body.startDate),
      reason: body.reason ?? null,
      source: "MANUAL",
      actor: { id: auth.user.id, email: auth.user.email }
    });

    if (!result.ok) return NextResponse.json({ message: result.message }, { status: 400 });
    return NextResponse.json({ ok: true, changed: result.changed, message: result.message });
  } catch (error) {
    console.error("Offer status error:", error);
    return NextResponse.json({ message: "Unable to update the offer." }, { status: 500 });
  }
}
