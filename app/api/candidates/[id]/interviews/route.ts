import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { sanitizeRichText, richTextToPlain, extractMentions } from "@/lib/richtext/sanitize";
import { INTERVIEW_OUTCOMES } from "@/lib/interviews/constants";

/**
 * Log an interview that ALREADY HAPPENED, with the write-up pasted in.
 *
 * Separate from /api/interviews on purpose. That route schedules a future
 * interview and pushes it to Google Calendar; this one records history —
 * interviews are still being run in Paycom, and the write-up is copied across
 * afterwards. Forcing one route to do both would mean a scheduling flow that
 * sometimes must not touch the calendar.
 *
 * The DATE is the date of the interview, not of the typing, because that is
 * what the recent-interviews filter counts from.
 */

type Ctx = { params: Promise<{ id: string }> };

function clampRating(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  return n >= 1 && n <= 5 ? n : null;
}

export async function POST(request: Request, ctx: Ctx) {
  const auth = await requireApiPermission("candidates:write");
  if (!auth.ok) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    select: { id: true, displayName: true }
  });
  if (!candidate) return NextResponse.json({ message: "Candidate not found." }, { status: 404 });

  const notesHtml = typeof body.notesHtml === "string" ? sanitizeRichText(body.notesHtml) : "";
  const plain = richTextToPlain(notesHtml);
  if (plain.trim().length < 1) {
    return NextResponse.json({ message: "Add the interview notes before saving." }, { status: 400 });
  }

  // The interview DATE decides whether this candidate shows under 30/60/90
  // days, so a bad one quietly hides the person. Refuse it rather than
  // defaulting to today and pretending.
  const when = typeof body.interviewedAt === "string" ? new Date(body.interviewedAt) : null;
  if (!when || Number.isNaN(when.getTime())) {
    return NextResponse.json({ message: "Pick the date the interview happened." }, { status: 400 });
  }

  const outcome = typeof body.outcome === "string" && INTERVIEW_OUTCOMES.some((o) => o.value === body.outcome)
    ? body.outcome
    : null;

  const interviewerName = typeof body.interviewerName === "string" ? body.interviewerName.trim() : "";
  const interviewerEmail = typeof body.interviewerEmail === "string" ? body.interviewerEmail.trim().toLowerCase() : "";
  if (!interviewerEmail) {
    return NextResponse.json({ message: "Choose who ran the interview." }, { status: 400 });
  }

  const mentions = extractMentions(notesHtml);
  const interview = await prisma.interview.create({
    data: {
      candidateId: id,
      title: typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Interview",
      interviewType: typeof body.interviewType === "string" && body.interviewType ? body.interviewType : "RECRUITER_SCREEN",
      startDateTime: when,
      interviewer: interviewerName || interviewerEmail,
      interviewerEmail,
      notes: plain.slice(0, 20000),
      notesHtml: notesHtml.slice(0, 120000),
      outcome,
      rating: clampRating(body.rating),
      mentionsJson: mentions.length ? JSON.stringify(mentions) : null,
      // Already happened — this is a record, not a booking.
      status: "COMPLETED",
      source: "manual-writeup"
    }
  });

  await logActivity({
    userId: auth.user?.id,
    userEmail: auth.user?.email || undefined,
    activityType: "CANDIDATE_EDITED",
    description: `Logged an interview for ${candidate.displayName}`,
    entityType: "Candidate",
    entityId: id,
    metadata: { interviewId: interview.id, interviewer: interviewerEmail }
  });

  return NextResponse.json({ ok: true, interviewId: interview.id, mentions });
}
