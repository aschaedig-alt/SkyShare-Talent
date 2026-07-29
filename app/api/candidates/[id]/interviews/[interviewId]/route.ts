import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { sanitizeRichText, richTextToPlain, extractMentions } from "@/lib/richtext/sanitize";
import { INTERVIEW_OUTCOMES } from "@/lib/interviews/constants";
import { notifyMentions } from "@/lib/notifications/mentions";

/**
 * Edit or remove an interview WRITE-UP.
 *
 * Deliberately separate from /api/interviews/[id] — that route is the
 * scheduling flow (calendar:write, pushes to Google Calendar) and a logged
 * write-up has neither a calendar event nor that permission's blast radius.
 * Same reasoning as the POST route this pairs with.
 */

type Ctx = { params: Promise<{ id: string; interviewId: string }> };

function clampRating(value: unknown): number | null | undefined {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const n = Math.round(value);
  return n >= 1 && n <= 5 ? n : undefined;
}

async function loadOwned(id: string, interviewId: string) {
  return prisma.interview.findFirst({
    where: { id: interviewId, candidateId: id },
    include: { candidate: { select: { id: true, displayName: true } } }
  });
}

export async function PATCH(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id, interviewId } = await ctx.params;
  const existing = await loadOwned(id, interviewId);
  if (!existing) return NextResponse.json({ message: "Interview not found." }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const data: Record<string, unknown> = {};

  if (typeof body.notesHtml === "string") {
    const html = sanitizeRichText(body.notesHtml);
    const plain = richTextToPlain(html);
    if (plain.trim().length < 1) {
      return NextResponse.json({ message: "The write-up can't be emptied out — delete it instead." }, { status: 400 });
    }
    data.notesHtml = html.slice(0, 120000);
    data.notes = plain.slice(0, 20000);
    data.mentionsJson = (() => {
      const m = extractMentions(html);
      return m.length ? JSON.stringify(m) : null;
    })();
  }

  if (typeof body.interviewedAt === "string") {
    const when = new Date(body.interviewedAt);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ message: "That interview date isn't valid." }, { status: 400 });
    }
    data.startDateTime = when;
  }

  if (typeof body.interviewerEmail === "string" && body.interviewerEmail.trim()) {
    data.interviewerEmail = body.interviewerEmail.trim().toLowerCase();
    if (typeof body.interviewerName === "string") data.interviewer = body.interviewerName.trim() || data.interviewerEmail;
  }

  if (body.outcome === null || (typeof body.outcome === "string" && INTERVIEW_OUTCOMES.some((o) => o.value === body.outcome))) {
    data.outcome = body.outcome;
  }

  if ("rating" in body) {
    const rating = clampRating(body.rating);
    if (rating === undefined) return NextResponse.json({ message: "Rating has to be 1 to 5." }, { status: 400 });
    data.rating = rating;
  }

  if ("nextStep" in body) {
    data.nextStep =
      typeof body.nextStep === "string" && body.nextStep.trim() ? body.nextStep.trim().slice(0, 300) : null;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ message: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.interview.update({ where: { id: interviewId }, data });

  // Only notify about mentions that are NEW in this edit, so re-saving a note
  // does not re-notify someone already told about it.
  if (typeof data.mentionsJson === "string" || data.mentionsJson === null) {
    const before = new Set(JSON.parse(existing.mentionsJson ?? "[]") as string[]);
    const after = new Set(JSON.parse((data.mentionsJson as string | null) ?? "[]") as string[]);
    const newlyMentioned = [...after].filter((e) => !before.has(e));
    if (newlyMentioned.length) {
      await notifyMentions({
        emails: newlyMentioned,
        candidateId: id,
        candidateName: existing.candidate.displayName,
        context: "interview",
        mentionedBy: auth.user?.email ?? null,
        interviewId
      });
    }
  }

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Edited an interview write-up for ${existing.candidate.displayName}`,
    entityType: "Candidate",
    entityId: id,
    metadata: { interviewId }
  });

  return NextResponse.json({
    ok: true,
    interview: {
      id: updated.id,
      startDateTime: updated.startDateTime.toISOString(),
      interviewer: updated.interviewer,
      interviewerEmail: updated.interviewerEmail,
      notes: updated.notes,
      notesHtml: updated.notesHtml,
      outcome: updated.outcome,
      rating: updated.rating,
      nextStep: updated.nextStep
    }
  });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id, interviewId } = await ctx.params;
  const existing = await loadOwned(id, interviewId);
  if (!existing) return NextResponse.json({ message: "Interview not found." }, { status: 404 });

  await prisma.interview.delete({ where: { id: interviewId } });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Deleted an interview write-up for ${existing.candidate.displayName}`,
    entityType: "Candidate",
    entityId: id,
    metadata: { interviewId }
  });

  return NextResponse.json({ ok: true });
}
