import { NextResponse } from "next/server";
import { scanPaycomInbox } from "@/lib/paycom/scan";

export const dynamic = "force-dynamic";

/**
 * Nightly sweep of Paycom's notices, triggered by Vercel Cron.
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
 *
 * ONE DOOR, AND IT IS FRONT. That includes "Offer Accepted", which Paycom
 * addresses to one person and copies to no shared inbox — the user's own Front
 * rule creates a copy in the shared HR Onboarding inbox, and the queries in
 * lib/paycom/scan.ts are written not to trust that copy's headers. A Gmail reader
 * for the same notice existed for a few hours on Aug 16 2026 and was removed: it
 * read the same mail twice and cost a mailbox-wide Google grant to do it.
 *
 * This one APPLIES — it is the run that keeps the checklist current without
 * anyone asking. Safe to run unattended because the underlying handler only ever
 * ticks forward, is idempotent, skips former staff, and does nothing at all when
 * a name doesn't resolve to exactly one person. Use POST /api/front/scan-paycom
 * (dry run by default) to see what it would do before trusting it.
 *
 * Worth keeping even once a Front webhook exists: webhooks get missed — a
 * disabled rule, a deploy mid-delivery, an outage — and a nightly sweep costs
 * nothing on the days there is nothing to do.
 */
export async function GET(request: Request) {
  // FAIL CLOSED. A missing CRON_SECRET must not mean "let anyone in" — this route
  // writes to the live database, and the deployment is public. (The older
  // calendar-sync cron does skip its check when the secret is unset; don't copy
  // that here.)
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

  // A missing token is a 503, NOT a cheerful 200 with ok:false. A refusal that
  // returns 200 is indistinguishable from a quiet night in the cron log, which is
  // the failure mode that hides a broken sweep for weeks.
  if (!process.env.FRONT_API_TOKEN) {
    return NextResponse.json(
      { ok: false, message: "Front is not configured — refusing to run." },
      { status: 503 }
    );
  }

  try {
    const report = await scanPaycomInbox({ apply: true });
    // Summarised into the Vercel logs so a silent failure is still visible.
    console.log(
      `Paycom cron: ${report.conversationsScanned} threads, ${report.noticesFound} notices, ${report.ticked} ticked, ${report.ignored} ignored`,
      report.tally
    );
    return NextResponse.json({
      ok: true,
      conversationsScanned: report.conversationsScanned,
      noticesFound: report.noticesFound,
      ticked: report.ticked,
      ignored: report.ignored,
      tally: report.tally
    });
  } catch (error) {
    console.error("Paycom cron error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
