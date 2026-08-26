import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";

type LoginPageProps = {
  searchParams: Promise<{
    reason?: string;
    next?: string;
    /** Set by an invite link so Google opens on the work account, not a personal one. */
    email?: string;
    /**
     * Set by next-auth when sign-in actually FAILED. auth.ts points both
     * pages.signIn and pages.error at this page, so a failed callback and a
     * plain "you are not signed in" both land here — and until Aug 25 2026 this
     * page read only `reason`, so they rendered IDENTICALLY.
     *
     * That is not cosmetic. It hid a real, reproducible fault for weeks: a
     * sign-in started on a host other than NEXTAUTH_URL loses its state/PKCE
     * cookies at the callback, fails with error=OAuthCallback, and silently
     * re-renders this page — so the person completes the whole Google consent
     * flow, lands back at the start with no explanation, and does it all again.
     * They reported it as "it makes me do every step twice", which is exactly
     * what it looks like when the error is invisible.
     */
    error?: string;
  }>;
};

function messageForReason(reason: string | undefined, authReady: boolean) {
  if (reason === "auth-not-configured") {
    return "Authentication is required for this environment, but AUTH_PROVIDER has not been configured yet.";
  }

  if (reason === "session-validation-pending") {
    return "Authentication provider settings exist, but session validation has not been implemented yet.";
  }

  if (reason === "session-required") {
    return "Sign in with your approved Google account to continue.";
  }

  if (authReady) {
    return "Use your approved SkyShare Google Workspace account to access this recruiting workspace.";
  }

  return "Authentication setup is required before using protected SkyShare Journey pages.";
}

/**
 * What actually went wrong, in words the person can act on.
 *
 * These codes are next-auth's own (core/index.js maps a failed callback to
 * ?error=<code> on the sign-in page). The wording says what to DO rather than
 * naming the internal fault, except where the fault is ours — a host/redirect_uri
 * mismatch is a server misconfiguration and no amount of retrying fixes it, so
 * that one says so plainly instead of sending somebody round the loop again.
 */
function messageForError(error: string | undefined): { title: string; detail: string } | null {
  if (!error) {
    return null;
  }

  if (error === "AccessDenied") {
    return {
      title: "That account is not allowed in.",
      detail:
        "Sign-in worked, but this address is not on the approved list — or it has been revoked. Ask an admin to grant access, then try again."
    };
  }

  if (error === "OAuthAccountNotLinked") {
    return {
      title: "This email already exists under a different sign-in method.",
      detail: "An admin needs to remove the old account record before you can sign in with Google."
    };
  }

  if (error === "Configuration") {
    return {
      title: "Sign-in is misconfigured on the server.",
      detail: "This is not something you can fix by retrying. Tell an admin — the auth environment variables need attention."
    };
  }

  if (error === "OAuthCallback" || error === "Callback" || error === "OAuthSignin") {
    return {
      title: "Google sent you back, but the sign-in could not be completed.",
      detail:
        "This usually means the address you started from is not the one the server is configured for, so the security cookie set at the start was not there at the end. Retrying often appears to work because the second attempt starts from the right address — but the underlying setting is still wrong. Report it rather than living with it."
    };
  }

  if (error === "SessionRequired") {
    return { title: "You need to be signed in to see that page.", detail: "Sign in and you will be taken back to it." };
  }

  return {
    title: "Sign-in failed.",
    detail: `Google returned "${error}". If it happens again, send that code to an admin — it says which step broke.`
  };
}

function isGoogleAuthReady() {
  return Boolean(
    (process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET) &&
      (process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID) &&
      (process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET) &&
      process.env.AUTH_PROVIDER
  );
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  // Land on the app root after sign-in, not a hard-coded page — the "/" route
  // resolves each user's chosen home page (falling back to Command Center). A
  // "next" (the page they were bounced from) still wins.
  const callbackUrl = params.next || "/";
  const authReady = isGoogleAuthReady();
  // A hint carried in the URL, so it is treated as display text and nothing more:
  // it selects a Google account, it does not grant access. Whether this address is
  // allowed in is decided by auth.ts and the invite record, exactly as before.
  const invitedEmail = params.email?.trim() && params.email.includes("@") ? params.email.trim() : undefined;
  const signInError = messageForError(params.error?.trim() || undefined);
  const title = authReady ? "Sign in to SkyShare Journey" : "Authentication setup required";

  let loginLogo: string | null = null;
  try {
    loginLogo = resolveBrandingLogo(await getWorkspaceBranding(), "login");
  } catch {
    loginLogo = null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-brand-cloudDancer px-5 py-8 dark:bg-white/5">
      <section className="w-full max-w-xl rounded bg-white p-6 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10">
        {loginLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={loginLogo} alt="SkyShare" className="mb-5 h-16 w-auto object-contain" />
        ) : null}
        <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-brand-gold">Access control</p>
        <h1 className="mt-2 text-2xl font-semibold text-brand-lea dark:text-slate-100">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-brand-grey dark:text-slate-400">{messageForReason(params.reason, authReady)}</p>

        {signInError ? (
          <div
            role="alert"
            className="mt-4 rounded border border-red-300 bg-red-50 p-3 text-xs text-red-700 dark:border-red-500/30 dark:bg-red-500/15 dark:text-red-300"
          >
            <p className="font-semibold">{signInError.title}</p>
            <p className="mt-1 leading-5">{signInError.detail}</p>
          </div>
        ) : null}

        {invitedEmail ? (
          <div className="mt-4 rounded border border-brand-gold/30 bg-brand-gold/10 p-3 text-xs text-brand-grey dark:text-slate-300">
            You were invited as <span className="font-semibold text-brand-lea dark:text-slate-100">{invitedEmail}</span>. Sign in
            with that SkyShare account.
          </div>
        ) : null}

        {params.next ? (
          <div className="mt-4 rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 text-xs text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            Requested page: <span className="font-semibold text-brand-lea dark:text-slate-100">{params.next}</span>
          </div>
        ) : null}

        {authReady ? (
          <div className="mt-5 rounded border border-brand-lea/10 bg-brand-cloudDancer/55 p-3 text-sm leading-6 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
            Access is limited to approved SkyShare accounts. If you cannot sign in, confirm your email is part of the
            allowed workspace or admin list.
          </div>
        ) : (
          <div className="mt-5 space-y-2 text-sm text-brand-grey dark:text-slate-400">
            <div>Local development remains open unless REQUIRE_AUTH=true.</div>
            <div>Before real candidate data, configure an auth provider and route session validation.</div>
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          {authReady ? (
            <GoogleSignInButton callbackUrl={callbackUrl} loginHint={invitedEmail} />
          ) : (
            <div className="rounded border border-brand-gold/30 bg-brand-gold/10 px-4 py-2 text-sm font-semibold text-brand-lea dark:text-slate-100">
              Google auth environment variables are not configured yet.
            </div>
          )}

          {!authReady || process.env.NODE_ENV !== "production" ? (
            <Link
              href="/command-center"
              className="rounded border border-brand-lea/25 px-4 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-lea hover:text-white"
            >
              Return local home
            </Link>
          ) : null}
        </div>
      </section>
    </div>
  );
}
