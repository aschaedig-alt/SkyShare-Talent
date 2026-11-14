import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  acknowledgeRatingRequest,
  cancelRatingRequest,
  getRatingRequestViews,
  planBulkRatingSend,
  ratingRecipientOptions,
  sendBulkRatingRequests,
  sendRatingRequest
} from "@/lib/onboarding/checkin-rating-request";

// HR's side of the no-login 90-day rating link (feedback cmwcq16o7). Same
// permission as the in-app rating (app/api/onboarding/checkin-ratings).
//
//   GET  ?ids=a,b,c        the request for each of those hires, plus every
//                          un-dismissed "employee left" cancellation
//   GET  ?recipients=<id>&dayMark=<90|180|365>  who the send dialog can offer as the recipient
//   (every POST also takes dayMark: 90 | 180 | 365, default 90)
//   POST { action: "send", hireId, to, toName, subject, body, linkMode }
//   POST { action: "cancel", hireId }
//   POST { action: "acknowledge", hireId }   dismiss an "employee left" notice
//   POST { action: "bulkPlan", hireIds, dayMark }   who would get which links, by manager (writes nothing)
//   POST { action: "bulkSend", hireIds, dayMark, to, toName, subject, body }   one email, one link per person

const MAX_IDS = 500;

export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const params = new URL(request.url).searchParams;
  const recipientsFor = params.get("recipients")?.trim();
  if (recipientsFor) {
    const r = await ratingRecipientOptions(recipientsFor, Number(params.get("dayMark") ?? 90));
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
  const ids = Array.isArray(body.hireIds) ? (body.hireIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, MAX_IDS) : [];
  if (body.action === "bulkPlan") {
    const plan = await planBulkRatingSend(ids, typeof body.dayMark === "number" ? body.dayMark : 90);
    if ("error" in plan) return NextResponse.json({ message: plan.error }, { status: 400 });
    return NextResponse.json(plan);
  }
  if (body.action === "bulkSend") {
    const result = await sendBulkRatingRequests({
      hireIds: ids,
      dayMark: typeof body.dayMark === "number" ? body.dayMark : 90,
      to: str(body.to),
      toName: str(body.toName) || null,
      subject: str(body.subject) || null,
      bodyHtml: typeof body.body === "string" ? body.body : null,
      actor: auth.user.email ?? auth.user.name ?? null
    });
    if (!result.ok) return NextResponse.json({ message: (result as { error: string }).error }, { status: 400 });
    return NextResponse.json(result);
  }
  const hireId = str(body.hireId).trim();
  if (!hireId) return NextResponse.json({ message: "Which employee?" }, { status: 400 });
  const actor = auth.user.email ?? auth.user.name ?? null;
  // 90 when not given: the only check-in that had a link before the 6- and 12-month ones.
  const dayMark = typeof body.dayMark === "number" ? body.dayMark : 90;

  if (body.action === "send") {
    const result = await sendRatingRequest({
      hireId,
      dayMark,
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
    const request = await cancelRatingRequest(hireId, dayMark, actor);
    if (!request) return NextResponse.json({ message: "There is no open request to cancel." }, { status: 400 });
    return NextResponse.json({ ok: true, request });
  }
  if (body.action === "acknowledge") {
    await acknowledgeRatingRequest(hireId, dayMark);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: "Unknown action." }, { status: 400 });
}
