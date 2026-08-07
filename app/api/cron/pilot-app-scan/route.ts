import { NextResponse } from "next/server";
import { scanPilotApplications, SCAN_WINDOW_DAYS } from "@/lib/pilotapp/scan";
import { completePilotAppRun, recordPilotAppCrash } from "@/lib/pilotapp/complete-run";

export const dynamic = "force-dynamic";

/**
 * Nightly sweep of pilotapp@ for completed pilot applications, triggered by
 * Vercel Cron. Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
 *
 * This one APPLIES: it downloads each signed PDF, files it against the matching
 * candidate, and tags the thread. It does NOT archive anything — every thread is
 * left open, filed or not, because adding the application to Paycom is still a
 * manual step and the open thread is the only queue for it. Safe to run
 * unattended because the handler is idempotent (a PDF already filed is skipped by
 * Front message id, so re-seeing the same open thread every night costs a lookup
 * and nothing else), and it never guesses when a name matches two people. Use
 * POST /api/front/scan-pilot-apps (dry run by default) to see what it would do
 * first.
 *
 * createMissing: an applicant nobody in the system matches gets CREATED from
 * their own application rather than skipped with a "could not find the
 * candidate" note. The note was a dead end — it asked a human to add the person
 * and re-run, which is exactly the work this route can do itself, and until
 * someone did it the signed PDF was never downloaded at all.
 *
 * This only fires on a CLEAN no-match, and only when the application yields both
 * a name and an email. An ambiguous match — a name that resolves to two people —
 * still refuses to guess and still leaves the thread for a human, because a
 * duplicate person is a worse outcome than an unfiled document. Everything it
 * creates carries source "Pilot application (Adobe Sign)", which is the handle
 * for auditing or undoing a run.
 *
 * WHAT IT SEES: the last SCAN_WINDOW_DAYS days of Adobe Sign notices in EVERY
 * state, open or archived — not just open. Hannah archives a thread once the
 * application is in Paycom, and an is:open sweep could never see that thread
 * again, so anything archived before the scan reached it was missed permanently
 * and silently. The date window is what makes all-states affordable; see
 * windowedQuery in lib/pilotapp/scan.ts.
 *
 * EVERY RUN IS RECORDED, acting or not, to pilotapp/scan-runs — the quiet nights
 * are the point, because "it never fired" is otherwise indistinguishable from "it
 * fired and found nothing". A summary email goes to hrotasks@ only when there is
 * something to say.
 */
export async function GET(request: Request) {
  // FAIL CLOSED — this route writes to the live database and to Front, and the
  // deployment is public. A missing secret must never mean "let anyone in".
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

  if (!process.env.FRONT_API_TOKEN) {
    return NextResponse.json({ ok: false, message: "Front is not configured" });
  }

  const at = new Date();
  try {
    const report = await scanPilotApplications({
      apply: true,
      createMissing: true,
      windowDays: SCAN_WINDOW_DAYS
    });
    const created = report.createdCandidates ?? [];
    // Name every person this run created. An unattended job that adds people to
    // a shared database has to say who, or the only record of it is the rows
    // themselves.
    console.log(
      `Pilot app cron: ${report.conversationsScanned} threads, ${report.noticesFound} notices, ` +
        `${report.attached} filed, ${created.length} candidate(s) created (threads left open for Paycom)`,
      report.tally,
      created.length ? `created: ${created.join(", ")}` : ""
    );

    // Recording and reporting are shared with the manual button so the two
    // cannot drift — see lib/pilotapp/complete-run.ts. Neither can throw: the
    // filing is already done by this point.
    const { emailed, emailError } = await completePilotAppRun({ report, trigger: "cron", at });

    return NextResponse.json({
      ok: true,
      query: report.query,
      conversationsScanned: report.conversationsScanned,
      noticesFound: report.noticesFound,
      attached: report.attached,
      createdCandidates: created,
      emailed,
      ...(emailError ? { emailError } : {}),
      tally: report.tally
    });
  } catch (error) {
    console.error("Pilot app cron error:", error);
    const message = error instanceof Error ? error.message : String(error);
    await recordPilotAppCrash({ trigger: "cron", message, at });
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
