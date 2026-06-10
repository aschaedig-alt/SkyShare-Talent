import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { isGoogleCalendarConfigured } from "@/lib/google/calendar";
import { pullGoogleChanges, pushAllUnsyncedInterviews } from "@/lib/google/interview-sync";

export async function POST() {
  const authResult = await requireApiPermission("calendar:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json(
      { ok: false, message: "Google Calendar is not configured yet." },
      { status: 400 }
    );
  }

  try {
    // First push any local interviews not yet on Google, then pull changes back
    const { pushed } = await pushAllUnsyncedInterviews();
    const pull = await pullGoogleChanges();

    return NextResponse.json({
      ok: pull.ok,
      pushed,
      updated: pull.updated,
      cancelled: pull.cancelled,
      message: `Pushed ${pushed} new event${pushed === 1 ? "" : "s"}. ${pull.message}`
    });
  } catch (error) {
    console.error("Sync error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Sync failed." },
      { status: 500 }
    );
  }
}
