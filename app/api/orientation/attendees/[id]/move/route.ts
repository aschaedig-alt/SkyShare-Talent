import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { moveAttendee } from "@/lib/data/orientation";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  const { id } = await ctx.params;
  try {
    const body = (await request.json()) as { toSessionId?: string };
    if (!body?.toSessionId) {
      return NextResponse.json({ message: "toSessionId is required." }, { status: 400 });
    }
    await moveAttendee(id, body.toSessionId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Move attendee error:", error);
    return NextResponse.json({ message: "Unable to move attendee." }, { status: 500 });
  }
}
