import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const protectedPagePrefixes = [
  "/approvals",
  "/blocks",
  "/calendar",
  "/candidates",
  "/changes",
  "/command-center",
  "/duplicate-review",
  "/imports",
  "/jobs",
  "/jobs-sandbox",
  "/pilot-requirements",
  "/recruiting-jobs",
  "/reports",
  "/review",
  "/settings",
  "/templates"
];

const protectedApiPrefixes = [
  "/api/blocks",
  "/api/candidate-files",
  "/api/candidates",
  "/api/duplicate-review",
  "/api/imports",
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

function isAuthRequired() {
  return process.env.REQUIRE_AUTH === "true" || process.env.NODE_ENV === "production";
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

  if (!isProtectedPath(pathname) || !isAuthRequired()) {
    return NextResponse.next();
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
    return NextResponse.next();
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
