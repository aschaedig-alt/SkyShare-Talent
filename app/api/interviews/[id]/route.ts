import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { extractMentions, richTextToPlain, sanitizeRichText } from "@/lib/richtext/sanitize";
import { plainTextToHtml } from "@/lib/richtext/normalize";
import { interviewUpdateSchema } from "@/lib/validation/interview";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { pushInterviewToGoogle, removeInterviewFromGoogle } from "@/lib/google/interview-sync";
import { getInterviewDetail } from "@/lib/data/interview-detail";

// What the interview drawer loads: the same object /interviews/[id] renders, with
// the same candidate scoping (getInterviewDetail returns null for an
// off-allowlist candidate, so this 404s exactly like the page does).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiPermission("calendar:read");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }
  const { id } = await params;
  const detail = await getInterviewDetail(id, authResult.user.viewer);
  if (!detail) {
    return NextResponse.json({ message: "Interview not found." }, { status: 404 });
  }
  return NextResponse.json(detail);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiPermission("calendar:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  const { id } = await params;

  try {
    const existing = await prisma.interview.findUnique({
      where: { id },
      include: { candidate: { select: { displayName: true } } }
    });

    if (!existing) {
      return NextResponse.json({ message: "Interview not found." }, { status: 404 });
    }

    const payload = interviewUpdateSchema.parse(await request.json());

    // Validate linked job if provided
    if (payload.jobId) {
      const job = await prisma.job.findUnique({ where: { id: payload.jobId }, select: { id: true } });
      if (!job) {
        return NextResponse.json({ message: "Job not found." }, { status: 404 });
      }
    }

    // Notes. An interview's write-up is TWO columns: notesHtml (what the candidate
    // profile shows) and notes (its plain copy, which Google Calendar and search
    // read). The calendar used to write notes only, so on an interview with a
    // write-up the edit never showed on the profile and the pair drifted apart.
    // Now both are always written together (feedback cmwcjtm5k).
    const notesData: Record<string, string | null> = {};
    if (payload.notesHtml !== undefined) {
      const html = payload.notesHtml ? sanitizeRichText(payload.notesHtml) : "";
      const plain = richTextToPlain(html);
      if (plain.trim()) {
        notesData.notesHtml = html.slice(0, 120000);
        notesData.notes = plain.slice(0, 20000);
        const mentions = extractMentions(html);
        notesData.mentionsJson = mentions.length ? JSON.stringify(mentions) : null;
      } else if (existing.notesHtml) {
        // Same rule as the candidate profile's write-up editor.
        return NextResponse.json(
          { message: "This interview has a write-up, so its notes can't be emptied here — delete the write-up from the candidate's profile instead." },
          { status: 400 }
        );
      } else {
        notesData.notesHtml = null;
        notesData.notes = null;
        notesData.mentionsJson = null;
      }
    } else if (payload.notes !== undefined && payload.notes !== existing.notes) {
      // A plain-text caller. Only when the text actually changed, so re-sending an
      // untouched copy never throws away the write-up's formatting.
      notesData.notes = payload.notes;
      if (existing.notesHtml) notesData.notesHtml = payload.notes ? plainTextToHtml(payload.notes) : null;
    }

    const interview = await prisma.interview.update({
      where: { id },
      data: {
        ...notesData,
        ...(payload.jobId !== undefined && { jobId: payload.jobId }),
        ...(payload.title !== undefined && { title: payload.title }),
        ...(payload.interviewType !== undefined && { interviewType: payload.interviewType }),
        ...(payload.startDate !== undefined && { startDateTime: payload.startDate }),
        ...(payload.endDate !== undefined && { endDateTime: payload.endDate }),
        ...(payload.timezone !== undefined && { timezone: payload.timezone }),
        ...(payload.interviewer !== undefined && { interviewer: payload.interviewer }),
        ...(payload.location !== undefined && { location: payload.location }),
        ...(payload.meetingUrl !== undefined && { meetingUrl: payload.meetingUrl }),
        ...(payload.status !== undefined && { status: payload.status })
      },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        status: true
      }
    });

    await logActivity({
      userId: authResult.user.id ?? undefined,
      userEmail: authResult.user.email ?? undefined,
      activityType: payload.status === "CANCELLED" ? "INTERVIEW_CANCELED" : "INTERVIEW_UPDATED",
      description: `Updated interview "${interview.title}" for ${existing.candidate.displayName}`,
      entityType: "Interview",
      entityId: interview.id
    });

    // Sync change to Google Calendar
    await pushInterviewToGoogle(interview.id);

    return NextResponse.json({
      ok: true,
      message: "Interview updated.",
      interview: {
        ...interview,
        startDateTime: interview.startDateTime.toISOString(),
        endDateTime: interview.endDateTime?.toISOString() ?? null
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ message: "Validation failed.", issues: error.issues }, { status: 400 });
    }

    console.error("Error updating interview:", error);
    return NextResponse.json({ message: "Unable to update interview." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authResult = await requireApiPermission("calendar:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  const { id } = await params;

  try {
    const existing = await prisma.interview.findUnique({
      where: { id },
      include: { candidate: { select: { displayName: true } } }
    });

    if (!existing) {
      return NextResponse.json({ message: "Interview not found." }, { status: 404 });
    }

    // Remove from Google Calendar before deleting locally
    await removeInterviewFromGoogle(existing.googleEventId);

    await prisma.interview.delete({ where: { id } });

    await logActivity({
      userId: authResult.user.id ?? undefined,
      userEmail: authResult.user.email ?? undefined,
      activityType: "INTERVIEW_CANCELED",
      description: `Deleted interview "${existing.title}" for ${existing.candidate.displayName}`,
      entityType: "Interview",
      entityId: id
    });

    return NextResponse.json({ ok: true, message: "Interview deleted." });
  } catch (error) {
    console.error("Error deleting interview:", error);
    return NextResponse.json({ message: "Unable to delete interview." }, { status: 500 });
  }
}
