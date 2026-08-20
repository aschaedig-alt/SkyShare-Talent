import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser, authFailureResponse } from "@/lib/auth/route-auth";
import { hasPermission } from "@/lib/auth/roles";
import { canAnnotateCandidate, isCandidateVisible } from "@/lib/auth/candidate-scope";
import { logActivity } from "@/lib/activity/logger";
import { sanitizeRichText, richTextToPlain, extractMentions } from "@/lib/richtext/sanitize";
import { notifyMentions } from "@/lib/notifications/mentions";

/**
 * Writing a note is one of the very few write paths an allowlist-scoped viewer
 * gets, so this no longer demands candidates:write outright — a hiring manager
 * brought in for a specific search can record what they thought of the people
 * they interviewed, which is the entire point of giving them access.
 *
 * The permission is checked FIRST and canAnnotateCandidate is only the fallback,
 * so nobody who already held candidates:write is routed through the allowlist at
 * all. Under the local-dev auth bypass the role is ADMIN, so the permission
 * answers and nothing changes locally.
 */

const forbidden = () =>
  NextResponse.json({ message: "You do not have permission to perform this action." }, { status: 403 });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return authFailureResponse(auth);

  const { id } = await params;

  // Fail closed before anything else, and 404 rather than 403: an off-allowlist
  // candidate has to answer exactly as if the record did not exist, or a write
  // attempt becomes a way to probe whether a given person is in the system —
  // which is the fact the allowlist exists to hide.
  if (!isCandidateVisible(auth.user.viewer, id)) {
    return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
  }

  if (!hasPermission(auth.user.role, "candidates:write") && !canAnnotateCandidate(auth.user.viewer, id)) {
    return forbidden();
  }

  const body = (await request.json().catch(() => ({}))) as { body?: unknown; bodyHtml?: unknown };

  // A formatted note arrives as HTML and is sanitized here — never trusted from
  // the client. `body` keeps a plain-text copy so search and every existing
  // reader of this column carry on working unchanged.
  const html = typeof body.bodyHtml === "string" ? sanitizeRichText(body.bodyHtml) : "";
  const text = html
    ? richTextToPlain(html)
    : typeof body.body === "string"
      ? body.body.trim()
      : "";
  if (text.length < 1) return NextResponse.json({ message: "Note text is required." }, { status: 400 });

  const candidate = await prisma.candidate.findUnique({ where: { id }, select: { id: true, displayName: true } });
  if (!candidate) return NextResponse.json({ message: "Candidate not found." }, { status: 404 });

  // Only attribute to a real User row (dev/bypass sessions may not have one).
  let authorId: string | null = null;
  if (auth.user?.id) {
    const user = await prisma.user.findUnique({ where: { id: auth.user.id }, select: { id: true } });
    if (user) authorId = user.id;
  }

  const mentions = extractMentions(html);
  const note = await prisma.candidateNote.create({
    data: {
      candidateId: id,
      body: text.slice(0, 20000),
      bodyHtml: html ? html.slice(0, 60000) : null,
      mentionsJson: mentions.length ? JSON.stringify(mentions) : null,
      source: "Manual",
      authorId
    },
    include: { author: { select: { name: true, email: true } } }
  });

  if (mentions.length) {
    await notifyMentions({
      emails: mentions,
      candidateId: id,
      candidateName: candidate.displayName,
      context: "note",
      mentionedBy: auth.user?.email ?? null,
      noteId: note.id
    });
  }

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
      bodyHtml: note.bodyHtml,
      mentions,
      source: note.source,
      author: note.author?.name ?? note.author?.email ?? null,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString()
    }
  });
}
