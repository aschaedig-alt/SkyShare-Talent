import { NextResponse } from "next/server";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { iterateConversations, getMessages, addComment } from "@/lib/front";
import { processPaycomMessage, senderEmail, type PaycomNoticeResult } from "@/lib/paycom/notices";

/**
 * Pull Paycom's automated notices out of Front and turn them into onboarding
 * progress (today: background check started).
 *
 * Poll-based on purpose — Front webhooks need a rule configured on Front's side,
 * which is a separate conversation with the Front admin. Nothing here depends on
 * that, so this works now and a webhook can call the same handler later.
 *
 * SAFE BY DEFAULT: this is a DRY RUN unless you pass ?apply=1. A dry run reports
 * exactly what it would tick and writes nothing.
 *
 * Auth: a signed-in user with candidates:write, or a scheduled caller presenting
 * x-cron-secret matching CRON_SECRET (only if that env var is set).
 */

const DEFAULT_QUERY = "from:employmentscreening@paycomonline.com";
const DEFAULT_MAX_CONVERSATIONS = 40;
const HARD_MAX_CONVERSATIONS = 300;

export async function POST(request: Request) {
  const url = new URL(request.url);
  const apply = url.searchParams.get("apply") === "1";
  const query = url.searchParams.get("q")?.trim() || DEFAULT_QUERY;
  // A routine poll only needs the recent threads; ?limit= lets a backfill reach
  // further without turning every scheduled run into a full-history crawl.
  const requestedLimit = Number(url.searchParams.get("limit"));
  const maxConversations =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, HARD_MAX_CONVERSATIONS)
      : DEFAULT_MAX_CONVERSATIONS;

  // Either a real user with write access, or a scheduled call with the shared secret.
  const cronSecret = process.env.CRON_SECRET;
  const viaCron = Boolean(cronSecret && request.headers.get("x-cron-secret") === cronSecret);
  if (!viaCron) {
    const auth = await requireApiPermission("candidates:write");
    if (!auth.ok) {
      return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
    }
  }

  if (!process.env.FRONT_API_TOKEN) {
    return NextResponse.json(
      { message: "FRONT_API_TOKEN is not configured — cannot read the inbox." },
      { status: 503 }
    );
  }

  const results: Array<PaycomNoticeResult & { conversationId: string }> = [];
  let conversationsScanned = 0;
  // ?debug=1 reports what the search actually returned — the fastest way to tell a
  // wrong Front search query apart from a genuinely empty inbox.
  const debug = url.searchParams.get("debug") === "1";
  const sample: Array<{ subject: string; from: string; inbound: boolean }> = [];

  try {
    for await (const conversation of iterateConversations(query)) {
      if (conversationsScanned >= maxConversations) break;
      conversationsScanned += 1;

      const messages = await getMessages(conversation.id);
      for (const message of messages) {
        if (debug && sample.length < 15) {
          sample.push({
            subject: typeof message.subject === "string" ? message.subject : "",
            from: senderEmail(message) || "(none)",
            inbound: message.is_inbound !== false
          });
        }
        if (message.is_inbound === false) continue;
        const result = await processPaycomMessage(message, { dryRun: !apply });
        // Ignore anything that isn't a Paycom notice at all — keeps the report clean.
        if (result.outcome === "not-a-paycom-notice") continue;
        results.push({ conversationId: conversation.id, ...result });

        // Leave an audit note on the thread, but only when we actually changed something.
        if (result.outcome === "ticked") {
          try {
            // Name the Paycom spelling when it differs, so whoever reads the thread
            // can see which person we decided this was.
            const via =
              result.matchedBy === "nickname" ? ` (Paycom addressed them as "${result.personName}")` : "";
            await addComment(
              conversation.id,
              `SkyShare Talent-Ops: marked "${result.detail}" complete for ${result.hireName}${via} from this Paycom notice.`
            );
          } catch {
            /* the checklist is already updated — a failed note must not fail the scan */
          }
        }
      }
    }
  } catch (error) {
    console.error("Paycom scan error:", error);
    return NextResponse.json(
      {
        message: "Could not read from Front.",
        detail: error instanceof Error ? error.message : String(error),
        hint: `Search query used: ${query}. Pass ?q=<front search> to adjust it.`,
        conversationsScanned,
        results
      },
      { status: 502 }
    );
  }

  const tally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});

  return NextResponse.json({
    ok: true,
    mode: apply ? "APPLIED" : "DRY RUN (pass ?apply=1 to write)",
    query,
    conversationsScanned,
    noticesFound: results.length,
    tally,
    results,
    ...(debug ? { sample } : {})
  });
}
