import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { body?: unknown };
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (text.length < 1) return NextResponse.json({ message: "Note text is required." }, { status: 400 });

  const candidate = await prisma.candidate.findUnique({ where: { id }, select: { id: true, displayName: true } });
  if (!candidate) return NextResponse.json({ message: "Candidate not found." }, { status: 404 });

  // Only attribute to a real User row (dev/bypass sessions may not have one).
  let authorId: string | null = null;
  if (auth.user?.id) {
    const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { id: true } });
    if (user) authorId = user.id;
  }

  const note = await prisma.candidateNote.create({
    data: { candidateId: id, body: text.slice(0, 5000), source: "Manual", authorId },
    include: { author: { select: { name: true, email: true } } }
  });

  await logActivity({
    userId: authorId ?? undefined,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_NOTE_CREATED",
    description: `Added a note to ${candidate.displayName}`,
    entityType: "Candidate",
    entityId: id
  });

  return NextResponse.json({
    ok: true,
    note: {
      id: note.id,
      body: note.body,
      source: note.source,
      author: note.author?.name ?? note.author?.email ?? null,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString()
    }
  });
}
