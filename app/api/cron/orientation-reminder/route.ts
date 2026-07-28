import { NextResponse } from "next/server";
import { runDueReminders } from "@/lib/orientation/reminder";

export const dynamic = "force-dynamic";

/**
 * Sends the "3. Reminder" orientation email one business day before each ARMED
 * session. Triggered by Vercel Cron; Vercel sends
 * `Authorization: Bearer ${CRON_SECRET}`.
 *
 * THIS IS THE FIRST CRON IN THE APP THAT EMAILS A REAL PERSON. Every other one
 * scans a mailbox and ticks internal state, which is recoverable; this is not.
 * Two things keep it safe, and neither should be removed:
 *
 *  1. It only touches sessions somebody DELIBERATELY ARMED. An unarmed session is
 *     invisible to it, so the default for every new session is "no automatic mail".
 *  2. It is idempotent — an attendee with the reminder already recorded is skipped,
 *     so a double run, a retry, or a manual send earlier the same day cannot email
 *     anybody twice.
 *
 * Fails closed: a missing CRON_SECRET means nobody gets in, because this route
 * sends mail and the deployment is public.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ message: "CRON_SECRET is not configured." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDueReminders();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Orientation reminder cron failed:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Reminder run failed." },
      { status: 500 }
    );
  }
}
