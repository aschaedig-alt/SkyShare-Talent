import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { prisma } from "@/lib/prisma";
import { dayKeyOf } from "@/lib/dates/display";
import { CURRENT_EMPLOYEE_WHERE } from "@/lib/data/current-employee";
import { extractMeetingTasks } from "@/lib/events/meeting-tasks-ai";

// READ-ONLY: reads a pasted/uploaded transcript and returns suggested to-dos.
// Nothing is saved here — POST /api/events/[id]/meetings does that, after review.
// events:write, because it spends model tokens.

export const dynamic = "force-dynamic";
// An hour-long meeting is a long read for the model.
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "That request was not readable." }, { status: 400 });
  }
  const transcript = typeof body.transcript === "string" ? body.transcript : "";
  if (!transcript.trim()) return NextResponse.json({ message: "Paste or upload the transcript first." }, { status: 400 });

  const event = await prisma.event.findUnique({
    where: { id },
    select: { name: true, startsAt: true, audience: true, attendees: { select: { newHire: { select: { name: true } } } } }
  });
  if (!event) return NextResponse.json({ message: "That event no longer exists." }, { status: 404 });

  // Names the model may match a spoken first name against: who is on the event
  // first, then everyone who works here.
  const roster = await prisma.newHire.findMany({ where: CURRENT_EMPLOYEE_WHERE, select: { name: true } });
  const knownPeople = Array.from(
    new Set([...event.attendees.map((a) => a.newHire.name), ...roster.map((r) => r.name)].filter(Boolean))
  );

  const heldAt = typeof body.heldAt === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.heldAt) ? body.heldAt : null;
  const result = await extractMeetingTasks({
    transcript,
    eventName: event.name,
    // dayKeyOf, not officeDayKey: a party stored as a calendar day (midnight UTC)
    // reads as the day BEFORE in Mountain time. Caught in testing, Nov 24.
    eventDate: dayKeyOf(event.startsAt),
    meetingDate: heldAt,
    meetingTitle: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Planning meeting",
    knownPeople,
    internal: event.audience === "INTERNAL"
  });
  if (!result.ok) {
    return NextResponse.json({ message: (result as { ok: false; message: string }).message }, { status: 502 });
  }
  return NextResponse.json(result);
}
