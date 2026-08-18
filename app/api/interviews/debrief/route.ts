import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import {
  buildDebriefQueue,
  dismissEvents,
  restoreDismissal,
  resolveCalendarOwner,
  DEBRIEF_WINDOW_DAYS,
} from "@/lib/interviews/debrief";

/**
 * The Debrief Queue: interviews on the signed-in recruiter's own calendar with no
 * write-up in the app yet. See lib/interviews/debrief.ts for why detection is by
 * invite shape rather than by title.
 *
 * GET  — build the queue (reads Google as the signed-in user).
 * POST — dismiss an event from the queue, or restore one.
 */

export const dynamic = "force-dynamic";

const MAX_WINDOW_DAYS = 90;

export async function GET(request: Request) {
  const auth = await requireApiPermission("calendar:read");
  // The cast is the house pattern (see app/api/booking-hosts/route.ts): this
  // project compiles with strict: false, so TypeScript will not narrow on the
  // `ok` boolean discriminant.
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const url = new URL(request.url);
  const requested = Number.parseInt(url.searchParams.get("days") ?? "", 10);
  const windowDays =
    Number.isFinite(requested) && requested > 0 ? Math.min(requested, MAX_WINDOW_DAYS) : DEBRIEF_WINDOW_DAYS;

  const queue = await buildDebriefQueue({
    ownerEmail: resolveCalendarOwner(auth.user.email),
    windowDays,
  });
  return NextResponse.json(queue);
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  // The cast is the house pattern (see app/api/booking-hosts/route.ts): this
  // project compiles with strict: false, so TypeScript will not narrow on the
  // `ok` boolean discriminant.
  if (!auth.ok) return (auth as { ok: false; response: Response }).response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = body.action === "restore" ? "restore" : "dismiss";

  // Accepts one eventId or many. Clearing a backlog is the main use, and a batch
  // has to arrive as ONE request — see the note on dismissEvents.
  const ids = Array.isArray(body.eventIds)
    ? body.eventIds.filter((v): v is string => typeof v === "string").map((v) => v.trim()).filter(Boolean)
    : typeof body.eventId === "string" && body.eventId.trim()
      ? [body.eventId.trim()]
      : [];

  if (!ids.length) {
    return NextResponse.json({ message: "eventId or eventIds is required." }, { status: 400 });
  }

  let cleared = 0;
  if (action === "restore") {
    for (const id of ids) await restoreDismissal(id);
    cleared = ids.length;
  } else {
    // Free text, but kept short — it is a note to the next person who wonders
    // why an interview vanished from the queue, not a write-up.
    const reason =
      typeof body.reason === "string" && body.reason.trim()
        ? body.reason.trim().slice(0, 200)
        : "Dismissed";
    cleared = await dismissEvents(
      ids.map((eventId) => ({ eventId, reason })),
      auth.user.email
    );
  }

  await logActivity({
    userId: auth.user?.id ?? undefined,
    userEmail: auth.user?.email || undefined,
    activityType: "INTERVIEW_UPDATED",
    description:
      action === "restore"
        ? `Restored ${cleared} interview(s) to the debrief queue`
        : `Cleared ${cleared} interview(s) from the debrief queue`,
    entityType: "Interview",
    entityId: ids.length === 1 ? ids[0] : undefined,
    metadata: { action, count: cleared, eventIds: ids },
  });

  return NextResponse.json({ ok: true, cleared });
}
