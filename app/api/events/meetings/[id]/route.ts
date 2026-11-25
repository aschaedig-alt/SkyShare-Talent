import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** GET — the stored transcript, for reading back what was actually said. */
export async function GET(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:read");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  const meeting = await prisma.eventMeeting.findUnique({
    where: { id },
    select: { id: true, title: true, heldAt: true, fileName: true, transcript: true }
  });
  if (!meeting) return NextResponse.json({ message: "That meeting no longer exists." }, { status: 404 });
  return NextResponse.json(meeting);
}

/**
 * DELETE — remove an imported meeting. With ?withTasks=1 its to-dos and the
 * activity ideas it added go too (the undo for an import); without it they stay
 * and just lose the link.
 */
export async function DELETE(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;
  const withTasks = new URL(request.url).searchParams.get("withTasks") === "1";
  try {
    const removed = await prisma.$transaction(async (tx) => {
      const tasks = withTasks ? await tx.eventTask.deleteMany({ where: { meetingId: id } }) : { count: 0 };
      if (withTasks) await tx.eventActivity.deleteMany({ where: { meetingId: id } });
      await tx.eventMeeting.delete({ where: { id } });
      return tasks.count;
    });
    return NextResponse.json({ ok: true, tasksRemoved: removed });
  } catch (error) {
    console.error("Remove meeting error:", error);
    return NextResponse.json({ message: "Unable to remove that meeting." }, { status: 500 });
  }
}
