import { NextResponse } from "next/server";
import { claimDiscovery, cleanGuestName } from "@/lib/exec-hunt/server";
import { checkExecHuntRate, readGuestToken, setGuestCookie } from "@/lib/exec-hunt/http";

// PUBLIC - no login. A guest's claim of one hidden picture. Everything that
// counts is decided here: the picture by its public key, the guest by token, and
// "new or repeat" by the database's unique index. Nothing the phone sends about
// counts or scores is read.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ message: "That request was not readable." }, { status: 400 });
  }
  const publicKey = typeof body.key === "string" ? body.key.trim().slice(0, 80) : "";
  if (!publicKey) return NextResponse.json({ message: "Which picture?" }, { status: 400 });

  const token = readGuestToken(request, body.token);
  const limited = checkExecHuntRate(request, token);
  if (limited) return limited;

  try {
    const result = await claimDiscovery({ publicKey, token, name: cleanGuestName(body.name) });
    if (result.status === "not-found") {
      return NextResponse.json({ status: "not-found", message: "We don't recognise that code." }, { status: 404 });
    }
    const response = NextResponse.json(result);
    // A newly issued token goes back in the body (for localStorage) AND as a
    // cookie; an existing one is refreshed so the cookie never quietly expires.
    if (result.status === "claimed" || result.status === "already") {
      const keep = result.guest.token ?? token;
      if (keep) setGuestCookie(response, keep);
    }
    return response;
  } catch (error) {
    console.error("Exec hunt claim error:", error);
    return NextResponse.json({ message: "Something went wrong. Try scanning again." }, { status: 500 });
  }
}
