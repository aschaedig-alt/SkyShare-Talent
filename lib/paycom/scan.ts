import { iterateConversations, getMessages, addComment, addTags, resolveTagIdByNames, archiveConversation } from "@/lib/front";
import { processPaycomMessage, senderEmail, type PaycomNoticeResult } from "@/lib/paycom/notices";
import { ONBOARDING_TASKS } from "@/lib/onboarding/tasks";
import { JOURNEY_TAGS } from "@/lib/front/tags";

/**
 * Sweep Front for Paycom notices and apply them to the onboarding checklist.
 *
 * Lives here rather than in the route because three callers need the same
 * behaviour: the manual endpoint, the nightly cron, and (once Front's admin sets
 * up a rule) a webhook. Only the doorbell differs — the logic must not.
 *
 * Handles background-check progress and offer acceptance; see lib/paycom/notices.ts
 * for the notice definitions and the wording traps each one guards against.
 *
 * HOW "OFFER ACCEPTED" REACHES US (Aug 16 2026). Paycom addresses that notice to
 * ONE person, and it lands in that teammate's PRIVATE Front inbox. A company API
 * token cannot read a private inbox at all — Front answers 403 to
 * /teammates/{id}/conversations, by design, with no setting that changes it — so
 * the sweep could never see one directly. A Front rule now forwards a copy into
 * the shared HR Onboarding inbox, which is what DEFAULT_QUERIES' second entry
 * looks for. A forwarded copy is sent BY a teammate, so it carries neither Paycom
 * sender and needs the forwarded door in lib/paycom/notices.ts (paycomSource).
 */

/**
 * Front tags applied to a thread once it has been handled, so the work is
 * searchable in Front rather than only visible as an internal comment.
 *
 * The NAMES now come from lib/front/tags.ts — one list, checked against the real
 * account, shared with the pilot-application and travel sweeps. This file used to
 * carry its own copy and three of its five entries were silently dead after the
 * tags were renamed on Aug 16: a name that does not exist resolves to null and
 * the sweep carries on untagged, so nothing failed and nothing was tagged.
 *
 * Nesting is irrelevant to matching: these live under a "SkyShare Journey" parent
 * in Front, and a nested tag keeps its own plain name.
 *
 * A tag that does not exist is REPORTED (see missingTags), never thrown. The
 * checklist update is the work; a missing label must not cost us it.
 */
export const TAGS = {
  automated: [JOURNEY_TAGS.automated],
  infoSubmitted: [JOURNEY_TAGS.bgInfoSubmitted],
  checkComplete: [JOURNEY_TAGS.bgCheckComplete],
  offerAccepted: [JOURNEY_TAGS.offerAccepted],
  needsReview: [JOURNEY_TAGS.needsReview]
} as const;

/**
 * BARE ADDRESS TERMS, NOT from: CLAUSES — and two searches merged in our own
 * code rather than one OR'd query. Both are correctness requirements.
 *
 * WHY BARE TERMS. A Front rule now routes Paycom mail from a teammate's private
 * inbox into the shared HR Onboarding one. Whether the copy that lands there
 * keeps Paycom as its sender or is rewritten to the teammate's address depends on
 * how Front implements the action, and the subject may or may not gain a "Fwd:".
 * Neither is knowable in advance. What IS reliable is that the Paycom address
 * appears somewhere — as the sender if the conversation was moved, in the quoted
 * header block if it was forwarded.
 *
 * Front's search matches BODIES as well as headers, so a bare address term
 * catches both. Measured over a 30-day window on 2026-08-16, it is a strict
 * superset of the from: search it replaces:
 *
 *   from:systemmessage@      -> 65      bare "systemmessage@..."      -> 78
 *   from:employmentscreening@-> 10      bare "employmentscreening@..." -> 12
 *   in from: but NOT in bare -> 0       (both senders — nothing is lost)
 *
 * WHY NOT ONE QUERY. Front's OR silently drops terms. Same window:
 *
 *   A from:employmentscreening@ = 10, B from:systemmessage@ = 64, C to:hrotasks@ = 131
 *   true union A|B|C computed client-side = 131
 *   "A OR B" -> 74 correct · "B OR C" -> 64 WRONG · "A OR B OR C" -> 74 WRONG
 *
 * The to: clause vanished twice with no error — a quiet subset, which is the
 * worst failure available to a sweep because it looks exactly like a quiet week.
 * Parentheses are no escape either ("A OR (B C)" returns 0). So each query below
 * runs on its own and the union is taken where a union is really a union.
 */
export const DEFAULT_QUERIES = [
  // Anything mentioning Paycom's notification sender, anywhere: the offer
  // notices, and every routed copy of one whatever its outer sender turned out
  // to be. Also drags in interview invites and task checklists, which the
  // classifier drops as not-actionable — a fair price for not having to predict
  // what a Front rule does to a header.
  "systemmessage@paycomonline.com",
  // The background-check sender, same reasoning.
  "employmentscreening@paycomonline.com"
] as const;

