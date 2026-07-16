import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) {
    return (auth as { ok: false; response: Response }).response;
  }
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (!label) {
      return NextResponse.json({ message: "Say what is needed." }, { status: 400 });
    }
    let dueAt: Date | null = null;
    if (typeof body.dueAt === "string" && body.dueAt) {
      const d = new Date(body.dueAt);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ message: "That due date is not a real date." }, { status: 400 });
      }
      dueAt = d;
    }

    const task = await prisma.eventTask.create({
      data: {
        eventId: id,
        label,
        dueAt,
        owner: typeof body.owner === "string" && body.owner.trim() ? body.owner.trim() : null
      }
    });
    return NextResponse.json({ ok: true, id: task.id });
  } catch (error) {
    console.error("Add event task error:", error);
    return NextResponse.json({ message: "Unable to add that item." }, { status: 500 });
  }
}
