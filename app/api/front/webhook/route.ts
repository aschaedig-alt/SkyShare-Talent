import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { processConversationById } from "@/lib/paycom/scan";

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
 * ONE UNCERTAINTY, stated plainly: Front's exact header name and digest encoding
 * are not documented anywhere we hold, so the accepted forms below are a
 * best-effort superset. A rejected call logs the header NAMES it arrived with
 * (never the secret) so the first real delivery tells us the truth and this can
 * be narrowed to the one correct scheme.
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
  const offered = presented.replace(/^sha256=/i, "").trim();
  const mac = createHmac("sha256", secret).update(rawBody, "utf8").digest();
  for (const encoding of ["base64", "hex"] as const) {
    const expected = mac.toString(encoding);
    if (expected.length !== offered.length) continue;
    try {
      if (timingSafeEqual(Buffer.from(expected), Buffer.from(offered))) return true;
    } catch {
      /* length mismatch — try the other encoding */
    }
  }
  return false;
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
