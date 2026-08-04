import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { interviewCreateSchema } from "@/lib/validation/interview";
import { pushInterviewToGoogle } from "@/lib/google/interview-sync";
import { requireApiPermission } from "@/lib/auth/route-auth";

export async function POST(request: Request) {
  const authResult = await requireApiPermission("calendar:write");
  if (!authResult.ok) {
    return (authResult as { ok: false; response: Response }).response;
  }

  try {
    const payload = interviewCreateSchema.parse(await request.json());

    const candidate = await prisma.candidate.findUnique({
      where: { id: payload.candidateId },
      select: { id: true, displayName: true }
    });

    if (!candidate) {
      return NextResponse.json({ message: "Candidate not found." }, { status: 404 });
    }

    if (payload.jobId) {
      const job = await prisma.job.findUnique({
        where: { id: payload.jobId },
        select: { id: true }
      });

      if (!job) {
        return NextResponse.json({ message: "Job not found." }, { status: 404 });
      }
    }

    const attendeesJson =
      payload.email || payload.phone
        ? JSON.stringify({ email: payload.email, phone: payload.phone })
        : null;

    const interview = await prisma.interview.create({
      data: {
        candidateId: payload.candidateId,
        jobId: payload.jobId,
        title: payload.title,
        interviewType: payload.interviewType,
        startDateTime: payload.startDate,
        endDateTime: payload.endDate,
        timezone: payload.timezone,
        interviewer: payload.interviewer,
        location: payload.location,
        meetingUrl: payload.meetingUrl,
        notes: payload.notes,
        attendeesJson,
        status: payload.status,
        source: "local-calendar"
      },
      select: {
        id: true,
        title: true,
        startDateTime: true,
        endDateTime: true,
        status: true
      }
    });

    await prisma.auditEvent.create({
      data: {
        eventType: "INTERVIEW_SCHEDULED",
        entityType: "Interview",
        entityId: interview.id,
        summary: `Scheduled ${interview.title} for ${candidate.displayName}.`,
        payloadJson: JSON.stringify({
          candidateId: candidate.id,
          jobId: payload.jobId,
          source: "local-calendar"
        })
      }
    });

    // Push to Google Calendar (no-op if not configured; won't block response on failure)
    await pushInterviewToGoogle(interview.id);

    return NextResponse.json({
      ok: true,
      message: "Interview scheduled.",
      interview: {
        ...interview,
        startDateTime: interview.startDateTime.toISOString(),
        endDateTime: interview.endDateTime?.toISOString() ?? null
      }
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Validation failed.",
          issues: error.issues
        },
        { status: 400 }
      );
    }

    console.error(error);
    return NextResponse.json({ message: "Unable to schedule interview." }, { status: 500 });
  }
}
