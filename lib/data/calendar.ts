import { prisma } from "@/lib/prisma";

export type CalendarData = {
  stats: {
    scheduled: number;
    completed: number;
    thisWeek: number;
    candidates: number;
  };
  candidates: Array<{
    id: string;
    displayName: string;
    currentTitle: string | null;
  }>;
  jobs: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  interviews: Array<{
    id: string;
    title: string;
    startDateTime: string;
    endDateTime: string | null;
    timezone: string | null;
    interviewer: string | null;
    location: string | null;
    meetingUrl: string | null;
    status: string;
    notes: string | null;
    candidate: {
      id: string;
      displayName: string;
      currentTitle: string | null;
    };
    job: {
      id: string;
      title: string;
      status: string;
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

  const [interviews, candidates, jobs, scheduled, completed, thisWeek] = await Promise.all([
    prisma.interview.findMany({
      take: 100,
      orderBy: { startDateTime: "asc" },
      include: {
        candidate: {
          select: {
            id: true,
            displayName: true,
            currentTitle: true
          }
        },
        job: {
          select: {
            id: true,
            title: true,
            status: true
          }
        }
      }
    }),
    prisma.candidate.findMany({
      take: 200,
      orderBy: { displayName: "asc" },
      select: {
        id: true,
        displayName: true,
        currentTitle: true
      }
    }),
    prisma.job.findMany({
      take: 200,
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
    })
  ]);

  return {
    stats: {
      scheduled,
      completed,
      thisWeek,
      candidates: candidates.length
    },
    candidates,
    jobs,
    interviews: interviews.map((interview) => ({
      id: interview.id,
      title: interview.title,
      startDateTime: interview.startDateTime.toISOString(),
      endDateTime: interview.endDateTime?.toISOString() ?? null,
      timezone: interview.timezone,
      interviewer: interview.interviewer,
      location: interview.location,
      meetingUrl: interview.meetingUrl,
      status: interview.status,
      notes: interview.notes,
      candidate: interview.candidate,
      job: interview.job
    }))
  };
}
