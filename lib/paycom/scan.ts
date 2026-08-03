import { iterateConversations, getMessages, addComment, addTags, resolveTagIdByNames, archiveConversation } from "@/lib/front";
import { processPaycomMessage, senderEmail, type PaycomNoticeResult } from "@/lib/paycom/notices";

/**
 * Sweep Front for Paycom notices and apply them to the onboarding checklist.
 *
 * Lives here rather than in the route because three callers need the same
 * behaviour: the manual endpoint, the nightly cron, and (once Front's admin sets
 * up a rule) a webhook. Only the doorbell differs — the logic must not.
 */

/**
 * Front tags applied to a thread once it has been handled, so the work is
 * searchable in Front rather than only visible as an internal comment.
 *
 * Matched by NAME, case-insensitively. Each entry lists the acceptable spellings
 * for ONE tag and the first that exists in Front wins — so a tag can be renamed
 * without silently switching the tagging off, which matters because these were
 * explicitly created as names that may change.
 *
 * Nesting is irrelevant to matching: these live under an "App Tags" parent in
 * Front, and a nested tag keeps its own plain name.
 *
 * A tag none of whose spellings exist is REPORTED, never thrown. The checklist
 * update is the work; a missing label must not cost us it.
 */
export const TAGS = {
  /** On every thread the automation acted on — one search shows all of its work. */
  automated: ["automated", "[Automated]"],
  /** Step 2: the candidate filled in their details. */
  infoSubmitted: ["submitted background check"],
  /** Step 3: the check came back clear. */
  checkComplete: ["background check complete"],
  /** Seen but NOT actioned — an unknown name, or wording we could not read. */
  needsReview: ["needs review", "talent-ops needs review"]
} as const;

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
  /** Threads archived because they were fully handled. */
  archived: number;
  tally: Record<string, number>;
  results: ScanRow[];
  /** Only when asked for: what the Front search really returned. */
  sample?: Array<{ subject: string; from: string; inbound: boolean }>;
  /** Tag names the scan wanted to apply but could not find in Front. */
  missingTags?: string[];
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

/**
 * Handle ONE conversation, for the webhook.
 *
 * Same logic as a scan, minus the searching — Front has already told us which
 * thread changed, so re-scanning the inbox to find it would be daft. Idempotent
 * exactly like the scan: an already-ticked step is left alone, so a webhook that
 * fires twice, or fires on a thread the nightly cron already handled, costs
 * nothing.
 */
export async function processConversationById(
  conversationId: string,
  opts: { apply?: boolean } = {}
): Promise<ScanRow[]> {
  const apply = opts.apply === true;
  const out: ScanRow[] = [];
  // Archive the thread once it has nothing left to give — but ONLY if nothing on
  // it still needs a person. An archived thread is out of sight, so anything we
  // could not action has to stay open. Decided across the whole conversation and
  // applied after the loop, since a thread can hold several notices.
  let anyHandled = false;
  let anyNeedsHuman = false;

  const messages = await getMessages(conversationId);
  for (const message of messages) {
    if (message.is_inbound === false) continue;
    const result = await processPaycomMessage(message, { dryRun: !apply });
    if (result.outcome === "not-a-paycom-notice") continue;
    out.push({ conversationId, ...result });

    // "ticked" = we just actioned it; "already-done" = a previous run did. Either
    // way the notice has been dealt with. Everything else wants a human.
    if (result.outcome === "ticked" || result.outcome === "already-done") anyHandled = true;
    else if (result.outcome !== "would-tick") anyNeedsHuman = true;

    if (!apply) continue;

    if (result.outcome === "ticked") {
      try {
        const via = result.matchedBy === "nickname" ? ` (Paycom addressed them as "${result.personName}")` : "";
        await addComment(
          conversationId,
          `SkyShare Journey: marked "${result.detail}" complete for ${result.hireName}${via} from this Paycom notice.`
        );
      } catch {
        /* the checklist is already updated — a failed note must not fail this */
      }
    }

    const wanted: readonly (readonly string[])[] =
      result.outcome === "ticked"
        ? [
            TAGS.automated,
            ...(result.kind === "BG_INFO_SUBMITTED" ? [TAGS.infoSubmitted] : []),
            ...(result.kind === "BG_CHECK_COMPLETE" ? [TAGS.checkComplete] : [])
          ]
        : result.outcome === "no-match" ||
            result.outcome === "ambiguous-match" ||
            result.outcome === "no-name-found" ||
            result.outcome === "unrecognised-subject"
          ? [TAGS.needsReview]
          : [];
    if (wanted.length) {
      try {
        const ids: string[] = [];
        for (const candidates of wanted) {
          const id = await resolveTagIdByNames([...candidates]);
          if (id) ids.push(id);
        }
        await addTags(conversationId, ids);
      } catch {
        /* a tag is a label, not the work */
      }
    }
  }

  if (apply && anyHandled && !anyNeedsHuman) {
    try {
      await archiveConversation(conversationId);
    } catch {
      /* the checklist is already updated — a failed archive must not undo that */
    }
  }

  return out;
}

