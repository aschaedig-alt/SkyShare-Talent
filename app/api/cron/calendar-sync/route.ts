import { NextResponse } from "next/server";
import { isGoogleCalendarConfigured } from "@/lib/google/calendar";
import { pullGoogleChanges } from "@/lib/google/interview-sync";

export const dynamic = "force-dynamic";

/**
 * Periodic two-way sync pull, triggered by Vercel Cron.
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
 *
 * FAILS CLOSED. This used to skip the check entirely when CRON_SECRET was unset,
 * which is fine on Production (the var is set there) but not on Preview — preview
 * deployments have no CRON_SECRET and yet share DATABASE_URL with the live
 * database, so anyone with a preview URL could drive a sync against real data.
 * Refusing is the right answer everywhere the secret is absent; Vercel only runs
 * crons on Production anyway.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { ok: false, message: "CRON_SECRET is not configured — refusing to run unauthenticated." },
      { status: 503 }
    );
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ ok: false, message: "Not configured" });
  }

  const result = await pullGoogleChanges();
  return NextResponse.json(result);
}
