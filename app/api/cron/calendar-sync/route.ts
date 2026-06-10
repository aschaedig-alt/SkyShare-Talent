import { NextResponse } from "next/server";
import { isGoogleCalendarConfigured } from "@/lib/google/calendar";
import { pullGoogleChanges } from "@/lib/google/interview-sync";

export const dynamic = "force-dynamic";

/**
 * Periodic two-way sync pull, triggered by Vercel Cron.
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ ok: false, message: "Not configured" });
  }

  const result = await pullGoogleChanges();
  return NextResponse.json(result);
}
