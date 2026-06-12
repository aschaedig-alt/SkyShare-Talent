import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as { done?: boolean; label?: string; owner?: string; dueDaysBefore?: number | null };
    const data: Record<string, unknown> = {};
    if (typeof body.done === "boolean") {
      data.done = body.done;
      data.completedAt = body.done ? new Date() : null;
    }
    if (typeof body.label === "string" && body.label.trim()) data.label = body.label.trim().slice(0, 200);
    if (body.owner !== undefined) data.owner = body.owner ? String(body.owner).trim() : null;
    if (body.dueDaysBefore !== undefined) data.dueDaysBefore = typeof body.dueDaysBefore === "number" ? body.dueDaysBefore : null;
    await prisma.orientationPrepTask.update({ where: { id }, data });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Update prep task error:", error);
    return NextResponse.json({ message: "Unable to update task." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    await prisma.orientationPrepTask.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ message: "Unable to delete task." }, { status: 500 });
  }
}
