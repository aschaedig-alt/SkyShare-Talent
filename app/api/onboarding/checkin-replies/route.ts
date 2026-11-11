import { NextResponse } from "next/server";
import { requireApiPermission, authFailureResponse } from "@/lib/auth/route-auth";
import { getOpenReplies, getRepliesForHires, isHrCaller, updateReply } from "@/lib/onboarding/checkin-replies";
import { isReplyLevel } from "@/lib/onboarding/checkin-reply";

// Check-in email replies (lib/onboarding/checkin-reply.ts). HR ONLY, in and out -
// his answer on 2026-11-11 - because these are employees writing frankly to HR
// about their managers and teams. A non-HR session gets a 403 and no text.
//
//   GET  ?ids=a,b,c     replies for those people (Post-onboard grid, person page)
//   GET  ?open=1        needs action / talk to HR, not yet handled (dashboard)
//   PATCH { messageId, handled?, note?, level? }   HR's call on one reply

const MAX_IDS = 500;

function notHr() {
  return NextResponse.json({ message: "Check-in replies are for the HR team only." }, { status: 403 });
}

export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return authFailureResponse(auth);
  if (!isHrCaller(auth.user)) return notHr();
  const params = new URL(request.url).searchParams;
  if (params.get("open") === "1") return NextResponse.json({ replies: await getOpenReplies() });
  const ids = (params.get("ids") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, MAX_IDS);
  if (!ids.length) return NextResponse.json({ replies: [] });
  return NextResponse.json({ replies: await getRepliesForHires(ids) });
}

export async function PATCH(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return authFailureResponse(auth);
  if (!isHrCaller(auth.user)) return notHr();
  const body = (await request.json().catch(() => ({}))) as { messageId?: unknown; handled?: unknown; note?: unknown; level?: unknown };
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  if (!messageId) return NextResponse.json({ message: "Which reply?" }, { status: 400 });
  const change: Parameters<typeof updateReply>[1] = {};
  if (typeof body.handled === "boolean") change.handled = body.handled;
  if (typeof body.note === "string") change.note = body.note.trim().slice(0, 1000) || null;
  if (body.level === null) change.level = null;
  else if (isReplyLevel(body.level)) change.level = body.level;
  const saved = await updateReply(messageId, change, auth.user.email ?? auth.user.name ?? null);
  if (!saved) return NextResponse.json({ message: "That reply was not found." }, { status: 404 });
  return NextResponse.json({ ok: true, reply: saved });
}
