import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { sanitizeRichText, richTextToPlain, extractMentions } from "@/lib/richtext/sanitize";
import { notifyMentions } from "@/lib/notifications/mentions";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id, noteId } = await params;
  const note = await prisma.candidateNote.findUnique({
    where: { id: noteId },
    include: { candidate: { select: { id: true, displayName: true } } }
  });
  if (!note || note.candidateId !== id) {
    return NextResponse.json({ message: "Note not found." }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as { bodyHtml?: unknown };
  const html = typeof body.bodyHtml === "string" ? sanitizeRichText(body.bodyHtml) : "";
  const text = richTextToPlain(html);
  if (text.trim().length < 1) {
    return NextResponse.json({ message: "The note can't be emptied out — delete it instead." }, { status: 400 });
  }

  const mentions = extractMentions(html);
  const updated = await prisma.candidateNote.update({
    where: { id: noteId },
    data: {
      body: text.slice(0, 20000),
      bodyHtml: html.slice(0, 60000),
      mentionsJson: mentions.length ? JSON.stringify(mentions) : null
    },
    include: { author: { select: { name: true, email: true } } }
  });

  const before = new Set(JSON.parse(note.mentionsJson ?? "[]") as string[]);
  const newlyMentioned = mentions.filter((e) => !before.has(e));
  if (newlyMentioned.length) {
    await notifyMentions({
      emails: newlyMentioned,
      candidateId: id,
      candidateName: note.candidate.displayName,
      context: "note",
      mentionedBy: auth.user?.email ?? null
    });
  }

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Edited a note on ${note.candidate.displayName}`,
    entityType: "Candidate",
    entityId: id
  });

  return NextResponse.json({
    ok: true,
    note: {
      id: updated.id,
      body: updated.body,
      bodyHtml: updated.bodyHtml,
      source: updated.source,
      author: updated.author?.name ?? updated.author?.email ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    }
  });
}

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
