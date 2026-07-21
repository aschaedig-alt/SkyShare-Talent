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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

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
