import type { gmail_v1 } from "googleapis";
import { getUserGmail, OFFER_NOTICE_MAILBOX } from "@/lib/google/user-gmail";
import { processPaycomMessage, type PaycomNoticeResult } from "@/lib/paycom/notices";
import type { FrontMessage } from "@/lib/front";

/**
 * Sweep GMAIL for Paycom's "Offer Accepted" notices and tick the matching
 * checklist step.
 *
 * The twin of lib/paycom/scan.ts, and deliberately thin: it is a DIFFERENT DOOR
 * onto the same logic. Every decision about what a notice means, who it belongs
 * to and what gets ticked lives in processPaycomMessage, so a Gmail-sourced
 * notice and a Front-sourced one cannot diverge — which matters because if the
 * notice is ever also routed into Front, both paths must reach the same answer
 * and the second one must be a harmless no-op.
 *
 * WHY GMAIL AND NOT FRONT. Paycom addresses this notice to one person, and it is
 * not delivered to any Front inbox. See lib/google/user-gmail.ts for the evidence
 * and for the scope trade that reading it here involves.
 *
 * IDEMPOTENT, and it has to be: Gmail is read-only here, so unlike the Front
 * sweep there is no tag or archive to mark a notice as handled. Re-running is
 * safe because the checklist itself is the record — processPaycomMessage reports
 * "already-done" and changes nothing when the step is already ticked. That is the
 * same property that lets the nightly cron and the button both run freely.
 *
 * NOTHING IS EVER WRITTEN TO GMAIL. The scope cannot; see user-gmail.ts.
 */

/**
 * Gmail's search DSL — not Front's. Quoted subject works here (it does not in
 * Front), which is what lets this be precise rather than a body-wide term match.
 *
 * Kept narrow on purpose. The scope grants the whole mailbox, so the query is the
 * thing that keeps this sweep to the mail it actually needs: one sender, one
 * subject. Widening it widens what the app reads.
 */
export const GMAIL_QUERY = 'from:systemmessage@paycomonline.com subject:"Offer Accepted"';

/** How far back a routine sweep looks. */
export const DEFAULT_WINDOW_DAYS = 30;

/** Ceiling for one sweep, so a query gone wrong is bounded rather than unlimited. */
export const HARD_MAX_MESSAGES = 200;

export type GmailScanRow = PaycomNoticeResult & { messageId: string; receivedAt: string | null };

export type GmailScanReport = {
  mailbox: string;
  query: string;
  messagesScanned: number;
  noticesFound: number;
  /** Checklist steps that actually moved — 0 on a dry run, by definition. */
  ticked: number;
  tally: Record<string, number>;
  results: GmailScanRow[];
  /** Why there is no client, when there isn't one. Null on success. */
  blocker: string | null;
};

export type GmailScanOptions = {
  /** Write. Leave false and nothing is ticked — the safe default everywhere. */
  apply?: boolean;
  /** Mailbox to read. Defaults to wherever Paycom sends the notices. */
  mailbox?: string;
  windowDays?: number;
  maxMessages?: number;
};

/** Header lookup is case-insensitive — Gmail does not normalise these. */
function header(payload: gmail_v1.Schema$MessagePart | undefined, name: string): string {
  const hit = payload?.headers?.find((h) => (h.name ?? "").toLowerCase() === name.toLowerCase());
  return hit?.value ?? "";
}

/**
 * The plain text of a Gmail message.
 *
 * Walks the MIME tree rather than trusting payload.body, because a Paycom notice
 * arrives as multipart/alternative and the top-level body is empty. Prefers
 * text/plain and falls back to stripping the HTML part — the same fallback
 * messageText() applies to Front messages, so both doors feed the parser
 * comparable text.
 */
