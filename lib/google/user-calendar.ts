import { google, calendar_v3 } from "googleapis";
import { prisma } from "@/lib/prisma";

// Google Calendar acting AS THE SIGNED-IN USER, using the OAuth token they granted
// at login — not the service account.
//
// Why this exists rather than reusing lib/google/calendar.ts: that file
// authenticates as a service account, which is a separate robot identity. A plain
// service account CANNOT invite attendees at all ("Service accounts cannot invite
// attendees without Domain-Wide Delegation of Authority"), and delegation needs a
// Workspace admin. The user already signs into this app with Google, so asking for
// calendar scope at that same consent screen gets us an identity that can create a
// real invite with real guests, with nobody's admin involved.
//
// The trade-off, stated plainly because it shows up in the product: the event
// belongs to WHOEVER CLICKS. There is no single organizer unless only one person
// uses the button.

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/**
 * Either a usable client, or the reason there isn't one. The blocker strings are
 * shown on screen, so they say what to DO, not what broke.
 *
 * Deliberately NOT a discriminated union on an `ok` boolean: this project compiles
 * with "strict": false, and without strictNullChecks TypeScript will not narrow a
 * boolean discriminant — `if (!access.ok) return access.blocker` fails to compile.
 * A nullable client that callers test directly needs no narrowing at all.
 */
export type CalendarAccess = {
  client: calendar_v3.Calendar | null;
  email: string | null;
  blocker: string | null;
};

function blocked(blocker: string): CalendarAccess {
  return { client: null, email: null, blocker };
}

function oauthClientCredentials(): { id: string; secret: string } | null {
  const id = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
  const secret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  if (!id || !secret) return null;
  return { id, secret };
}

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
 * A Calendar client for this user, refreshing the access token if needed.
 *
 * Returns a BLOCKER rather than throwing for the expected failures — not signed
 * in, never granted calendar scope, no refresh token — because every one of those
 * is fixed by the user doing something, and the UI should say what.
 */
export async function getUserCalendar(userEmail: string | null | undefined): Promise<CalendarAccess> {
  if (!userEmail) {
    return blocked(
      "Nobody is signed in. Local dev bypasses auth, so there is no Google account to act as — this button only works signed in with Google (i.e. on the real site)."
    );
  }

  const creds = oauthClientCredentials();
  if (!creds) {
    return blocked("Google sign-in isn't configured on this server (AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET).");
  }

  const token = await loadToken(userEmail);
  if (!token) {
    return blocked(`No Google account is linked to ${userEmail}.`);
  }

  if (!token.scope?.includes(CALENDAR_SCOPE)) {
    return blocked(
      "Your Google sign-in doesn't include calendar access yet. Sign out and sign back in — you'll get a consent screen asking for it once, and then this works."
    );
  }

  if (!token.refreshToken && isExpired(token.expiresAt)) {
    return blocked(
      "Your Google access has expired and there's no refresh token stored. Sign out and sign back in once to fix it permanently."
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
        "Google refused to refresh your access — the permission was probably revoked. Sign out and sign back in to grant it again."
      );
    }
  }

  return { client: google.calendar({ version: "v3", auth }), email: userEmail, blocker: null };
}
