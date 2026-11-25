import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";

// A note on an activity - feedback, an idea, "I can bring the speaker". events:READ,
// like suggesting an activity: anyone who can see events can contribute (Aimee,
// Nov 25 2026). Signed with the signed-in user's name.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const text = typeof body.body === "string" ? body.body.trim().slice(0, 4000) : "";
    if (!text) return NextResponse.json({ message: "Write something first." }, { status: 400 });
    const exists = await prisma.eventActivity.findUnique({ where: { id }, select: { id: true } });
    if (!exists) return NextResponse.json({ message: "That activity no longer exists." }, { status: 404 });
    const comment = await prisma.eventActivityComment.create({
      data: { activityId: id, body: text, author: auth.user.name ?? auth.user.email ?? null }
    });
    return NextResponse.json({ ok: true, id: comment.id });
  } catch (error) {
    console.error("Add activity comment error:", error);
    return NextResponse.json({ message: "Unable to save that note." }, { status: 500 });
  }
}
