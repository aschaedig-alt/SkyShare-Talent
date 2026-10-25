import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { getReminderHealth, getReminderRuns, previewDueReminders } from "@/lib/orientation/reminder";

export const dynamic = "force-dynamic";

// Is the automatic orientation reminder going to go out, and did it?
//
// The reminder cron is the only thing in the app that emails a real new hire
// unattended, and its failure mode is SILENCE — a cron that stops firing, a
// missing CRON_SECRET, a session quietly moved out of UPCOMING and a clean run
// with nothing due all look identical from outside. This route is what makes
// them distinguishable.
//
// Read-only: it sends nothing and writes nothing, so it is safe to hit at any
// time, including the morning of a send.
//
//   GET ?preview=YYYY-MM-DD   also dry-run that Mountain day and return the exact
//                             emails that would go out
//   GET ?runs=1               also return the recorded run history
//   GET ?sessionId=<id>       scope the per-session half of the answer
//                             (`sessionProblems`) to that session. `problems` is
//                             the cron itself and is never scoped — a stopped
//                             cron is worth seeing from wherever you are looking.
//                             Without this the route had no idea which session
//                             was being viewed, so a warning about one session
//                             was rendered on every session's page.
//
// One field is always global, whatever sessionId says: `unarmedDueSoon`, the
// UPCOMING sessions whose reminder day is within a few days and that nobody has
// turned "Send it automatically" on for. The exact window is
// UNARMED_WARN_WITHIN_DAYS in lib/orientation/reminder.ts, which carries the
// argument for the number — read it there rather than restating it here, so the
// two cannot drift. Its warning is in `problems` for the same reason — the session nobody
// armed is the session nobody has opened, so a copy scoped to its own page would
// be read by precisely the person who did not need it. This is the failure that
// got past the diagnostic in September; see the comments in lib/orientation/reminder.ts.

export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const previewDay = url.searchParams.get("preview");
  const wantRuns = url.searchParams.get("runs") === "1";
  const sessionId = url.searchParams.get("sessionId")?.trim() || undefined;

  if (previewDay && !/^\d{4}-\d{2}-\d{2}$/.test(previewDay)) {
    return NextResponse.json({ message: "preview must be YYYY-MM-DD." }, { status: 400 });
  }

  try {
    const health = await getReminderHealth(sessionId);
    const preview = previewDay ? await previewDueReminders(previewDay) : null;
    const runs = wantRuns ? await getReminderRuns() : null;
    return NextResponse.json({ ...health, preview, runs });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "Could not read reminder health." },
      { status: 500 }
    );
  }
}
