import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { interviewUpdateSchema } from "@/lib/validation/interview";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";

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

    const interview = await prisma.interview.update({
      where: { id },
      data: {
        ...(payload.jobId !== undefined && { jobId: payload.jobId }),
        ...(payload.title !== undefined && { title: payload.title }),
        ...(payload.startDate !== undefined && { startDateTime: payload.startDate }),
        ...(payload.endDate !== undefined && { endDateTime: payload.endDate }),
        ...(payload.timezone !== undefined && { timezone: payload.timezone }),
        ...(payload.interviewer !== undefined && { interviewer: payload.interviewer }),
        ...(payload.location !== undefined && { location: payload.location }),
        ...(payload.meetingUrl !== undefined && { meetingUrl: payload.meetingUrl }),
        ...(payload.notes !== undefined && { notes: payload.notes }),
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
