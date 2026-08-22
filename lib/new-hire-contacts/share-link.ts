import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

// The share token that gates the public new-hire contacts surface (/welcome and
// /api/contacts/vcard).
//
// WHY THIS EXISTS: both of those are outside the auth wall by design — a brand
// new hire has no account and has to be able to tap a texted link. But until
// now "outside the auth wall" meant anyone who typed the URL got the curated
// staff directory: names, titles, phones and email addresses. Unguessable is
// the property we actually wanted, not logged-in.
//
// STORED IN ITS OWN WorkspaceSetting ROW, deliberately not inside the contacts
// config blob. saveNewHireContactsConfig() runs the posted payload through
// normalizeNewHireContactsConfig(), which drops any field it does not know
// about — so a token living in that blob would be silently wiped the first time
// an admin saved the contact sheet. A separate row cannot be clobbered by the
// config save path.
//
// This is the same shape as the report share links (app/api/reports-share):
// 12 random bytes, base64url, compared server-side. Anyone holding the link can
// use it and forward it, which is the point — the security property is
// "unguessable and revocable", not "only the intended recipient". A link sent
// by text or email is forwardable and lives in that inbox forever; rotating is
// what takes it back.

const SCOPE = "new-hire-contacts";
const KEY = "share-token";

function newToken(): string {
  return randomBytes(12).toString("base64url"); // ~16 unguessable chars
}

/** The stored token, or null if one has never been generated. */
export async function getShareToken(): Promise<string | null> {
  const setting = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true }
  });
  const value = setting?.valueJson?.trim();
  return value ? value : null;
}

/**
 * The stored token, generating one on first use.
 *
 * ADMIN PATHS ONLY. The public routes must never call this — they use
 * isValidShareToken(), which fails closed. If a missing token auto-created
 * itself on a public request, the endpoint would mint its own key on the way to
 * checking it.
 */
export async function ensureShareToken(): Promise<string> {
  const existing = await getShareToken();
  if (existing) return existing;

  const token = newToken();
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: token },
    update: { valueJson: token }
  });
  return token;
}

/** Replace the token. Every link already sent out stops working immediately. */
export async function rotateShareToken(): Promise<string> {
  const token = newToken();
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: token },
    update: { valueJson: token }
  });
  return token;
}

/**
 * Is this the current token?
 *
 * FAILS CLOSED: no stored token, or no presented token, means no. A workspace
 * that has never opened the admin screen serves nothing publicly, which is the
 * safe direction to be wrong in.
 *
 * Compared over SHA-256 digests rather than the raw strings, because
 * timingSafeEqual throws on a length mismatch — hashing first makes both sides
 * 32 bytes regardless of what was presented, so a wrong-length guess takes the
 * same path as a wrong-value one.
 */
export async function isValidShareToken(presented: string | null | undefined): Promise<boolean> {
  if (typeof presented !== "string" || !presented) return false;
  const stored = await getShareToken();
  if (!stored) return false;

  const a = createHash("sha256").update(stored, "utf8").digest();
  const b = createHash("sha256").update(presented, "utf8").digest();
  return timingSafeEqual(a, b);
}

/** The full link an admin copies and sends to a new hire. */
export function buildShareUrl(origin: string, token: string): string {
  const base = origin ? `${origin}/welcome` : "/welcome";
  return `${base}?t=${encodeURIComponent(token)}`;
}
