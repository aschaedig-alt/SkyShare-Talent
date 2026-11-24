import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authFailureResponse, requireApiPermission } from "@/lib/auth/route-auth";
import { getExecHuntConfig, invalidateLiveCache } from "@/lib/exec-hunt/server";

// ADMIN - turn the hunt on/off, set its window, and choose what the projector shows.
export const dynamic = "force-dynamic";

function parseDate(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function PATCH(request: Request) {
  const auth = await requireApiPermission("events:write");
  if (!auth.ok) return authFailureResponse(auth);

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const current = await getExecHuntConfig();
  const data: Record<string, unknown> = {};
  for (const key of ["enabled", "showLeaderboard", "showNames"] as const) {
    if (typeof body[key] === "boolean") data[key] = body[key];
  }
  for (const key of ["opensAt", "closesAt"] as const) {
    if (key in body) {
      const parsed = parseDate(body[key]);
      if (parsed === undefined) return NextResponse.json({ message: `That ${key === "opensAt" ? "opening" : "closing"} time is not a real date.` }, { status: 400 });
      data[key] = parsed;
    }
  }
  const opensAt = "opensAt" in data ? (data.opensAt as Date | null) : current.opensAt;
  const closesAt = "closesAt" in data ? (data.closesAt as Date | null) : current.closesAt;
  if (opensAt && closesAt && closesAt <= opensAt) {
    return NextResponse.json({ message: "The hunt has to close after it opens." }, { status: 400 });
  }

  const config = await prisma.execHuntConfig.update({ where: { id: "default" }, data });
  invalidateLiveCache();
  return NextResponse.json({ ok: true, config });
}
