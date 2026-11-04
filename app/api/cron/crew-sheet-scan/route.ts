import { NextResponse } from "next/server";
import { runScan } from "@/lib/fleet/sheet-scan/store.server";

export const dynamic = "force-dynamic";

/**
 * Daily scan of the "Recruiting Status Tracking" sheet against the crew chart
 * (feedback cmw13vxfx). Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`.
 *
 * SUGGESTS ONLY. It writes the fleet/crew-sheet-scan setting and nothing else;
 * the roster changes only when a person accepts a suggestion on the chart.
 *
 * FAIL CLOSED, the same as the Paycom sweep: no CRON_SECRET means refuse, and a
 * scan that could not read the sheet answers 503 rather than a 200 that would
 * look like a quiet day in the cron log.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ ok: false, message: "CRON_SECRET is not configured — refusing to run unauthenticated." }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const state = await runScan();
  if (state.error) return NextResponse.json({ ok: false, message: state.error }, { status: 503 });
  return NextResponse.json({
    ok: true,
    scannedAt: state.scannedAt,
    suggestions: state.result?.suggestions.length ?? 0,
    agree: state.result?.agree ?? 0
  });
}
