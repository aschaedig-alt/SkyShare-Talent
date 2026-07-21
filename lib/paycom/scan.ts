import { iterateConversations, getMessages, addComment } from "@/lib/front";
import { processPaycomMessage, senderEmail, type PaycomNoticeResult } from "@/lib/paycom/notices";

/**
 * Sweep Front for Paycom notices and apply them to the onboarding checklist.
 *
 * Lives here rather than in the route because three callers need the same
 * behaviour: the manual endpoint, the nightly cron, and (once Front's admin sets
 * up a rule) a webhook. Only the doorbell differs — the logic must not.
 */

export const DEFAULT_QUERY = "from:employmentscreening@paycomonline.com";
export const DEFAULT_MAX_CONVERSATIONS = 40;
export const HARD_MAX_CONVERSATIONS = 300;

export type ScanRow = PaycomNoticeResult & { conversationId: string };

export type ScanReport = {
  query: string;
  conversationsScanned: number;
  noticesFound: number;
  /** How many checklist steps actually moved — 0 on a dry run, by definition. */
  ticked: number;
  tally: Record<string, number>;
  results: ScanRow[];
  /** Only when asked for: what the Front search really returned. */
  sample?: Array<{ subject: string; from: string; inbound: boolean }>;
};

export type ScanOptions = {
  /** Write. Leave false and nothing is changed — that is the safe default everywhere. */
  apply?: boolean;
  query?: string;
  maxConversations?: number;
  debug?: boolean;
};

/** Clamp a caller-supplied conversation limit into something sane. */
export function resolveLimit(requested: unknown): number {
  const n = Number(requested);
  return Number.isFinite(n) && n > 0 ? Math.min(n, HARD_MAX_CONVERSATIONS) : DEFAULT_MAX_CONVERSATIONS;
}

/** Throws if Front can't be read — callers decide how to report that. */
export async function scanPaycomInbox(opts: ScanOptions = {}): Promise<ScanReport> {
  const apply = opts.apply === true;
  const query = opts.query?.trim() || DEFAULT_QUERY;
  const maxConversations = opts.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;

  const results: ScanRow[] = [];
  const sample: ScanReport["sample"] = [];
  let conversationsScanned = 0;

  for await (const conversation of iterateConversations(query)) {
    if (conversationsScanned >= maxConversations) break;
    conversationsScanned += 1;

    const messages = await getMessages(conversation.id);
    for (const message of messages) {
      if (opts.debug && sample.length < 15) {
        sample.push({
          subject: typeof message.subject === "string" ? message.subject : "",
          from: senderEmail(message) || "(none)",
          inbound: message.is_inbound !== false
        });
      }
      // Our own outbound replies can quote the notice back; only the inbound
      // message from Paycom counts.
      if (message.is_inbound === false) continue;

      const result = await processPaycomMessage(message, { dryRun: !apply });
      // Drop anything that isn't a Paycom notice at all, so the report stays readable.
      if (result.outcome === "not-a-paycom-notice") continue;
      results.push({ conversationId: conversation.id, ...result });

      // Leave a note on the thread, but only when we actually changed something.
      if (result.outcome === "ticked") {
        try {
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

  const tally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});

  return {
    query,
    conversationsScanned,
    noticesFound: results.length,
    ticked: results.filter((r) => r.outcome === "ticked").length,
    tally,
    results,
    ...(opts.debug ? { sample } : {})
  };
}