function messageText(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  const decode = (data: string | null | undefined): string =>
    data ? Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8") : "";

  const collect = (part: gmail_v1.Schema$MessagePart, mime: string): string[] => {
    const out: string[] = [];
    if (part.mimeType === mime && part.body?.data) out.push(decode(part.body.data));
    for (const child of part.parts ?? []) out.push(...collect(child, mime));
    return out;
  };

  const plain = collect(payload, "text/plain").join("\n").trim();
  if (plain) return plain;

  const html = collect(payload, "text/html").join("\n");
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Present a Gmail message in the shape processPaycomMessage expects.
 *
 * An adapter rather than a second parser. The classifier reads the sender off
 * recipients[role=from] because that is where Front puts it, so the Gmail From
 * header is mapped onto the same field — and the sender check (which is what
 * refuses a spoofed notice) then works identically on both doors.
 *
 * The From header arrives as 'Paycom <systemmessage@paycomonline.com>', so the
 * bare address is extracted; the regex the classifier uses is anchored on the
 * domain ending and a display name would defeat it.
 *
 * Exported only so it can be tested against a real Gmail payload without a live
 * API call — this is the half of the Gmail path that cannot be exercised locally
 * (the OAuth credentials live on Vercel), so it is the half most worth pinning
 * down with a test.
 */
export function toFrontMessage(message: gmail_v1.Schema$Message): FrontMessage {
  const payload = message.payload ?? undefined;
  const rawFrom = header(payload, "From");
  const address = rawFrom.match(/<([^>]+)>/)?.[1] ?? rawFrom;
  return {
    id: message.id ?? "",
    is_inbound: true,
    subject: header(payload, "Subject"),
    text: messageText(payload),
    recipients: [
      { handle: address.trim(), role: "from" },
      { handle: header(payload, "To").trim(), role: "to" }
    ]
  } as FrontMessage;
}

/**
 * Read the mailbox and apply what it finds.
 *
 * Returns a report with a `blocker` rather than throwing when Gmail cannot be
 * reached, so a caller can tell "nothing new" apart from "the app has no access"
 * — a distinction that matters here, because a missing scope and a quiet week
 * look identical in a bare count and only one of them needs somebody to act.
 */
export async function scanGmailForOfferAcceptances(opts: GmailScanOptions = {}): Promise<GmailScanReport> {
  const apply = opts.apply === true;
  const mailbox = opts.mailbox?.trim() || OFFER_NOTICE_MAILBOX;
  const windowDays = opts.windowDays ?? DEFAULT_WINDOW_DAYS;
  const maxMessages = Math.min(opts.maxMessages ?? HARD_MAX_MESSAGES, HARD_MAX_MESSAGES);
  const query = `${GMAIL_QUERY} newer_than:${windowDays}d`;

  const empty = (blocker: string | null): GmailScanReport => ({
    mailbox,
    query,
    messagesScanned: 0,
    noticesFound: 0,
    ticked: 0,
    tally: {},
    results: [],
    blocker
  });

  const access = await getUserGmail(mailbox);
  if (!access.client) return empty(access.blocker);

  const listed = await access.client.users.messages.list({
    userId: "me",
    q: query,
    maxResults: maxMessages
  });

  const ids = (listed.data.messages ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));

  const results: GmailScanRow[] = [];
  for (const id of ids) {
    const full = await access.client.users.messages.get({ userId: "me", id, format: "full" });
    const result = await processPaycomMessage(toFrontMessage(full.data), { dryRun: !apply });
    // The query already pins sender and subject, so anything landing here should
    // classify — but a notice we cannot read is exactly what must stay visible.
    if (result.outcome === "not-a-paycom-notice" || result.outcome === "not-actionable") continue;
    results.push({
      ...result,
      messageId: id,
      receivedAt: full.data.internalDate ? new Date(Number(full.data.internalDate)).toISOString() : null
    });
  }

  const tally: Record<string, number> = {};
  for (const r of results) tally[r.outcome] = (tally[r.outcome] ?? 0) + 1;

  return {
    mailbox,
    query,
    messagesScanned: ids.length,
    noticesFound: results.length,
    ticked: results.filter((r) => r.outcome === "ticked").length,
    tally,
    results,
    blocker: null
  };
}
