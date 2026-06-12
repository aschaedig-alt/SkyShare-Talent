import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  try {
    const body = (await request.json()) as { sessionId?: string; label?: string; owner?: string; dueDaysBefore?: number };
    if (!body?.sessionId || !body?.label?.trim()) {
      return NextResponse.json({ message: "sessionId and label are required." }, { status: 400 });
    }
    const max = await prisma.orientationPrepTask.aggregate({ where: { sessionId: body.sessionId }, _max: { order: true } });
    const task = await prisma.orientationPrepTask.create({
      data: {
        sessionId: body.sessionId,
        label: body.label.trim().slice(0, 200),
        owner: body.owner?.trim() || null,
        dueDaysBefore: typeof body.dueDaysBefore === "number" ? body.dueDaysBefore : null,
        order: (max._max.order ?? -1) + 1
      }
    });
    return NextResponse.json({ ok: true, id: task.id });
  } catch (error) {
    console.error("Create prep task error:", error);
    return NextResponse.json({ message: "Unable to add task." }, { status: 500 });
  }
}
