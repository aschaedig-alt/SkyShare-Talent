import "server-only";
import { NextResponse } from "next/server";
import { EXEC_HUNT_COOKIE } from "@/lib/exec-hunt/constants";
import { isTokenShape } from "@/lib/exec-hunt/server";
import { clientIp, rateLimit } from "@/lib/rate-limit";

/** The guest token: the body's copy (from localStorage) first, the cookie second. */
export function readGuestToken(request: Request, bodyToken: unknown): string | null {
  if (isTokenShape(bodyToken)) return bodyToken;
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${EXEC_HUNT_COOKIE}=([^;]+)`));
  const value = match ? decodeURIComponent(match[1]) : null;
  return isTokenShape(value) ? value : null;
}

export function setGuestCookie(response: NextResponse, token: string) {
  response.cookies.set({
    name: EXEC_HUNT_COOKIE,
    value: token,
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    // Long enough to outlast the party and a re-scan the morning after.
    maxAge: 60 * 60 * 24 * 60
  });
}

export function clearGuestCookie(response: NextResponse) {
  response.cookies.set({ name: EXEC_HUNT_COOKIE, value: "", path: "/", maxAge: 0 });
}

/**
 * Burst protection for the public endpoints. Two limits, because 200 guests on
 * the hangar Wi-Fi all share ONE public IP: the per-IP ceiling is deliberately
 * generous (it only stops a runaway script), and the per-guest one is what stops
 * a stuck phone hammering the button. Per warm instance, best-effort.
 */
export function checkExecHuntRate(request: Request, token: string | null): NextResponse | null {
  const ip = rateLimit(`exec-hunt:ip:${clientIp(request)}`, 900, 60_000);
  const guest = token
    ? rateLimit(`exec-hunt:guest:${token.slice(0, 16)}`, 40, 60_000)
    : { ok: true, retryAfterSeconds: 0 };
  const blocked = !ip.ok ? ip : !guest.ok ? guest : null;
  if (!blocked) return null;
  return NextResponse.json(
    { message: "Whoa, slow down! Try again in a few seconds." },
    { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds || 5) } }
  );
}
