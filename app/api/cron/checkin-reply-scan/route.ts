import { NextResponse } from "next/server";
import { scanCheckinReplies } from "@/lib/onboarding/checkin-replies";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily sweep for replies to the post-onboarding check-in emails, triggered by
 * Vercel Cron (see lib/onboarding/checkin-replies.ts). The Post-onboard grid has a
 * "Check for replies" button that runs the same sweep on demand.
 *
 * Safe unattended: it only ADDS reply records (keyed by Front message id, so a
 * re-run files nothing twice), tags the thread "[automated]", and never replies,
 * sends, or changes a checklist step.
 */
export async function GET(request: Request) {
  // Fail closed, like paycom-scan: this route writes to the live database.
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, message: "CRON_SECRET is not configured — refusing to run unauthenticated." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (!process.env.FRONT_API_TOKEN) {
    return NextResponse.json({ ok: false, message: "Front is not configured — refusing to run." }, { status: 503 });
  }
  try {
    const report = await scanCheckinReplies({ apply: true });
    const levels = report.found.reduce<Record<string, number>>((acc, f) => ((acc[f.level] = (acc[f.level] ?? 0) + 1), acc), {});
    console.log(
      `Check-in reply cron: ${report.sendsChecked} sends, ${report.threadsRead} threads, ${report.searchesRun} searches, ${report.found.length} new, ${report.alreadyFiled} already filed`,
      levels,
      report.errors
    );
    return NextResponse.json({
      ok: true,
      sendsChecked: report.sendsChecked,
      newReplies: report.found.length,
      alreadyFiled: report.alreadyFiled,
      levels,
      errors: report.errors
    });
  } catch (error) {
    console.error("Check-in reply cron error:", error);
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
