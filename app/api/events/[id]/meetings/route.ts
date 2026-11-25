import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";
import { startOfOfficeDay } from "@/lib/dates/display";
import { isTaskStatus } from "@/lib/events/constants";

// Save a reviewed meeting import: the meeting (with its transcript, so every task
// can be traced to what was said), the to-dos the reviewer kept and, for a company
// event, the activity ideas they kept (Nov 25 2026). One transaction — either all
// of it lands or none of it does. Undo is DELETE /api/events/meetings/[id]?withTasks=1,
// which takes the activities with it too.

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MAX_ITEMS = 200;

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const title =
      typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 200) : "Planning meeting";
    const transcript = typeof body.transcript === "string" ? body.transcript : "";
    if (!transcript.trim()) return NextResponse.json({ message: "The transcript is missing." }, { status: 400 });
    const heldAt = typeof body.heldAt === "string" && body.heldAt ? startOfOfficeDay(body.heldAt) : null;
    const fileName =
      typeof body.fileName === "string" && body.fileName.trim() ? body.fileName.trim().slice(0, 200) : null;

    const rawItems = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
    const items: {
      eventId: string;
      label: string;
      owner: string | null;
      notes: string | null;
      dueAt: Date | null;
      status: string;
      done: boolean;
    }[] = [];
    for (const entry of rawItems) {
      const e = (entry ?? {}) as Record<string, unknown>;
      const label = typeof e.label === "string" ? e.label.trim().slice(0, 200) : "";
      if (!label) continue;
      let dueAt: Date | null = null;
      if (typeof e.dueAt === "string" && e.dueAt) {
        const d = /^\d{4}-\d{2}-\d{2}$/.test(e.dueAt) ? startOfOfficeDay(e.dueAt) : new Date(e.dueAt);
        if (d && !Number.isNaN(d.getTime())) dueAt = d;
      }
      const status = isTaskStatus(e.status) ? e.status : "TODO";
      items.push({
        eventId: id,
        label,
        owner: typeof e.owner === "string" && e.owner.trim() ? e.owner.trim().slice(0, 120) : null,
        notes: typeof e.notes === "string" && e.notes.trim() ? e.notes.trim().slice(0, 2000) : null,
        dueAt,
        status,
        done: status === "DONE"
      });
    }

    const exists = await prisma.event.findUnique({ where: { id }, select: { id: true, audience: true } });
    if (!exists) return NextResponse.json({ message: "That event no longer exists." }, { status: 404 });

    const rawActivities = exists.audience === "INTERNAL" && Array.isArray(body.activities) ? body.activities.slice(0, MAX_ITEMS) : [];
    const activities: { eventId: string; name: string; description: string | null; owner: string | null; suggestedBy: string }[] = [];
    for (const entry of rawActivities) {
      const e = (entry ?? {}) as Record<string, unknown>;
      const name = typeof e.name === "string" ? e.name.trim().slice(0, 160) : "";
      if (!name) continue;
      activities.push({
        eventId: id,
        name,
        description: typeof e.description === "string" && e.description.trim() ? e.description.trim().slice(0, 4000) : null,
        owner: typeof e.owner === "string" && e.owner.trim() ? e.owner.trim().slice(0, 120) : null,
        suggestedBy: `Meeting: ${title}`.slice(0, 200)
      });
    }

    const meeting = await prisma.$transaction(async (tx) => {
      const created = await tx.eventMeeting.create({ data: { eventId: id, title, heldAt, fileName, transcript } });
      if (items.length) {
        await tx.eventTask.createMany({ data: items.map((item) => ({ ...item, meetingId: created.id })) });
      }
      if (activities.length) {
        await tx.eventActivity.createMany({ data: activities.map((a) => ({ ...a, meetingId: created.id })) });
      }
      return created;
    });

    return NextResponse.json({ ok: true, id: meeting.id, taskCount: items.length, activityCount: activities.length });
  } catch (error) {
    console.error("Save meeting import error:", error);
    return NextResponse.json({ message: "Unable to save that meeting." }, { status: 500 });
  }
}
