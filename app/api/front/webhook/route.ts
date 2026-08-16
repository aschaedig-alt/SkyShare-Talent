import { NextResponse, after } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { processConversationById } from "@/lib/paycom/scan";
import { processTravelConversation } from "@/lib/travel/from-email";
import { processMentionReply } from "@/lib/notifications/process-mention-reply";
import { getConversationTagNames } from "@/lib/front";
import { JOURNEY_TAGS } from "@/lib/front/tags";

export const dynamic = "force-dynamic";

/**
 * Front calls this the moment a Paycom notice lands, instead of us waiting for
 * the nightly sweep.
 *
 * The rule that drives it is configured in Front by an admin — our API token
 * lacks rules:read, so we can neither create nor inspect it, and a test delivery
 * is the only way to confirm it is set up correctly.
 *
 * SECURITY. This is a public URL that writes to the live database, so an
 * unverified request must never reach the handler. Front signs the payload with
 * a shared secret; we recompute the signature over the RAW body and compare.
 *
 * FAILS CLOSED: with no FRONT_WEBHOOK_SECRET configured this refuses everything
 * rather than accepting anything, the same rule the cron routes follow.
 *
 * THE SCHEME IS NOW KNOWN (checked against Front's developer documentation on
 * 28 Jul 2026, https://dev.frontapp.com/docs/rule-webhooks): the header is
 * X-Front-Signature and the value is the BASE64-ENCODED HMAC-SHA1 of the raw
 * request body, keyed with the API Secret from the Webhooks app — NOT the API
 * token, and NOT SHA256, which is what this file computed before and which
 * would have rejected every genuine delivery with a 401.
 *
 * The SHA256 forms are still accepted, because tolerating an extra scheme costs
 * nothing (each still requires the shared secret) and it means a future change
 * at Front's end degrades to "works" rather than "silently rejects everything".
 *
 * TIMING MATTERS HERE. Front waits 5 SECONDS and does not retry a failed
 * delivery. Reading an email with an LLM takes longer than that, so the work is
 * handed to after() and the response goes back immediately — a timeout would
 * otherwise mean the email is simply lost.
 */

/** Header names Front might use for the signature. */
const SIGNATURE_HEADERS = ["x-front-signature", "x-front-webhook-signature", "front-signature"];

function extractSignature(headers: Headers): { header: string; value: string } | null {
  for (const name of SIGNATURE_HEADERS) {
    const value = headers.get(name);
    if (value) return { header: name, value: value.trim() };
  }
  return null;
}

/**
 * Compare a presented signature against the HMAC of the body.
 *
 * Accepts base64 and hex, with or without a "sha256=" prefix — cheap to allow,
 * and it means an encoding difference cannot look like an attack. The comparison
 * is timing-safe so this endpoint never leaks the expected value a byte at a time.
 */
function signatureMatches(rawBody: string, secret: string, presented: string): boolean {
  const offered = presented.replace(/^sha(1|256)=/i, "").trim();
  // sha1 first: it is the documented scheme, so the common case matches on the
  // first comparison.
  for (const algorithm of ["sha1", "sha256"] as const) {
    const mac = createHmac(algorithm, secret).update(rawBody, "utf8").digest();
    for (const encoding of ["base64", "hex"] as const) {
      const expected = mac.toString(encoding);
      if (expected.length !== offered.length) continue;
      try {
        if (timingSafeEqual(Buffer.from(expected), Buffer.from(offered))) return true;
      } catch {
        /* length mismatch — try the next form */
      }
    }
  }
  return false;
}

/**
 * Any email address in the payload that looks like the SENDER.
 *
 * The rule fires on all inbound HR Onboarding mail, so most calls are about
 * something we have no interest in. If the payload already tells us who sent it
 * and it isn't Paycom, we can answer without spending a Front API request —
 * which matters when the trigger is an entire inbox rather than one sender.
 *
 * Only ever used to skip work. If no sender can be found we fetch and check
 * properly, so a payload shape we don't recognise costs a request rather than a
 * missed notice.
 */
