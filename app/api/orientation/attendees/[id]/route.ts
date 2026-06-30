import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};

    if (body.confirmed === "PENDING" || body.confirmed === "TENTATIVE" || body.confirmed === "CONFIRMED" || body.confirmed === "DECLINED") data.confirmed = body.confirmed;
    if (body.travelStatus === "NA" || body.travelStatus === "NEEDED" || body.travelStatus === "ARRANGED") data.travelStatus = body.travelStatus;
    for (const f of ["ipadReady", "cardReady", "swagReady"]) {
      if (typeof body[f] === "boolean") data[f] = body[f];
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
    await prisma.orientationAttendee.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Unable to remove attendee." }, { status: 500 });
  }
}
