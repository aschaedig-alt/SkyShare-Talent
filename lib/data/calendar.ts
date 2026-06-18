import { prisma } from "@/lib/prisma";
import { isGoogleCalendarConfigured } from "@/lib/google/calendar";

export type CalendarCandidate = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  email: string | null;
  phone: string | null;
  appliedJobs: Array<{ id: string; title: string }>;
};

export type CalendarData = {
  stats: {
    scheduled: number;
    completed: number;
    thisWeek: number;
    candidates: number;
  };
  candidates: CalendarCandidate[];
  jobs: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  /** Recruiting team / hiring managers, keyed by name, for timeline avatars. */
  teamHosts: Array<{ name: string; avatarUrl: string | null }>;
  sync: {
    configured: boolean;
    direction: string | null;
    lastSyncedAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
  };
  interviews: Array<{
    id: string;
    title: string;
    interviewType: string;
    startDateTime: string;
    endDateTime: string | null;
    timezone: string | null;
    interviewer: string | null;
    location: string | null;
    meetingUrl: string | null;
    status: string;
    notes: string | null;
    googleEventId: string | null;
    syncStatus: string | null;
    candidate: {
      id: string;
      displayName: string;
      currentTitle: string | null;
      email: string | null;
      phone: string | null;
    };
    job: {
      id: string;
      title: string;
      status: string;
      department: string | null;
    } | null;
  }>;
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export async function getCalendarData(): Promise<CalendarData> {
  const now = new Date();
  const weekEnd = addDays(now, 7);

  const [interviews, candidates, jobs, scheduled, completed, thisWeek, connection, teamHosts] = await Promise.all([
    prisma.interview.findMany({
      take: 200,
      orderBy: { startDateTime: "asc" },
      include: {
        candidate: {
          select: {
            id: true,
            displayName: true,
            currentTitle: true,
            primaryEmail: true,
            primaryPhone: true
          }
        },
        job: {
          select: {
            id: true,
            title: true,
            status: true,
            department: true
          }
        }
      }
    }),
    prisma.candidate.findMany({
      take: 500,
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        currentTitle: true,
        primaryEmail: true,
        primaryPhone: true,
        applications: {
          where: { jobId: { not: null } },
          select: {
            job: { select: { id: true, title: true } }
          }
        }
      }
    }),
    prisma.job.findMany({
      take: 300,
      where: { mergedIntoJobId: null },
      orderBy: [{ isPilotRole: "desc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        status: true
      }
    }),
    prisma.interview.count({ where: { status: "SCHEDULED" } }),
    prisma.interview.count({ where: { status: "COMPLETED" } }),
    prisma.interview.count({
      where: {
        status: "SCHEDULED",
        startDateTime: {
          gte: now,
          lte: weekEnd
        }
      }
    }),
    prisma.googleCalendarConnection.findFirst(),
    prisma.bookingHost.findMany({ select: { name: true, avatarUrl: true } })
  ]);

  return {
    stats: {
      scheduled,
      completed,
      thisWeek,
      candidates: candidates.length
    },
    candidates: candidates.map((candidate) => {
      // Dedupe applied jobs
      const jobMap = new Map<string, { id: string; title: string }>();
      for (const app of candidate.applications) {
        if (app.job) {
          jobMap.set(app.job.id, app.job);
        }
      }

      return {
        id: candidate.id,
        displayName: candidate.displayName,
        currentTitle: candidate.currentTitle,
        email: candidate.primaryEmail,
        phone: candidate.primaryPhone,
        appliedJobs: Array.from(jobMap.values())
      };
    }),
    jobs,
    teamHosts: teamHosts.map((h) => ({ name: h.name, avatarUrl: h.avatarUrl })),
    sync: {
      configured: isGoogleCalendarConfigured(),
      direction: connection?.syncDirection ?? null,
      lastSyncedAt: connection?.lastSyncedAt?.toISOString() ?? null,
      lastSyncStatus: connection?.lastSyncStatus ?? null,
      lastSyncError: connection?.lastSyncError ?? null
    },
    interviews: interviews.map((interview) => ({
      id: interview.id,
      title: interview.title,
      interviewType: interview.interviewType,
      startDateTime: interview.startDateTime.toISOString(),
      endDateTime: interview.endDateTime?.toISOString() ?? null,
      timezone: interview.timezone,
      interviewer: interview.interviewer,
      location: interview.location,
      meetingUrl: interview.meetingUrl,
      status: interview.status,
      notes: interview.notes,
      googleEventId: interview.googleEventId,
      syncStatus: interview.syncStatus,
      candidate: {
        id: interview.candidate.id,
        displayName: interview.candidate.displayName,
        currentTitle: interview.candidate.currentTitle,
        email: interview.candidate.primaryEmail,
        phone: interview.candidate.primaryPhone
      },
      job: interview.job
    }))
  };
}
