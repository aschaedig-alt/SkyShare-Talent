import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cleanGuestName, findGuestByToken, invalidateLiveCache } from "@/lib/exec-hunt/server";
import { checkExecHuntRate, readGuestToken } from "@/lib/exec-hunt/http";

// PUBLIC - a guest fixes the name on their own token. Renaming never merges two
// guests: a name is only ever a label on one token.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const token = readGuestToken(request, body.token);
  const limited = checkExecHuntRate(request, token);
  if (limited) return limited;
  const name = cleanGuestName(body.name);
  if (!name) return NextResponse.json({ message: "Type a name first." }, { status: 400 });
  const guest = await findGuestByToken(token);
  if (!guest) {
    return NextResponse.json({ message: "We don't know this phone yet. Scan a picture first." }, { status: 404 });
  }
  const updated = await prisma.execHuntGuest.update({ where: { id: guest.id }, data: { name } });
  invalidateLiveCache();
  return NextResponse.json({ ok: true, name: updated.name });
}
