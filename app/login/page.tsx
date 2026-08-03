import Link from "next/link";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { getWorkspaceBranding, resolveBrandingLogo } from "@/lib/data/branding";

type LoginPageProps = {
  searchParams: Promise<{
    reason?: string;
    next?: string;
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
            <GoogleSignInButton callbackUrl={callbackUrl} />
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