/** Throws if Front can't be read — callers decide how to report that. */
export async function scanPaycomInbox(opts: ScanOptions = {}): Promise<ScanReport> {
  const apply = opts.apply === true;
  const query = opts.query?.trim() || DEFAULT_QUERY;
  const maxConversations = opts.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;

  const results: ScanRow[] = [];
  // Tag names we wanted but that do not exist in Front yet — reported so a
  // missing tag is visible rather than silently doing nothing.
  const missingTags: string[] = [];
  const sample: ScanReport["sample"] = [];
  let conversationsScanned = 0;
  let archived = 0;

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
            `SkyShare Journey: marked "${result.detail}" complete for ${result.hireName}${via} from this Paycom notice.`
          );
        } catch {
          /* the checklist is already updated — a failed note must not fail the scan */
        }
      }

      // Tag the thread so this is searchable in Front, not just readable as a
      // comment on one conversation. Only on a real run: a dry run must stay
      // read-only, tags included.
      if (apply) {
        // Each entry is a list of acceptable spellings for ONE tag; the first that
        // exists in Front wins, so renaming a tag doesn't silently stop tagging.
        const wanted: readonly (readonly string[])[] =
          result.outcome === "ticked"
            ? [
                TAGS.automated,
                ...(result.kind === "BG_INFO_SUBMITTED" ? [TAGS.infoSubmitted] : []),
                ...(result.kind === "BG_CHECK_COMPLETE" ? [TAGS.checkComplete] : [])
              ]
            : result.outcome === "no-match" ||
                result.outcome === "ambiguous-match" ||
                result.outcome === "no-name-found" ||
                result.outcome === "unrecognised-subject"
              ? // Seen, understood as Paycom mail, but nothing was ticked. Tagging
                // these turns Front itself into the follow-up list.
                [TAGS.needsReview]
              : [];

        if (wanted.length) {
          try {
            const ids: string[] = [];
            for (const candidates of wanted) {
              const id = await resolveTagIdByNames([...candidates]);
              if (id) ids.push(id);
              else missingTags.push(candidates[0]);
            }
            await addTags(conversation.id, ids);
          } catch {
            /* a tag is a label, not the work — never let it fail the scan */
          }
        }
      }
    }

    // Same rule as the single-conversation path: archive a thread only once it
    // has been handled AND nothing on it still needs a person. Computed from the
    // rows this conversation produced, so a thread carrying both a ticked notice
    // and an unreadable one stays open.
    if (apply) {
      const rows = results.filter((r) => r.conversationId === conversation.id);
      const handled = rows.some((r) => r.outcome === "ticked" || r.outcome === "already-done");
      const needsHuman = rows.some((r) => r.outcome !== "ticked" && r.outcome !== "already-done" && r.outcome !== "would-tick");
      if (handled && !needsHuman) {
        try {
          await archiveConversation(conversation.id);
          archived += 1;
        } catch {
          /* the checklist is already updated — a failed archive must not undo that */
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
    archived,
    tally,
    results,
    ...(missingTags.length ? { missingTags: [...new Set(missingTags)] } : {}),
    ...(opts.debug ? { sample } : {})
  };
}
