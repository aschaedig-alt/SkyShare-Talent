import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";

// A no-login link to ONE person's contact card — what the "Send contact card"
// email carries.
//
// WHY A LINK AND NOT AN ATTACHMENT (Nov 19 2026). The first version attached the
// .vcf to the email. On his iPhone that opened in a preview with no "Create New
// Contact" button at all: an attachment is handled by whichever MAIL app opens
// it, and they do not agree. A text/vcard response opened in the BROWSER is
// handled by the phone itself — Safari shows "Create New Contact / Add to
// Existing Contact", Android Chrome hands it to Contacts — which is exactly why
// the commonly-used-contacts page (/welcome) has always worked. So this email
// links to /welcome/card/<token>, whose button does what /welcome's buttons do.
//
// THE SECURITY PROPERTY is the same as the /welcome share link: unguessable and
// revocable, not "only the intended recipient" — an emailed link is forwardable
// by nature. One token per hire, reused on every send, so a resend does not
// kill the card a supervisor saved last week. Two things revoke it:
//   - rotateHireCardToken() (a new token; every link already sent stops working)
//   - the hire being cancelled or TERMINATED — the public routes check that live,
//     so a departed employee's mobile number stops being served on its own.
//
// Stored as ONE WorkspaceSetting row mapping hireId -> token, rather than a
// column, so this ships without a migration against the shared live database.

const SCOPE = "new-hire-contacts";
const KEY = "hire-card-tokens";

type TokenMap = Record<string, string>;

async function readAll(): Promise<TokenMap> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: TokenMap = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "string" && v) out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

async function writeAll(all: TokenMap): Promise<void> {
  const valueJson = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson },
    update: { valueJson },
  });
}

function newToken(): string {
  return randomBytes(12).toString("base64url"); // ~16 unguessable chars
}

/**
 * This hire's card token, creating one on first use.
 *
 * ADMIN PATHS ONLY — the public routes use hireIdForCardToken(), which never
 * creates anything. Called when the send dialog builds its preview, so the body
 * she reads (and may edit) already holds the real link. A token minted for a
 * dialog that was then cancelled serves nothing nobody could already see in the
 * app, and is simply reused by the next send.
 */
export async function ensureHireCardToken(hireId: string): Promise<string> {
  const all = await readAll();
  if (all[hireId]) return all[hireId];
  all[hireId] = newToken();
  await writeAll(all);
  return all[hireId];
}

/** Replace this hire's token. Every card link already sent for them stops working. */
export async function rotateHireCardToken(hireId: string): Promise<string> {
  const all = await readAll();
  all[hireId] = newToken();
  await writeAll(all);
  return all[hireId];
}

function sameToken(a: string, b: string): boolean {
  // Hash first so a wrong-length guess takes the same path as a wrong value —
  // timingSafeEqual throws on a length mismatch.
  const x = createHash("sha256").update(a, "utf8").digest();
  const y = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(x, y);
}

/**
 * Which hire a presented token belongs to, or null. FAILS CLOSED: an unknown,
 * missing or malformed token is null, and so is a hire who is cancelled or no
 * longer employed — their card stops being served without anybody remembering
 * to revoke it.
 */
export async function hireIdForCardToken(presented: string | null | undefined): Promise<string | null> {
  if (typeof presented !== "string" || presented.length < 8 || presented.length > 64) return null;
  const all = await readAll();
  let match: string | null = null;
  for (const [hireId, token] of Object.entries(all)) {
    if (sameToken(token, presented)) match = hireId;
  }
  if (!match) return null;
  const hire = await prisma.newHire.findUnique({
    where: { id: match },
    select: { canceled: true, employmentStatus: true },
  });
  if (!hire || hire.canceled || hire.employmentStatus === "TERMINATED") return null;
  return match;
}

/**
 * The absolute origin for a link that will leave the building in an email.
 *
 * NEVER localhost. .env.local sets NEXTAUTH_URL to http://localhost:3000, and a
 * link only this laptop can open is useless to a supervisor. Unlike the contacts
 * email (which refuses to send from a laptop), this falls back to the production
 * host instead: the database is shared, so a token minted here resolves on the
 * live site, and the guarded test send from a laptop can still be tapped on a
 * phone once the code is deployed.
 */
export function cardLinkOrigin(): string {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const production = productionHost ? `https://${productionHost}` : "https://skyshare-journey.vercel.app";
  const base = process.env.NEXTAUTH_URL ?? production;
  return (/localhost|127\.0\.0\.1|\[::1\]/i.test(base) ? production : base).replace(/\/+$/, "");
}

export function buildHireCardUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, "")}/welcome/card/${encodeURIComponent(token)}`;
}

/** The vCard endpoint the card page's button points at. Relative on purpose:
 *  it is only ever followed from the card page itself. */
export function hireCardVcardPath(token: string): string {
  return `/api/contacts/card/${encodeURIComponent(token)}`;
}

/** What the public card shows and the .vcf holds — the same fields the email
 *  text discloses. The personal email is never on it. */
export async function loadPublicHireCard(hireId: string) {
  const hire = await prisma.newHire.findUnique({
    where: { id: hireId },
    select: {
      name: true,
      position: true,
      businessCardTitle: true,
      department: true,
      location: true,
      phone: true,
      ssEmail: true,
    },
  });
  if (!hire) return null;
  return {
    name: hire.name,
    title: hire.businessCardTitle?.trim() || hire.position?.trim() || null,
    department: hire.department?.trim() || null,
    location: hire.location?.trim() || null,
    phone: hire.phone?.trim() || null,
    email: hire.ssEmail?.trim() || null,
  };
}
