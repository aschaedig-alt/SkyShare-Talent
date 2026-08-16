import { NextResponse } from "next/server";
import { scanPaycomInbox } from "@/lib/paycom/scan";
import { scanGmailForOfferAcceptances } from "@/lib/paycom/gmail-scan";

export const dynamic = "force-dynamic";

/**
 * Nightly sweep of Paycom's notices, triggered by Vercel Cron.
 * Vercel sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
 *
 * TWO DOORS, ONE CRON. Most Paycom notices arrive in Front; "Offer Accepted" does
 * not — Paycom addresses it to one person's mailbox and copies no shared inbox —
 * so it is read from Gmail instead. They are the same subject matter on the same
 * cadence, so they share a cron rather than adding a fifth entry to vercel.json.
 * Each runs independently: neither being unavailable stops the other, because a
 * missing Front token and a missing Gmail grant are unrelated failures.
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

  // Settled, not raced: one door failing must not discard the other's work. A
  // Front outage should still let an accepted offer be ticked, and a mailbox
  // nobody has granted access to yet must not stop background checks.
  const [frontRes, gmailRes] = await Promise.allSettled([
    process.env.FRONT_API_TOKEN
      ? scanPaycomInbox({ apply: true })
      : Promise.reject(new Error("Front is not configured")),
    scanGmailForOfferAcceptances({ apply: true })
  ]);

  // Summarised into the Vercel logs so a silent failure is still visible.
  if (frontRes.status === "fulfilled") {
    const r = frontRes.value;
    console.log(
      `Paycom cron (Front): ${r.conversationsScanned} threads, ${r.noticesFound} notices, ${r.ticked} ticked, ${r.ignored} ignored`,
      r.tally
    );
  } else {
    console.error("Paycom cron (Front) error:", frontRes.reason);
  }

  if (gmailRes.status === "fulfilled") {
    const g = gmailRes.value;
    // A blocker is the expected state until the mailbox owner grants Gmail scope.
    // Logged as a warning rather than an error: it is a waiting-on-a-person state,
    // not a fault, but it must not be invisible either or the feature silently
    // does nothing for weeks.
    if (g.blocker) console.warn(`Paycom cron (Gmail): not checking ${g.mailbox} — ${g.blocker}`);
    else
      console.log(
        `Paycom cron (Gmail): ${g.messagesScanned} messages in ${g.mailbox}, ${g.noticesFound} notices, ${g.ticked} ticked`,
        g.tally
      );
  } else {
    console.error("Paycom cron (Gmail) error:", gmailRes.reason);
  }

  // Reports ok when EITHER door worked. Both failing is a real failure and should
  // surface as one rather than as a cheerful 200.
  const ok = frontRes.status === "fulfilled" || gmailRes.status === "fulfilled";
  return NextResponse.json(
    {
      ok,
      front:
        frontRes.status === "fulfilled"
          ? {
              conversationsScanned: frontRes.value.conversationsScanned,
              noticesFound: frontRes.value.noticesFound,
              ticked: frontRes.value.ticked,
              ignored: frontRes.value.ignored,
              tally: frontRes.value.tally
            }
          : { error: frontRes.reason instanceof Error ? frontRes.reason.message : String(frontRes.reason) },
      offerAcceptances:
        gmailRes.status === "fulfilled"
          ? {
              mailbox: gmailRes.value.mailbox,
              messagesScanned: gmailRes.value.messagesScanned,
              noticesFound: gmailRes.value.noticesFound,
              ticked: gmailRes.value.ticked,
              tally: gmailRes.value.tally,
              blocker: gmailRes.value.blocker
            }
          : { error: gmailRes.reason instanceof Error ? gmailRes.reason.message : String(gmailRes.reason) }
    },
    { status: ok ? 200 : 502 }
  );
}