function findSenderEmail(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): string | null => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return null;
    seen.add(node);
    const obj = node as Record<string, unknown>;

    // Front marks the sender as the recipient carrying role "from".
    const recipients = obj.recipients;
    if (Array.isArray(recipients)) {
      for (const r of recipients) {
        if (r && typeof r === "object") {
          const rec = r as Record<string, unknown>;
          if (rec.role === "from" && typeof rec.handle === "string") return rec.handle;
        }
      }
    }
    for (const value of Object.values(obj)) {
      const found = walk(value, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(payload, 0);
}

/** Same sender test the notice handler uses, applied early to skip cheaply. */
const PAYCOM_SENDER = /@paycomonline\.com$/i;

/**
 * Tag names that mean "file this as travel". Matched case-insensitively.
 *
 * The name comes from lib/front/tags.ts — this was a FOURTH private copy of tag
 * names, missed when the other three sweeps were consolidated. It guessed at
 * "travel booking" and "travel confirmation" as plausible hand-created spellings;
 * an audit of the live account on Aug 16 2026 found neither exists, and only the
 * plain "travel" tag (now under the SkyShare Journey group) is real. Dropping the
 * two invented spellings changes no behaviour and removes the last place a tag
 * name is written down twice.
 */
const TRAVEL_TAGS: string[] = [JOURNEY_TAGS.travel];

/** Any tag name in the payload — a tag-triggered rule usually includes it. */
function findTagNames(payload: unknown): string[] {
  const found: string[] = [];
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): void => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const v of node) walk(v, depth + 1);
      return;
    }
    const obj = node as Record<string, unknown>;
    // A Front tag object is {id: "tag_...", name: "..."}.
    if (typeof obj.name === "string" && typeof obj.id === "string" && obj.id.startsWith("tag_")) {
      found.push(obj.name.trim().toLowerCase());
    }
    for (const v of Object.values(obj)) walk(v, depth + 1);
  };
  walk(payload, 0);
  return found;
}

/**
 * Front's payload shape varies by trigger, so the conversation id is looked for
 * in the places it plausibly sits rather than assuming one. Returning null is
 * handled as "nothing to do", never as an error.
 */
function findConversationId(payload: unknown): string | null {
  const seen = new Set<unknown>();
  const walk = (node: unknown, depth: number): string | null => {
    if (!node || typeof node !== "object" || depth > 6 || seen.has(node)) return null;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    // A Front conversation id looks like cnv_xxxxx.
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "string" && /^cnv_[a-z0-9]+$/i.test(value)) return value;
      if (key === "conversation" && value && typeof value === "object") {
        const id = (value as Record<string, unknown>).id;
        if (typeof id === "string") return id;
      }
    }
    for (const value of Object.values(obj)) {
      const found = walk(value, depth + 1);
      if (found) return found;
    }
    return null;
  };
  return walk(payload, 0);
}

