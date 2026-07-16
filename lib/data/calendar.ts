import { prisma } from "@/lib/prisma";
import { isGoogleCalendarConfigured } from "@/lib/google/calendar";
import { parseStringArray } from "@/lib/json";
import { interviewDepartmentRaw } from "@/lib/calendar/departments";

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
    department: string | null;
  }>;
  /** Recruiting team / hiring team, keyed by name, for timeline avatars. */
  teamHosts: Array<{ name: string; avatarUrl: string | null }>;
  /** Active team members offered as interviewer choices (name + their departments). */
  interviewers: Array<{ name: string; role: string; departments: string[] }>;
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
    /**
     * Raw department string for this interview — the linked job's department when
     * there is one, otherwise derived from the candidate's applications. This is
     * what the department filter and the department color-coding read; do NOT go
     * back to `job.department`, which is null for every interview in practice.
     * See interviewDepartmentRaw() in lib/calendar/departments.ts.
     */
    department: string | null;
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

type DepartmentSourceApplication = {
  origin: string;
  appliedAt: Date | null;
  job: { department: string | null } | null;
};

/**
 * Order a candidate's applications by how well each one describes the interview
 * we're about to label: live (Paycom) pipeline applications before archived Jazz
 * ones, then most recently applied first, undated last. Only matters for the
 * handful of candidates who have applied across more than one department.
 */
function byDepartmentRelevance(a: DepartmentSourceApplication, b: DepartmentSourceApplication) {
  const liveA = a.origin === "JAZZ" ? 1 : 0;
  const liveB = b.origin === "JAZZ" ? 1 : 0;
  if (liveA !== liveB) return liveA - liveB;
  const timeA = a.appliedAt?.getTime() ?? -Infinity;
  const timeB = b.appliedAt?.getTime() ?? -Infinity;
  return timeB - timeA;
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
            primaryPhone: true,
            // Only used to derive the interview's department when the interview
            // itself has no linked job (which is the norm — see
            // interviewDepartmentRaw). Ordering matters: the first application
            // with a department wins.
            applications: {
              where: { jobId: { not: null } },
              select: {
                origin: true,
                appliedAt: true,
                job: { select: { department: true } }
              }
            }
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
        status: true,
        department: true
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
    prisma.bookingHost.findMany({ select: { name: true, avatarUrl: true, role: true, isActive: true, departmentsJson: true } })
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
    interviewers: teamHosts
      .filter((h) => h.isActive && h.name.trim())
      .map((h) => ({ name: h.name, role: h.role, departments: parseStringArray(h.departmentsJson) })),
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
      department: interviewDepartmentRaw(
        interview.job?.department,
        [...interview.candidate.applications]
          .sort(byDepartmentRelevance)
          .map((application) => application.job?.department)
      ),
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