/** For callers wanting a single string; the sweep itself uses DEFAULT_QUERIES. */
export const DEFAULT_QUERY = DEFAULT_QUERIES[0];

/**
 * How far back a routine sweep looks.
 *
 * The bare address terms match far more than the from: clauses they replaced —
 * body mentions included — so without a date bound the sweep walks back through
 * years of archived mail. A dry run on 2026-08-16 did exactly that: 262 threads,
 * 151 notices, and 39 "no-match" rows for people Paycom named years ago who are
 * not on the roster now. Every one of those would have been tagged "needs
 * review" in Front on a real run, churning archived threads nobody is looking at
 * and burying the handful that matter.
 *
 * A window fixes it at the source, the same way it did for the pilot-application
 * sweep: bound by TIME rather than by state or count, so the set stays small and
 * current without anything being silently cut off the end of a cap.
 *
 * after:<unix> is the one date filter Front's DSL was confirmed to accept.
 */
export const SCAN_WINDOW_DAYS = 30;

/** The default queries, bounded to the last N days. */
export function windowedQueries(days: number = SCAN_WINDOW_DAYS, now: Date = new Date()): string[] {
  const after = Math.floor(now.getTime() / 1000) - days * 86400;
  return DEFAULT_QUERIES.map((q) => `${q} after:${after}`);
}

/**
 * Raised from 40 when the sweep grew to cover systemmessage@ as well.
 *
 * A reach change, not a tuning preference. On the old single-sender query 40
 * threads was months of background-check mail. Measured live, the Paycom senders
 * together run ~110 threads a month and roughly 85% of what comes back is
 * systemmessage@ traffic the classifier drops — so 40 had silently become about
 * eleven days, and a background-check notice older than that would have fallen
 * off the end of a sweep that used to catch it.
 */
export const DEFAULT_MAX_CONVERSATIONS = 150;
export const HARD_MAX_CONVERSATIONS = 500;

export type ScanRow = PaycomNoticeResult & { conversationId: string };

export type ScanReport = {
  query: string;
  conversationsScanned: number;
  noticesFound: number;
  /** How many checklist steps actually moved — 0 on a dry run, by definition. */
  ticked: number;
  /** Threads archived because they were fully handled. */
  archived: number;
  /**
   * Paycom mail read, recognised, and deliberately skipped — interview
   * invitations, task notifications, the pending-offer notices. A count rather
   * than rows: since the sweep widened to systemmessage@ these outnumber real
   * notices about six to one, and a report where the signal is 15% of the lines
   * is a report nobody reads. The number still proves the sweep saw them.
   */
  ignored: number;
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
  /** Days back for the default window. Ignored when an explicit query is given. */
  windowDays?: number;
  debug?: boolean;
};

/** Clamp a caller-supplied conversation limit into something sane. */
export function resolveLimit(requested: unknown): number {
  const n = Number(requested);
  return Number.isFinite(n) && n > 0 ? Math.min(n, HARD_MAX_CONVERSATIONS) : DEFAULT_MAX_CONVERSATIONS;
}

/**
 * The note left on a handled thread.
 *
 * One function because the scan and the webhook both leave this note and had
 * already drifted into two near-identical string literals — the kind of pair
 * where a fix lands in one and not the other.
 *
 * Says the checklist item's REAL label, not its key: whoever reads this in Front
 * is a recruiter, and "candidate_signed" tells them nothing while "Candidate
 * signed offer letter" is the row they can go and look at.
 */
