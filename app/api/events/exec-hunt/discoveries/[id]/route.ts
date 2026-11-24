import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFailureResponse, requireApiPermission } from "@/lib/auth/route-auth";
import { invalidateLiveCache } from "@/lib/exec-hunt/server";

// ADMIN - remove one invalid submission. The guest can claim that picture again
// afterwards (the unique row is gone), which is the point of removing it.
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return authFailureResponse(auth);
  const { id } = await params;
  const removed = await prisma.execHuntDiscovery.deleteMany({ where: { id } });
  invalidateLiveCache();
  if (removed.count === 0) return NextResponse.json({ message: "That submission was already gone." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
