import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { resolveCalendarOwner } from "@/lib/interviews/debrief";
import { createScheduleMarker } from "@/lib/interviews/schedule-marker";

/**
 * Create a "SCHEDULE <name> - <role>" to-do on the shared recruiting calendar,
 * from a row of the debrief queue.
 *
 * Separate from the dismiss route because it does something OUTWARD — it writes
 * to a calendar the whole recruiting team sees — while dismissing only changes a
 * local list. It creates no attendees, so nobody is emailed.
 */

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("calendar:write");
  // strict: false means the ok discriminant does not narrow — house pattern.
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : null;
  const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : null;

  if (!name) {
    return NextResponse.json({ message: "A candidate name is required." }, { status: 400 });
  }

  // The marker lands on the interview's OWN evening, so it has to be told which
  // day that was. Falling back to today would quietly put a three-week-old
  // backlog item on tonight instead.
  const startsAtRaw = typeof body.interviewStartsAt === "string" ? body.interviewStartsAt : "";
  const onDate = startsAtRaw ? new Date(startsAtRaw) : undefined;
  if (onDate && Number.isNaN(onDate.getTime())) {
    return NextResponse.json({ message: "interviewStartsAt is not a valid date." }, { status: 400 });
  }

  const result = await createScheduleMarker({
    ownerEmail: resolveCalendarOwner(auth.user.email),
    candidateId,
    name,
    role,
    onDate,
  });

  if (!result.ok) {
    return NextResponse.json({ message: result.message }, { status: 502 });
  }

  await logActivity({
    userId: auth.user?.id ?? undefined,
    userEmail: auth.user?.email || undefined,
    activityType: "INTERVIEW_UPDATED",
    description: `Added a SCHEDULE marker for ${name} to the recruiting calendar`,
    entityType: "Candidate",
    entityId: candidateId ?? undefined,
    metadata: { name, role: role ?? "", hadPaycomLink: result.hadPaycomLink },
  });

  return NextResponse.json(result);
}