export async function POST(request: Request) {
  const secret = process.env.FRONT_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, message: "FRONT_WEBHOOK_SECRET is not configured — refusing to accept webhooks." },
      { status: 503 }
    );
  }

  // The signature covers the raw bytes, so the body must be read as text BEFORE
  // being parsed — re-serialising JSON would change it and never match.
  const rawBody = await request.text();
  const signature = extractSignature(request.headers);

  if (!signature || !signatureMatches(rawBody, secret, signature.value)) {
    // Log the header NAMES only. Enough to correct the scheme from one real
    // delivery, without putting anything sensitive in the logs.
    console.warn(
      "Front webhook rejected. Headers present:",
      [...request.headers.keys()].join(", "),
      signature ? `(tried "${signature.header}")` : "(no signature header recognised)"
    );
    return NextResponse.json({ ok: false, message: "Bad signature" }, { status: 401 });
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, message: "Body was not JSON" }, { status: 400 });
  }

  const conversationId = findConversationId(payload);
  if (!conversationId) {
    // Acknowledge rather than error: Front retries on failure, and retrying a
    // payload we simply have no interest in would achieve nothing.
    console.warn("Front webhook: no conversation id in payload; ignoring.");
    return NextResponse.json({ ok: true, ignored: "no conversation id" });
  }

  const sender = findSenderEmail(payload);

  // MENTION REPLIES ARE CHECKED FIRST, before travel or Paycom. This is the
  // cheapest possible check (one indexed exact-match lookup, no Front API
  // call) and, like travel, the sender is a real teammate replying to their
  // own inbox — the Paycom-sender filter below would otherwise discard it
  // exactly the way it would have discarded a travel email.
  const mentionThread = await prisma.mentionNotification.findUnique({
    where: { conversationId },
    select: { id: true }
  });
  if (mentionThread) {
    // Front gives us 5 seconds and never retries. Reading and stripping the
    // reply, then writing a note, comfortably fits in that window most of the
    // time, but after() is used anyway for the same reason travel does: a
    // slow moment must never mean the reply is silently lost.
    after(async () => {
      try {
        const result = await processMentionReply(conversationId);
        console.log(`Front webhook (mention reply): ${conversationId} -> ${JSON.stringify(result)}`);
      } catch (error) {
        console.error(`Front webhook mention-reply error on ${conversationId}:`, error);
      }
    });
    return NextResponse.json({ ok: true, conversationId, route: "mention-reply", queued: true });
  }

  // TRAVEL IS CHECKED NEXT, and deliberately BEFORE the Paycom sender filter
  // below. A travel email comes from a colleague, so the sender test would
  // discard it — routing on the TAG is the whole point of this branch.
  //
  // The payload is trusted only to say "a tag called Travel is involved"; if it
  // does not, we ask Front what tags the conversation actually carries rather
  // than guessing from the trigger.
  const payloadTags = findTagNames(payload);
  let isTravel = payloadTags.some((t) => TRAVEL_TAGS.includes(t));
  if (!isTravel && payloadTags.length === 0) {
    isTravel = (await getConversationTagNames(conversationId)).some((t) => TRAVEL_TAGS.includes(t));
  }

  if (isTravel) {
    // Front gives us 5 seconds and never retries. Reading the email with an LLM
    // takes longer, so acknowledge NOW and do the work after the response —
    // otherwise a slow read means the travel email is lost with no second
    // chance. Errors are logged and reported on the Front thread by the
    // importer itself, since by this point nobody is listening to the HTTP
    // status any more.
    after(async () => {
      try {
        const result = await processTravelConversation(conversationId, { apply: true, annotate: true });
        console.log(`Front webhook (travel): ${conversationId} -> ${result.outcome} — ${result.summary}`);
      } catch (error) {
        console.error(`Front webhook travel error on ${conversationId}:`, error);
      }
    });
    return NextResponse.json({ ok: true, conversationId, route: "travel", queued: true });
  }

  // The rule fires on the whole HR Onboarding inbox, so most deliveries are
  // ordinary mail. When the payload already names a non-Paycom sender, answer
  // without spending a Front API request. Anything we can't identify falls
  // through and gets fetched properly — cheap to be wrong in that direction.
  if (sender && !PAYCOM_SENDER.test(sender.trim())) {
    return NextResponse.json({ ok: true, ignored: "not a Paycom sender" });
  }

  try {
    const results = await processConversationById(conversationId, { apply: true });
    const ticked = results.filter((r) => r.outcome === "ticked");
    console.log(
      `Front webhook: ${conversationId} -> ${results.length} notice(s), ${ticked.length} ticked`,
      ticked.map((r) => `${r.hireName}:${r.detail}`).join(", ")
    );
    return NextResponse.json({ ok: true, conversationId, notices: results.length, ticked: ticked.length });
  } catch (error) {
    // A 500 tells Front to retry, which is what we want for a transient failure.
    console.error("Front webhook processing error:", error);
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
