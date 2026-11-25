import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import {
  acknowledgeRatingRequest,
  cancelRatingRequest,
  cancelRatingRequestsBulk,
  getRatingRequestViews,
  planBulkRatingSend,
  ratingRecipientOptions,
  sendBulkRatingRequests,
  sendRatingRequest,
  type BulkRatingOptions
} from "@/lib/onboarding/checkin-rating-request";
import type { RatingRecipientMode } from "@/lib/onboarding/checkin-rating-request-shared";

// HR's side of the no-login 90-day rating link (feedback cmwcq16o7). Same
// permission as the in-app rating (app/api/onboarding/checkin-ratings).
//
//   GET  ?ids=a,b,c        the request for each of those hires, plus every
//                          un-dismissed "employee left" cancellation
//   GET  ?recipients=<id>&dayMark=<90|180|365>  who the send dialog can offer as the recipient
//   (every POST also takes dayMark: 90 | 180 | 365, default 90)
//   POST { action: "send", hireId, to, toName, subject, body, linkMode, additional }
//          additional: true = another supervisor's link beside the main one (scores averaged)
//   POST { action: "cancel", hireId, to? }   every open link for that check-in, or only the one to "to"
//   POST { action: "acknowledge", hireId }   dismiss an "employee left" notice
//   POST { action: "bulkPlan", hireIds, dayMark, options }   who would get which links (writes nothing)
//   POST { action: "bulkSend", hireIds, dayMark, options, to, toName, subject, body }   one email, one link per person
//          options: { mode: "supervisor" | "supervisor2" | "both" | "other", other?: { to, toName }, replaceOpen? }
//   POST { action: "bulkCancel", hireIds, dayMark }   every open link for the ticked people

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
const MODES: RatingRecipientMode[] = ["supervisor", "supervisor2", "both", "other"];

/** The bulk options from a request body; anything unknown means the first supervisor, as before Nov 25 2026. */
function bulkOptions(raw: unknown): BulkRatingOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const mode = MODES.includes(o.mode as RatingRecipientMode) ? (o.mode as RatingRecipientMode) : "supervisor";
  const other = o.other && typeof o.other === "object" ? (o.other as Record<string, unknown>) : null;
  return {
    mode,
    other: other ? { to: str(other.to).trim(), toName: str(other.toName).trim() || null } : null,
    replaceOpen: o.replaceOpen === true
  };
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(body.hireIds) ? (body.hireIds as unknown[]).filter((x): x is string => typeof x === "string").slice(0, MAX_IDS) : [];
  if (body.action === "bulkPlan") {
    const plan = await planBulkRatingSend(ids, typeof body.dayMark === "number" ? body.dayMark : 90, bulkOptions(body.options));
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
      actor: auth.user.email ?? auth.user.name ?? null,
      options: bulkOptions(body.options)
    });
    if (!result.ok) return NextResponse.json({ message: (result as { error: string }).error }, { status: 400 });
    return NextResponse.json(result);
  }
  if (body.action === "bulkCancel") {
    const result = await cancelRatingRequestsBulk(ids, typeof body.dayMark === "number" ? body.dayMark : 90, auth.user.email ?? auth.user.name ?? null);
    return NextResponse.json({ ok: true, ...result });
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
      additional: body.additional === true,
      actor
    });
    if (!result.ok) return NextResponse.json({ message: (result as { error: string }).error }, { status: 400 });
    return NextResponse.json(result);
  }
  if (body.action === "cancel") {
    const request = await cancelRatingRequest(hireId, dayMark, actor, "MANUAL", str(body.to).trim() || null);
    if (!request) return NextResponse.json({ message: "There is no open request to cancel." }, { status: 400 });
    return NextResponse.json({ ok: true, request });
  }
  if (body.action === "acknowledge") {
    await acknowledgeRatingRequest(hireId, dayMark);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ message: "Unknown action." }, { status: 400 });
}
