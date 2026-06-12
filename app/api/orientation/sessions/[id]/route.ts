import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { completeOrientationSession } from "@/lib/data/orientation";

type Ctx = { params: Promise<{ id: string }> };

function str(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;

    if (body.status === "COMPLETE") {
      await completeOrientationSession(id);
      return NextResponse.json({ ok: true });
    }

    const data: Record<string, unknown> = {};
    for (const f of ["location", "address", "meetLink", "notes"]) {
      const v = str(body[f]);
      if (v !== undefined) data[f] = v;
    }
    if (typeof body.date === "string") {
      const d = new Date(body.date);
      if (!Number.isNaN(d.getTime())) data.date = d;
    }
    if (body.status === "UPCOMING" || body.status === "CANCELED") data.status = body.status;

    await prisma.orientationSession.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update orientation session error:", error);
    return NextResponse.json({ message: "Unable to update session." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.orientationSession.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Unable to delete session." }, { status: 500 });
  }
}
