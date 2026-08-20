import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { hasPermission } from "@/lib/auth/roles";
import { canAnnotateCandidate, isCandidateVisible } from "@/lib/auth/candidate-scope";
import { logActivity } from "@/lib/activity/logger";
import { sanitizeRichText, richTextToPlain, extractMentions } from "@/lib/richtext/sanitize";
import { notifyMentions } from "@/lib/notifications/mentions";

/**
 * Editing and deleting a note. Same grant as the POST route this pairs with —
 * an allowlist-scoped viewer may annotate a candidate they were given — but a
 * narrower one: they may only change a note THEY wrote. Holding candidates:write
 * is unchanged and still covers every note on every candidate.
 */

const forbidden = () =>
  NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });

const noteNotFound = () => NextResponse.json({ message: "Note not found." }, { status: 404 });

/**
 * Did this caller write this note?
 *
 * Authorship is CandidateNote.authorId, which the POST route only sets when the
 * session maps to a real User row. A note with no author recorded — an import,
 * an emailed mention reply, or a local-bypass session — belongs to nobody, so it
 * is not an allowlisted annotator's to edit or delete.
 */
function wroteIt(userId: string | null, authorId: string | null | undefined): boolean {
  return Boolean(userId) && Boolean(authorId) && userId === authorId;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; noteId: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const { id, noteId } = await params;

  // Off-allowlist candidates answer as if the note simply is not there, so the
  // 404/403 split can never confirm that a person exists. Checked before the
  // lookup for the same reason.
  if (!isCandidateVisible(auth.user.viewer, id)) return noteNotFound();

  const canWriteAnyNote = hasPermission(auth.user.role, "candidates:write");
  if (!canWriteAnyNote && !canAnnotateCandidate(auth.user.viewer, id)) return forbidden();

  const note = await prisma.candidateNote.findUnique({
    where: { id: noteId },
    include: { candidate: { select: { id: true, displayName: true } } }
  });
  if (!note || note.candidateId !== id) {
    return noteNotFound();
  }

  // The per-row half of the grant. Safe to answer 403 here rather than 404: the
  // candidate is already one this viewer may read, so the note's existence is
  // not news to them — only the right to change it is being refused.
  if (!canWriteAnyNote && !wroteIt(auth.user.id, note.authorId)) return forbidden();

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
      mentionedBy: auth.user?.email ?? null,
      noteId
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
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const { id, noteId } = await params;

  if (!isCandidateVisible(auth.user.viewer, id)) return noteNotFound();

  const canWriteAnyNote = hasPermission(auth.user.role, "candidates:write");
  if (!canWriteAnyNote && !canAnnotateCandidate(auth.user.viewer, id)) return forbidden();

  const note = await prisma.candidateNote.findUnique({
    where: { id: noteId },
    select: { id: true, candidateId: true, authorId: true }
  });
  if (!note || note.candidateId !== id) {
    return noteNotFound();
  }

  if (!canWriteAnyNote && !wroteIt(auth.user.id, note.authorId)) return forbidden();

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
