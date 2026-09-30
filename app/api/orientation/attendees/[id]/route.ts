import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isCardFlagState, setCardState } from "@/lib/orientation/card-state";
import { isChecklistFlagState, setChecklistFlag } from "@/lib/orientation/checklist-link";
import { refreshHireOrientationDate } from "@/lib/data/orientation";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (body.confirmed === "PENDING" || body.confirmed === "TENTATIVE" || body.confirmed === "CONFIRMED" || body.confirmed === "DECLINED") data.confirmed = body.confirmed;
    if (body.travelStatus === "NA" || body.travelStatus === "NEEDED" || body.travelStatus === "ARRANGED" || body.travelStatus === "REMOTE") {
      data.travelStatus = body.travelStatus;
    }
    for (const f of ["ipadReady", "swagReady"]) {
      if (typeof body[f] === "boolean") data[f] = body[f];
    }

    // The credit card is three-way — To do / Done / Not needed. "Not needed" has
    // nowhere to live on a boolean column, so it is stored beside it and both
    // writes are decided in one place (lib/orientation/card-state.ts). cardReady
    // stays honest: NA always writes it false.
    //
    // A raw cardReady boolean is deliberately NOT accepted any more: it would set
    // the column without touching the not-needed flag, leaving the two disagreeing
    // and the cell still showing "not needed" after somebody ticked it ready.
    //
    // Both the card and the iPad also write the hire's own checklist step when the
    // checklist has one, so the two screens can never disagree again - see
    // lib/orientation/checklist-link.ts.
    const needsHire = isCardFlagState(body.cardState) || isChecklistFlagState(body.ipadState);
    const hireId = needsHire
      ? (await prisma.orientationAttendee.findUnique({ where: { id }, select: { newHireId: true } }))?.newHireId
      : undefined;
    if (isCardFlagState(body.cardState)) {
      data.cardReady = await setCardState(id, body.cardState);
      if (hireId) await setChecklistFlag(hireId, "card", body.cardState);
    }
    // The iPad is three-way too now: "not needed" is the checklist's N/A. The
    // attendee's own column stays a plain "is it in hand".
    if (isChecklistFlagState(body.ipadState)) {
      data.ipadReady = body.ipadState === "DONE";
      if (hireId) await setChecklistFlag(hireId, "ipad", body.ipadState);
    }

    // Toggle an email template as sent / not sent.
    if (typeof body.markSent === "string" || typeof body.markUnsent === "string") {
      const current = await prisma.orientationAttendee.findUnique({ where: { id }, select: { sentTemplateKeys: true } });
      let keys: string[] = [];
      try {
        const v = JSON.parse(current?.sentTemplateKeys ?? "[]") as unknown;
        keys = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
      } catch {
        keys = [];
      }
      if (typeof body.markSent === "string" && !keys.includes(body.markSent)) keys.push(body.markSent);
      if (typeof body.markUnsent === "string") keys = keys.filter((k) => k !== body.markUnsent);
      data.sentTemplateKeys = JSON.stringify(keys);
    }

    await prisma.orientationAttendee.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update attendee error:", error);
    return NextResponse.json({ message: "Unable to update attendee." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const removed = await prisma.orientationAttendee.delete({ where: { id }, select: { newHireId: true } });
    // The hire's own orientation date named the session they just came off, so
    // they read as scheduled for a day they are not on (Sam Jaffari, Sep 29).
    await refreshHireOrientationDate(removed.newHireId);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Unable to remove attendee." }, { status: 500 });
  }
}
