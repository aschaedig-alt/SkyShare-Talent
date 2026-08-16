import { PrismaAdapter } from "@next-auth/prisma-adapter";
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { prisma } from "@/lib/prisma";
import { isRoleName, type RoleName } from "@/lib/auth/roles";
import { isEmailBlocked } from "@/lib/auth/blocklist";
import { logActivity } from "@/lib/activity/logger";

// Record a sign-in attempt to the activity log so admins can see who tried to get
// in and why they were turned away. Only what actually reaches us is capturable:
// Google validates the password upstream, so a genuine bad-credentials attempt
// never gets here — the reasons we can record are "ok", "blocked", and
// "not_allowed_domain". Never throws (logActivity swallows its own errors) so a
// logging hiccup can't stop a legitimate login.
async function logSignInAttempt(email: string | null | undefined, success: boolean, reason: string) {
  await logActivity({
    activityType: "AUTH_SIGN_IN_ATTEMPT",
    userEmail: email ?? undefined,
    description: `Sign-in ${success ? "succeeded" : "denied"}${email ? `: ${email}` : ""}${success ? "" : ` (${reason})`}`,
    metadata: { success, reason, email: email ?? null }
  });
}

function csvEnv(name: string) {
  return (process.env[name] ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function authSecret() {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
}

export function isGoogleAuthConfigured() {
  return Boolean(
    authSecret() &&
      (process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID) &&
      (process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)
  );
}

export function isEmailAllowedForAuth(email: string | null | undefined) {
  if (!email) {
    return false;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const domain = normalizedEmail.split("@")[1] ?? "";
  const allowedEmails = csvEnv("AUTH_ALLOWED_EMAILS");
  const allowedDomains = csvEnv("AUTH_ALLOWED_DOMAINS");
  const adminEmails = csvEnv("AUTH_ADMIN_EMAILS");

  return (
    adminEmails.includes(normalizedEmail) ||
    allowedEmails.includes(normalizedEmail) ||
    allowedDomains.includes(domain)
  );
}

function initialRoleForEmail(email: string | null | undefined): RoleName {
  const normalizedEmail = email?.trim().toLowerCase();

  if (normalizedEmail && csvEnv("AUTH_ADMIN_EMAILS").includes(normalizedEmail)) {
    return "ADMIN";
  }

  // New team members get read-only access by default. Admins must grant access via Settings.
  return "VIEWER";
}

async function loadTokenUser(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true }
  });

  if (!user) {
    return null;
  }

  const firstAdminRole = initialRoleForEmail(email);

  if (firstAdminRole === "ADMIN" && user.role !== "ADMIN") {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
      select: { id: true, role: true }
    });

    return updated;
  }

  return user;
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  secret: authSecret(),
  session: {
    strategy: "jwt"
  },
  pages: {
    signIn: "/login",
    error: "/login"
  },
  providers: isGoogleAuthConfigured()
    ? [
        GoogleProvider({
          clientId: process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "",
          clientSecret: process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "",
          allowDangerousEmailAccountLinking: false,
          // Sign-in ALSO grants calendar access, so the app can create the
          // orientation invite as the person clicking the button rather than as a
          // robot account (which cannot invite guests at all without domain-wide
          // delegation from a Workspace admin).
          //
          // ...and READ-ONLY Gmail, added Aug 16 2026 on the user's explicit
          // approval. Paycom's "Offer Accepted" notice is addressed to one person
          // and is never delivered to a Front inbox, so reading that mailbox is
          // the only way the app can see an offer being accepted. See
          // lib/google/user-gmail.ts.
          //
          // BE AWARE WHAT THIS GRANTS: gmail.readonly is the narrowest scope that
          // can read a message BODY, and it covers the WHOLE mailbox — Google has
          // no per-sender scope, and gmail.metadata cannot see a body at all. The
          // sweep's own query is what keeps the app to the mail it needs; the
          // scope itself is broader than the use.
          //
          // access_type=offline + prompt=consent are what make Google hand over a
          // REFRESH token. Without both, you get a one-hour access token and no way
          // to renew it — the button works just after login and is dead by lunchtime.
          // Every pre-existing account here had refresh_token = null for exactly
          // this reason, so everyone re-consents once.
          //
          // ADDING A SCOPE DOES NOT UPGRADE ANYONE AUTOMATICALLY. A token already
          // stored keeps the scopes it was granted with, which is why the Gmail
          // path reports a blocker naming the person who has to sign out and back
          // in rather than failing obscurely.
          authorization: {
            params: {
              scope:
                "openid email profile https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/gmail.readonly",
              access_type: "offline",
              prompt: "consent"
            }
          }
        })
      ]
    : [],
  events: {
    /**
     * Persist the Google tokens on EVERY sign-in.
     *
     * This is not redundant with the adapter. PrismaAdapter writes tokens via
     * linkAccount, which fires only the FIRST time an account is linked — so an
     * existing user signing in again keeps whatever was stored on day one. Every
     * account in this database was linked before calendar scope existed, which is
     * why they all had refresh_token = null; without this handler they would stay
     * that way forever and the calendar button would never work for them.
     *
     * refresh_token is only written when Google actually sends one (it omits it on
     * repeat consents), so a later sign-in can't blank out a good one.
     */
    async signIn({ account }) {
      if (account?.provider !== "google") return;
      try {
        const data: Record<string, unknown> = {};
        if (typeof account.access_token === "string") data.access_token = account.access_token;
        if (typeof account.refresh_token === "string" && account.refresh_token) {
          data.refresh_token = account.refresh_token;
        }
        if (typeof account.expires_at === "number") data.expires_at = account.expires_at;
        if (typeof account.scope === "string") data.scope = account.scope;
        if (Object.keys(data).length === 0) return;

        await prisma.account.updateMany({
          where: { provider: "google", providerAccountId: account.providerAccountId },
          data
        });
      } catch (error) {
        // Never block a login over token bookkeeping — worst case the calendar
        // button reports that access is missing and the user signs in again.
        console.error("Failed to persist Google tokens on sign-in:", error);
      }
    },
    // Successful sign-out — the login side is logged as an attempt in the signIn
    // callback below, so we only record the logout here.
    async signOut({ token }) {
      await logActivity({
        activityType: "USER_LOGOUT",
        userId: typeof token?.id === "string" ? token.id : undefined,
        userEmail: typeof token?.email === "string" ? token.email : undefined,
        description: `Signed out${token?.email ? `: ${String(token.email)}` : ""}`
      });
    }
  },
  callbacks: {
    async signIn({ user }) {
      // A revoked (blocked) email can never sign back in, even if its domain is
      // otherwise allowed — this is what makes offboarding stick.
      if (await isEmailBlocked(user.email)) {
        await logSignInAttempt(user.email, false, "blocked");
        return false;
      }
      const allowed = isEmailAllowedForAuth(user.email);
      await logSignInAttempt(user.email, allowed, allowed ? "ok" : "not_allowed_domain");
      return allowed;
    },
    async jwt({ token, user }) {
      const email = (user?.email ?? token.email)?.trim().toLowerCase();

      if (!email) {
        return token;
      }

      const dbUser = await loadTokenUser(email);
      const role = isRoleName(dbUser?.role) ? dbUser.role : initialRoleForEmail(email);

      token.id = dbUser?.id ?? token.sub;
      token.role = role;

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = typeof token.id === "string" ? token.id : token.sub ?? "";
        session.user.role = isRoleName(String(token.role)) ? (token.role as RoleName) : "VIEWER";
      }

      return session;
    }
  }
};
