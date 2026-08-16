import { google, gmail_v1 } from "googleapis";
import { prisma } from "@/lib/prisma";

// Gmail, READ ONLY, acting as a named Workspace user via the OAuth token they
// granted at login — the same mechanism as lib/google/user-calendar.ts, and for
// the same reason: a plain service account is a separate robot identity with no
// mailbox, and reading a real person's mail as a service account needs
// Domain-Wide Delegation from a Workspace admin.
//
// WHY THIS EXISTS AT ALL. Paycom's "Offer Accepted" notice is addressed to
// aschaedig@skyshare.com and is NOT delivered to any Front inbox — a walk of
// 5,208 conversations across all four inboxes the Front token can read (HR,
// Recruiting, HR Onboarding, Pilot Applications) covering 2025-05-05 to
// 2026-08-15 returned zero of them, while the same mailbox in Gmail holds ~200.
// So the Front sweep, however good its parser, can never see one. This is the
// path that can.
//
// SCOPE, STATED PLAINLY: gmail.readonly is the narrowest scope Google offers that
// can read a message BODY, and it grants read access to the WHOLE mailbox. There
// is no per-sender scope. gmail.metadata can restrict to headers but cannot read
// the body, and the body is where the candidate name, position and requisition
// live — so it is not an option here. Granted on the user's explicit approval
// (Aug 16 2026).
//
// Nothing here can write, label, send or delete: readonly is enforced by Google,
// not by our own good behaviour.

const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

/**
 * Either a usable client, or the reason there isn't one.
 *
 * Same shape and same non-union rationale as CalendarAccess: this project
 * compiles with "strict": false, so a discriminated union on a boolean would not
 * narrow. A nullable client callers test directly needs no narrowing.
 */
export type GmailAccess = {
  client: gmail_v1.Gmail | null;
  email: string | null;
  blocker: string | null;
};

function blocked(blocker: string): GmailAccess {
  return { client: null, email: null, blocker };
}

function oauthClientCredentials(): { id: string; secret: string } | null {
  const id = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const secret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  if (!id || !secret) return null;
  return { id, secret };
}

/**
 * The mailbox the offer notices actually arrive in.
 *
 * Configurable rather than hardcoded because the notice recipient is a Paycom
 * setting somebody may change, and because the nightly cron has NO signed-in
 * user — it cannot use "whoever clicked", so it needs a named mailbox to read.
 */
export const OFFER_NOTICE_MAILBOX = process.env.PAYCOM_NOTICE_MAILBOX ?? "aschaedig@skyshare.com";

type StoredToken = {
  accountId: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
  scope: string | null;
};

async function loadToken(userEmail: string): Promise<StoredToken | null> {
  const account = await prisma.account.findFirst({
    where: { provider: "google", user: { email: userEmail } },
    select: { id: true, access_token: true, refresh_token: true, expires_at: true, scope: true }
  });
  if (!account) return null;
  return {
    accountId: account.id,
    accessToken: account.access_token,
    refreshToken: account.refresh_token,
    expiresAt: account.expires_at,
    scope: account.scope
  };
}

/** Google's expiry is unix SECONDS. Refresh a minute early so a token can't die
    mid-request. */
function isExpired(expiresAt: number | null): boolean {
  if (!expiresAt) return true;
  return Date.now() >= (expiresAt - 60) * 1000;
}

/**
 * A read-only Gmail client for one named mailbox, refreshing the access token if
 * needed.
 *
 * Returns a BLOCKER rather than throwing for the expected failures — the account
 * has not signed in, or signed in before Gmail scope was added — because each is
 * fixed by a person doing one thing, and the caller should be able to say what.
 *
 * A missing Gmail scope is the one everybody will hit first: every account in
 * this database consented before this scope existed, exactly as happened when
 * calendar scope was added, so the mailbox owner must sign out and back in once.
 */
export async function getUserGmail(userEmail: string | null | undefined): Promise<GmailAccess> {
  if (!userEmail) {
    return blocked("No mailbox was named, so there is no Google account to read as.");
  }

  const creds = oauthClientCredentials();
  if (!creds) {
    return blocked(
      "Google sign-in isn't configured on this server (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET). Note these are set on Vercel, not locally — so this cannot work from npm run dev."
    );
  }

  const token = await loadToken(userEmail);
  if (!token) {
    return blocked(`No Google account is linked to ${userEmail} — they need to sign into the app with Google once.`);
  }

  if (!token.scope?.includes(GMAIL_SCOPE)) {
    return blocked(
      `${userEmail} signed in before Gmail access was added. They need to sign out and sign back in once — there is a consent screen asking for it, and then this works.`
    );
  }

  if (!token.refreshToken && isExpired(token.expiresAt)) {
    return blocked(
      `Google access for ${userEmail} has expired and no refresh token is stored. Signing out and back in once fixes it permanently.`
    );
  }

  const auth = new google.auth.OAuth2(creds.id, creds.secret);
  auth.setCredentials({
    access_token: token.accessToken ?? undefined,
    refresh_token: token.refreshToken ?? undefined,
    expiry_date: token.expiresAt ? token.expiresAt * 1000 : undefined
  });

  if (isExpired(token.expiresAt) && token.refreshToken) {
    try {
      const { credentials } = await auth.refreshAccessToken();
      auth.setCredentials(credentials);
      // Write the fresh token back so the next request doesn't pay for a refresh.
      await prisma.account.update({
        where: { id: token.accountId },
        data: {
          access_token: credentials.access_token ?? token.accessToken,
          expires_at: credentials.expiry_date ? Math.floor(credentials.expiry_date / 1000) : token.expiresAt
        }
      });
    } catch {
      return blocked(
        `Google refused to refresh access for ${userEmail} — the permission was probably revoked. Signing out and back in grants it again.`
      );
    }
  }

  return { client: google.gmail({ version: "v1", auth }), email: userEmail, blocker: null };
}
