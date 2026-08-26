import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const protectedPagePrefixes = [
  "/approvals",
  "/blocks",
  "/business-cards",
  "/calendar",
  "/candidates",
  "/changes",
  "/command-center",
  "/compliments",
  "/duplicate-review",
  "/employees",
  "/events",
  // /handbook covers the pages AND app/handbook/[slug]/raw, the route handler the
  // SOP iframe loads. That route shipped with no guard of its own and this list
  // did not name /handbook, so every internal SOP was readable by anyone with the
  // URL — confirmed against production, unauthenticated, Aug 22. The pages were
  // never the leak: they call requireModulePageAccess, and although they answer
  // 200 they carry no content, because a redirect thrown inside a rendered page
  // cannot change a status code once the layout has begun streaming. Only route
  // handlers leak, precisely because they do not stream.
  "/handbook",
  "/imports",
  "/interview-questions",
  "/interviews",
  "/jobs",
  "/jobs-sandbox",
  "/matching",
  "/orientation",
  "/people",
  "/pilot-requirements",
  "/recruiting-jobs",
  "/reports",
  "/review",
  "/scheduling",
  "/settings",
  "/templates"
];

// NOTE: the public booking surface (/book and /api/book) is intentionally NOT
// listed here so candidates/guests can reach it without logging in.
const protectedApiPrefixes = [
  "/api/availability-overrides",
  "/api/blocks",
  "/api/booking-hosts",
  "/api/booking-types",
  "/api/candidate-files",
  "/api/candidates",
  "/api/duplicate-review",
  "/api/events",
  "/api/imports",
  "/api/interview-questions",
  "/api/interview-scorecards",
  "/api/interviews",
  "/api/job-block-instances",
  "/api/jobs",
  "/api/onboarding-milestones",
  "/api/orientation",
  "/api/pilot-requirements",
  "/api/workspace-settings"
];

function isProtectedPath(pathname: string) {
  return (
    protectedPagePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    protectedApiPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
  );
}

// Must stay in step with isAuthRequired() in lib/auth/auth-config.ts — the edge
// middleware bundle can't import it, so the rule is deliberately duplicated.
// Auth is required everywhere except a demonstrably local dev machine; a hosted
// deployment must never bypass just because NODE_ENV isn't "production".
function isAuthRequired() {
  if (process.env.REQUIRE_AUTH === "true") return true;
  return !(process.env.NODE_ENV === "development" && !process.env.VERCEL_ENV && !process.env.VERCEL);
}

function isApiPath(pathname: string) {
  return pathname.startsWith("/api/");
}

function hasAuthRuntimeConfig() {
  return Boolean(
    (process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET) &&
      process.env.AUTH_PROVIDER &&
      (process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID) &&
      (process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET)
  );
}

function authSecret() {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
}

