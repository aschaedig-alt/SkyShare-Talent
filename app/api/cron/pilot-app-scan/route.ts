import { NextResponse } from "next/server";
import { scanPilotApplications } from "@/lib/pilotapp/scan";

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

  try {
    const report = await scanPilotApplications({ apply: true, createMissing: true });
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
    return NextResponse.json({
      ok: true,
      conversationsScanned: report.conversationsScanned,
      noticesFound: report.noticesFound,
      attached: report.attached,
      createdCandidates: created,
      tally: report.tally
    });
  } catch (error) {
    console.error("Pilot app cron error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 502 }
    );
  }
}
