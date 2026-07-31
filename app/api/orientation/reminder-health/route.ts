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

export async function GET(request: Request) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const previewDay = url.searchParams.get("preview");
  const wantRuns = url.searchParams.get("runs") === "1";

  if (previewDay && !/^\d{4}-\d{2}-\d{2}$/.test(previewDay)) {
    return NextResponse.json({ message: "preview must be YYYY-MM-DD." }, { status: 400 });
  }

  try {
    const health = await getReminderHealth();
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
