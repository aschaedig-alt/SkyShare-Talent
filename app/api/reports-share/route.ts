import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";

// Manage revocable public share links for the Fleet Progression report.
// Admin-only (settings:admin). The public VIEW route (/r/[token]) needs no auth.

const REPORT = "fleet-progression";

function serialize(l: { id: string; token: string; label: string | null; createdAt: Date; revokedAt: Date | null }) {
  return { id: l.id, token: l.token, label: l.label, createdAt: l.createdAt.toISOString(), revoked: l.revokedAt !== null };
}

export async function GET() {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const links = await prisma.reportShareLink.findMany({
    where: { report: REPORT, revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, token: true, label: true, createdAt: true, revokedAt: true }
  });
  return NextResponse.json({ links: links.map(serialize) });
}

export async function POST(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { label?: unknown };
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim().slice(0, 80) : null;
  const token = randomBytes(12).toString("base64url"); // ~16 unguessable chars

  const link = await prisma.reportShareLink.create({
    data: { token, report: REPORT, label, createdBy: auth.user.email ?? null },
    select: { id: true, token: true, label: true, createdAt: true, revokedAt: true }
  });
  return NextResponse.json({ link: serialize(link) });
}

export async function DELETE(request: Request) {
  const auth = await requireApiPermission("settings:admin");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ message: "Missing id" }, { status: 400 });

  await prisma.reportShareLink.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
