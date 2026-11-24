import { NextResponse } from "next/server";
import { findGuestByToken, getGuestProgress } from "@/lib/exec-hunt/server";
import { checkExecHuntRate, readGuestToken } from "@/lib/exec-hunt/http";

// PUBLIC - the guest's own progress, by their token. POST so the token rides in
// the body rather than in a URL that ends up in logs.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const token = readGuestToken(request, body.token);
  const limited = checkExecHuntRate(request, token);
  if (limited) return limited;
  const guest = await findGuestByToken(token);
  if (!guest) return NextResponse.json({ guest: null });
  return NextResponse.json({ guest: { name: guest.name }, progress: await getGuestProgress(guest.id) });
}
