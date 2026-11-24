import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFailureResponse, requireApiPermission } from "@/lib/auth/route-auth";
import { invalidateLiveCache } from "@/lib/exec-hunt/server";

// ADMIN - wipe test play before the party. Deletes guests and their discoveries
// ONLY. The executives, photos, settings and - above all - every picture's
// publicKey stay exactly as they are, so codes already printed keep working.
// Needs the literal word RESET in the body, so it cannot fire by accident.
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return authFailureResponse(auth);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.confirm !== "RESET") {
    return NextResponse.json({ message: "Type RESET to confirm." }, { status: 400 });
  }
  const [discoveries, guests] = await prisma.$transaction([
    prisma.execHuntDiscovery.deleteMany({}),
    prisma.execHuntGuest.deleteMany({})
  ]);
  invalidateLiveCache();
  console.info(`Exec hunt reset by ${auth.user.email ?? "local"}: ${discoveries.count} discoveries, ${guests.count} guests`);
  return NextResponse.json({ ok: true, discoveries: discoveries.count, guests: guests.count });
}
