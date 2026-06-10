import { prisma } from "@/lib/prisma";
import {
  isGoogleCalendarConfigured,
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
  listGoogleEvents,
  getSharedCalendarId
} from "@/lib/google/calendar";
import { interviewTypeMeta } from "@/lib/calendar/interview-types";

type InterviewForSync = {
  id: string;
  title: string;
  interviewType: string;
  startDateTime: Date;
  endDateTime: Date | null;
  timezone: string | null;
  location: string | null;
  notes: string | null;
  status: string;
  googleEventId: string | null;
  candidate: { displayName: string; primaryEmail: string | null };
  job: { title: string; department: string | null } | null;
};

function buildEventInput(interview: InterviewForSync) {
  const meta = interviewTypeMeta(interview.interviewType);
  const start = interview.startDateTime;
  const end = interview.endDateTime ?? new Date(start.getTime() + 60 * 60 * 1000);

  // Title shows candidate + stage; department prefix if available
  const deptPrefix = interview.job?.department ? `[${interview.job.department}] ` : "";
  const summary = `${deptPrefix}${meta.shortLabel}: ${interview.candidate.displayName}`;

  const descriptionLines = [
    `Stage: ${meta.label}`,
    interview.job ? `Role: ${interview.job.title}` : null,
    interview.candidate.primaryEmail ? `Candidate email: ${interview.candidate.primaryEmail}` : null,
    interview.notes ? `\nNotes:\n${interview.notes}` : null,
    `\n— Synced from SkyShare Talent (id: ${interview.id})`
  ].filter(Boolean);

  return {
    summary,
    description: descriptionLines.join("\n"),
    location: interview.location ?? undefined,
    start,
    end,
    timezone: interview.timezone,
    colorId: meta.googleColorId,
    status: (interview.status === "CANCELLED" ? "cancelled" : "confirmed") as "confirmed" | "cancelled"
  };
}

const interviewInclude = {
  candidate: { select: { displayName: true, primaryEmail: true } },
  job: { select: { title: true, department: true } }
} as const;

/**
 * Push a single interview to Google Calendar (create or update).
 * Safe no-op if Google isn't configured. Never throws to the caller —
 * sync failures are recorded on the interview's syncStatus.
 */
export async function pushInterviewToGoogle(interviewId: string): Promise<void> {
  if (!isGoogleCalendarConfigured()) return;

  const interview = (await prisma.interview.findUnique({
    where: { id: interviewId },
    include: interviewInclude
  })) as InterviewForSync | null;

  if (!interview) return;

  try {
    const input = buildEventInput(interview);

    if (interview.googleEventId) {
      await updateGoogleEvent(interview.googleEventId, input);
    } else {
      const eventId = await createGoogleEvent(input);
      if (eventId) {
        await prisma.interview.update({
          where: { id: interviewId },
          data: { googleEventId: eventId, googleCalendarId: getSharedCalendarId() }
        });
      }
    }

    await prisma.interview.update({
      where: { id: interviewId },
      data: { lastSyncedAt: new Date(), syncStatus: "SYNCED" }
    });
  } catch (error) {
    console.error("Failed to push interview to Google:", error);
    await prisma.interview.update({
      where: { id: interviewId },
      data: { syncStatus: "ERROR" }
    });
  }
}

/** Remove an interview's event from Google (used on delete). */
export async function removeInterviewFromGoogle(googleEventId: string | null): Promise<void> {
  if (!isGoogleCalendarConfigured() || !googleEventId) return;
  try {
    await deleteGoogleEvent(googleEventId);
  } catch (error) {
    console.error("Failed to delete Google event:", error);
  }
}

export type PullResult = {
  ok: boolean;
  updated: number;
  cancelled: number;
  message: string;
};

/**
 * Pull changes from Google back into local interviews (two-way sync).
 * Reconciles events we created (matched by googleEventId):
 *  - time/location changes update the local interview
 *  - cancelled/deleted Google events mark the local interview CANCELLED
 * New Google-only events are ignored (no candidate to link).
 */
export async function pullGoogleChanges(): Promise<PullResult> {
  if (!isGoogleCalendarConfigured()) {
    return { ok: false, updated: 0, cancelled: 0, message: "Google Calendar is not configured." };
  }

  // Load (or create) the singleton connection row to hold the sync token
  let connection = await prisma.googleCalendarConnection.findFirst();
  if (!connection) {
    connection = await prisma.googleCalendarConnection.create({
      data: {
        calendarId: getSharedCalendarId(),
        syncDirection: "TWO_WAY"
      }
    });
  }

  let updated = 0;
  let cancelled = 0;

  try {
    let result;
    try {
      result = await listGoogleEvents(connection.syncToken);
    } catch (error: unknown) {
      // 410 GONE → sync token expired, do a full resync
      const code = (error as { code?: number })?.code;
      if (code === 410) {
        result = await listGoogleEvents(null);
      } else {
        throw error;
      }
    }

    for (const event of result.events) {
      if (!event.id) continue;

      const local = await prisma.interview.findFirst({
        where: { googleEventId: event.id }
      });
      if (!local) continue; // not one of ours

      // Deleted/cancelled in Google
      if (event.status === "cancelled") {
        if (local.status !== "CANCELLED") {
          await prisma.interview.update({
            where: { id: local.id },
            data: { status: "CANCELLED", lastSyncedAt: new Date(), syncStatus: "SYNCED" }
          });
          cancelled += 1;
        }
        continue;
      }

      // Time changes from Google
      const newStart = event.start?.dateTime ? new Date(event.start.dateTime) : null;
      const newEnd = event.end?.dateTime ? new Date(event.end.dateTime) : null;
      const newLocation = event.location ?? null;

      const startChanged = newStart && newStart.getTime() !== local.startDateTime.getTime();
      const endChanged =
        newEnd && (!local.endDateTime || newEnd.getTime() !== local.endDateTime.getTime());
      const locationChanged = newLocation !== local.location;

      if (startChanged || endChanged || locationChanged) {
        await prisma.interview.update({
          where: { id: local.id },
          data: {
            ...(newStart && { startDateTime: newStart }),
            ...(newEnd && { endDateTime: newEnd }),
            location: newLocation,
            lastSyncedAt: new Date(),
            syncStatus: "SYNCED"
          }
        });
        updated += 1;
      }
    }

    // Persist new sync token
    await prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: {
        syncToken: result.nextSyncToken ?? connection.syncToken,
        lastSyncedAt: new Date(),
        lastSyncStatus: "SUCCESS",
        lastSyncError: null,
        syncDirection: "TWO_WAY"
      }
    });

    return {
      ok: true,
      updated,
      cancelled,
      message: `Pulled ${updated} update${updated === 1 ? "" : "s"} and ${cancelled} cancellation${cancelled === 1 ? "" : "s"} from Google.`
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";
    await prisma.googleCalendarConnection.update({
      where: { id: connection.id },
      data: { lastSyncStatus: "ERROR", lastSyncError: message, lastSyncedAt: new Date() }
    });
    return { ok: false, updated, cancelled, message: `Sync failed: ${message}` };
  }
}

/**
 * Push all local interviews that don't yet have a Google event (initial backfill).
 */
export async function pushAllUnsyncedInterviews(): Promise<{ pushed: number }> {
  if (!isGoogleCalendarConfigured()) return { pushed: 0 };

  const unsynced = await prisma.interview.findMany({
    where: { googleEventId: null, status: { not: "CANCELLED" } },
    select: { id: true }
  });

  let pushed = 0;
  for (const { id } of unsynced) {
    await pushInterviewToGoogle(id);
    pushed += 1;
  }

  return { pushed };
}
