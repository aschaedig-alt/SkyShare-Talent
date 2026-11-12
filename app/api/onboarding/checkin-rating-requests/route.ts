import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  acknowledgeRatingRequest,
  cancelRatingRequest,
  getRatingRequestViews,
  ratingRecipientOptions,
  sendRatingRequest
} from "@/lib/onboarding/checkin-rating-request";

// HR's side of the no-login 90-day rating link (feedback cmwcq16o7). Same
// permission as the in-app rating (app/api/onboarding/checkin-ratings).
//
//   GET  ?ids=a,b,c        the request for each of those hires, plus every
//                          un-dismissed "employee left" cancellation
//   GET  ?recipients=<id>  who the send dialog can offer as the recipient
//   POST { action: "send", hireId, to, toName, subject, body, linkMode }
//   POST { action: "cancel", hireId }
//   POST { action: "acknowledge", hireId }   dismiss an "employee left" notice

const MAX_IDS = 500;

export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const params = new URL(request.url).searchParams;
  const recipientsFor = params.get("recipients")?.trim();
  if (recipientsFor) {
    const r = await ratingRecipientOptions(recipientsFor);
    if (!r) return NextResponse.json({ message: "Employee not found." }, { status: 404 });
    return NextResponse.json(r);
  }
  const ids = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_IDS);
  return NextResponse.json(await getRatingRequestViews(ids));
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const hireId = str(body.hireId).trim();
  if (!hireId) return NextResponse.json({ message: "Which employee?" }, { status: 400 });
  const actor = auth.user.email ?? auth.user.name ?? null;

  if (body.action === "send") {
    const result = await sendRatingRequest({
      hireId,
      to: str(body.to),
      toName: str(body.toName) || null,
      subject: str(body.subject) || null,
      bodyHtml: typeof body.body === "string" ? body.body : null,
      linkMode: body.linkMode === "same" ? "same" : "new",
      actor
    });
    if (!result.ok) return NextResponse.json({ message: (result as { error: string }).error }, { status: 400 });
    return NextResponse.json(result);
  }
  if (body.action === "cancel") {
    const request = await cancelRatingRequest(hireId, actor);
    if (!request) return NextResponse.json({ message: "There is no open request to cancel." }, { status: 400 });
    return NextResponse.json({ ok: true, request });
  }
  if (body.action === "acknowledge") {
    await acknowledgeRatingRequest(hireId);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: "Unknown action." }, { status: 400 });
}