/**
 * Send every production request to the ONE host NEXTAUTH_URL names.
 *
 * Why this exists. The app is reachable at more than one .vercel.app address —
 * skyshare-journey (the name since the Aug 3 rename) and skyshare-talent (the
 * original project name). Both serve the same deployment and neither redirected,
 * so which one you used was pure habit. That is fine for every page and fatal for
 * sign-in:
 *
 *   - next-auth builds redirect_uri from NEXTAUTH_URL, so Google always returns
 *     the browser to the NEXTAUTH_URL host, whichever host the flow started on.
 *   - The state and pkce.code_verifier cookies are set with NO domain attribute
 *     (next-auth core/lib/cookie.js), so they are host-only.
 *   - .vercel.app is on the Public Suffix List, so those two hosts can never
 *     share a cookie — not even deliberately.
 *
 * Start on the wrong host and the callback arrives with no state cookie, throws
 * "State cookie was missing", and bounces to /login?error=OAuthCallback. The
 * FIRST attempt therefore always failed, the second worked (it now started from
 * the right host), and the session cookie ended up on a host the person was not
 * browsing — so they were "logged out" again the next time they opened their
 * bookmark. Verified live on 2026-08-25 by walking the whole chain with curl.
 *
 * Deliberately keyed off NEXTAUTH_URL rather than a hard-coded domain: the
 * canonical host is then whatever sign-in is actually configured for, so the two
 * cannot drift apart again. Change NEXTAUTH_URL and this follows it.
 *
 * Guards, each load-bearing:
 *   - production only. Preview deployments each have their own hostname and must
 *     keep it; local dev must never be redirected at all (several sessions run
 *     dev servers on different ports in this one working tree, and sending them
 *     all to NEXTAUTH_URL's port would break them).
 *   - /api/cron/* is exempt. Vercel's scheduler must reach the function directly;
 *     a 308 there would put the four nightly jobs at the mercy of redirect
 *     following.
 *   - /api/front/webhook is exempt, and this one is the important exemption.
 *     Every other caller of this app is a browser, which follows a redirect and
 *     then makes all its later requests same-origin — so canonicalising the first
 *     page load is enough and nothing else ever crosses hosts. Front is different:
 *     it POSTs to a URL stored in ITS settings, on every event, forever. If that
 *     stored URL names the non-canonical host, a 308 puts three separate things at
 *     risk at once — whether Front follows a redirect on POST at all, whether the
 *     signature header survives the hop, and the 5-second budget it allows before
 *     giving up (there is no retry, so a miss is a message silently lost, not a
 *     delayed one). The route itself works perfectly well on either hostname: it
 *     authenticates by HMAC over the raw body, not by cookie. So there is nothing
 *     to gain by redirecting it and a whole failure mode to avoid.
 *   - no NEXTAUTH_URL, or an unparseable one, means do nothing.
 *
 * The general rule, if you add an endpoint later: exempt it if an EXTERNAL,
 * NON-BROWSER system calls it at a URL stored outside this app. Everything a
 * browser reaches should stay canonicalised.
 */
const CANONICAL_HOST_EXEMPT_PREFIXES = ["/api/cron/", "/api/front/webhook"];

function canonicalHostRedirect(request: NextRequest): URL | null {
  if (process.env.VERCEL_ENV !== "production") return null;

  const { pathname } = request.nextUrl;
  if (CANONICAL_HOST_EXEMPT_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return null;
  }

  const configured = process.env.NEXTAUTH_URL;
  if (!configured) return null;

  let canonicalHost: string;
  try {
    canonicalHost = new URL(configured).host;
  } catch {
    return null;
  }

  const requestHost = request.headers.get("host");
  if (!canonicalHost || !requestHost || requestHost === canonicalHost) return null;

  const target = request.nextUrl.clone();
  target.host = canonicalHost;
  target.protocol = "https:";
  target.port = "";
  return target;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Before anything else, including the auth check: a request on a non-canonical
  // host has its session cookie on the wrong host, so evaluating auth here would
  // wrongly bounce a signed-in person to /login. Move them first, decide after.
  const canonical = canonicalHostRedirect(request);
  if (canonical) {
    return NextResponse.redirect(canonical, 308);
  }

  // Forward the path so server components (e.g. AppShell) can render bare pages
  // like the public /book scheduling surface without the app sidebar.
  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("x-pathname", pathname);
  const passThrough = () => NextResponse.next({ request: { headers: forwardHeaders } });

  if (!isProtectedPath(pathname) || !isAuthRequired()) {
    return passThrough();
  }

  if (!hasAuthRuntimeConfig()) {
    if (isApiPath(pathname)) {
      return NextResponse.json(
        {
          message: "Authentication is required, but the auth provider is not fully configured."
        },
        { status: 401 }
      );
    }

    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    loginUrl.searchParams.set("reason", "auth-not-configured");
    return NextResponse.redirect(loginUrl);
  }

  const token = await getToken({
    req: request,
    secret: authSecret()
  });

  if (token) {
    return passThrough();
  }

  if (isApiPath(pathname)) {
    return NextResponse.json(
      {
        message: "Authentication is required."
      },
      { status: 401 }
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.searchParams.set("next", pathname);
  loginUrl.searchParams.set("reason", "session-required");
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