function noticeComment(result: ScanRow): string {
  const label = ONBOARDING_TASKS.find((t) => t.key === result.detail)?.label ?? result.detail;
  const via = result.matchedBy === "nickname" ? ` (Paycom addressed them as "${result.personName}")` : "";
  // Only the offer notice carries a position, and it is worth repeating: it is the
  // one detail that makes a wrong-person tick obvious to somebody reading the
  // thread, which a bare name never does.
  const forRole = result.position ? ` — the offer was for ${result.position}` : "";
  return `SkyShare Journey: marked "${label}" complete for ${result.hireName}${via} from this Paycom notice${forRole}.`;
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
    // Recognised-and-skipped must not count as "needs a human" below, or a thread
    // carrying one alongside a real notice would never archive.
    if (result.outcome === "not-actionable") continue;
    out.push({ conversationId, ...result });

    // "ticked" = we just actioned it; "already-done" = a previous run did. Either
    // way the notice has been dealt with. Everything else wants a human.
    if (result.outcome === "ticked" || result.outcome === "already-done") anyHandled = true;
    else if (result.outcome !== "would-tick") anyNeedsHuman = true;

    if (!apply) continue;

    if (result.outcome === "ticked") {
      try {
        await addComment(conversationId, noticeComment({ conversationId, ...result }));
      } catch {
        /* the checklist is already updated — a failed note must not fail this */
      }
    }

    const wanted: readonly (readonly string[])[] =
      result.outcome === "ticked"
        ? [
            TAGS.automated,
            ...(result.kind === "BG_INFO_SUBMITTED" ? [TAGS.infoSubmitted] : []),
            ...(result.kind === "BG_CHECK_COMPLETE" ? [TAGS.checkComplete] : []),
            ...(result.kind === "OFFER_ACCEPTED" ? [TAGS.offerAccepted] : [])
          ]
        : result.outcome === "no-match" ||
            result.outcome === "ambiguous-match" ||
            result.outcome === "no-name-found" ||
            result.outcome === "unrecognised-subject"
          ? // [Automated] goes on here too. The app READ this thread and made a
            // decision about it — that it could not place it — which is exactly
            // as much an automated touch as a successful tick. Without it, the
            // threads the automation understood least were the ones carrying no
            // sign it had been involved.
            [TAGS.automated, TAGS.needsReview]
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
  // An explicit ?q= wins and runs alone — unbounded, since a caller passing one
  // has said what they want. Otherwise every default query runs, bounded to the
  // window. See DEFAULT_QUERIES for why this cannot be one OR'd query.
  const queries = opts.query?.trim() ? [opts.query.trim()] : windowedQueries(opts.windowDays);
  const maxConversations = opts.maxConversations ?? DEFAULT_MAX_CONVERSATIONS;

  const results: ScanRow[] = [];
  // Tag names we wanted but that do not exist in Front yet — reported so a
  // missing tag is visible rather than silently doing nothing.
  const missingTags: string[] = [];
  const sample: ScanReport["sample"] = [];
  let conversationsScanned = 0;
  let archived = 0;
  let ignored = 0;

  // The union across queries. The defaults deliberately overlap — a Paycom notice
  // forwarded into hrotasks@ can match both — and handling a conversation twice
  // would double every count and post the note on the thread a second time.
  const seen = new Set<string>();

  for (const query of queries) {
  // THE CAP IS PER QUERY, NOT A SHARED POOL. Shared, it silently disabled the
  // second query outright: the first returns ~150 threads a month on its own, so
  // it consumed the whole budget and the forwarded-copy search never ran once —
  // a dry run showed 150 scanned, 0 offer notices, and no indication that half
  // the sweep had been skipped. Per-query costs at most one extra cap's worth of
  // requests and cannot starve a query that way.
  let scannedThisQuery = 0;
  for await (const conversation of iterateConversations(query)) {
    if (scannedThisQuery >= maxConversations) break;
    scannedThisQuery += 1;
    if (seen.has(conversation.id)) continue;
    seen.add(conversation.id);
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
      // Outbound messages are NO LONGER skipped here. Front can mark a
      // rule-forwarded notice as outbound (a teammate's channel sent it), and
      // skipping those would ignore the only copy of a notice that reaches a
      // shared inbox no other way. processPaycomMessage makes the call now: it
      // admits an outbound message only through the forwarded door, and still
      // refuses our own replies (bareSubject does not strip "Re:").

      const result = await processPaycomMessage(message, { dryRun: !apply });
      // Drop anything that isn't a Paycom notice at all, so the report stays readable.
      if (result.outcome === "not-a-paycom-notice") continue;
      // Same for Paycom mail we knowingly skip — counted, not listed. See
      // ScanReport.ignored.
      if (result.outcome === "not-actionable") {
        ignored += 1;
        continue;
      }
      results.push({ conversationId: conversation.id, ...result });

      // Leave a note on the thread, but only when we actually changed something.
      if (result.outcome === "ticked") {
        try {
          await addComment(conversation.id, noticeComment({ conversationId: conversation.id, ...result }));
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
                ...(result.kind === "BG_CHECK_COMPLETE" ? [TAGS.checkComplete] : []),
                ...(result.kind === "OFFER_ACCEPTED" ? [TAGS.offerAccepted] : [])
              ]
            : result.outcome === "no-match" ||
                result.outcome === "ambiguous-match" ||
                result.outcome === "no-name-found" ||
                result.outcome === "unrecognised-subject"
              ? // Seen, understood as Paycom mail, but nothing was ticked. Tagging
                // these turns Front itself into the follow-up list.
                //
                // [automated] belongs here too, and used to be missing on this
                // path while the webhook path applied it — so the threads the
                // automation understood LEAST were the only ones carrying no sign
                // it had been involved. Reading a thread and deciding it cannot be
                // placed is as much an automated touch as a successful tick.
                [TAGS.automated, TAGS.needsReview]
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
  }

  const tally = results.reduce<Record<string, number>>((acc, r) => {
    acc[r.outcome] = (acc[r.outcome] ?? 0) + 1;
    return acc;
  }, {});

  return {
    query: queries.join("  ||  "),
    conversationsScanned,
    noticesFound: results.length,
    ticked: results.filter((r) => r.outcome === "ticked").length,
    archived,
    ignored,
    tally,
    results,
    ...(missingTags.length ? { missingTags: [...new Set(missingTags)] } : {}),
    ...(opts.debug ? { sample } : {})
  };
}
