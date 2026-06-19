import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id, noteId } = await params;
  const note = await prisma.candidateNote.findUnique({ where: { id: noteId }, select: { id: true, candidateId: true } });
  if (!note || note.candidateId !== id) {
    return NextResponse.json({ message: "Note not found." }, { status: 404 });
  }

  await prisma.candidateNote.delete({ where: { id: noteId } });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_NOTE_DELETED",
    description: "Removed a candidate note",
    entityType: "Candidate",
    entityId: id
  });

  return NextResponse.json({ ok: true, deletedId: noteId });
}
