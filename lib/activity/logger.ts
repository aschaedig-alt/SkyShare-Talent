import { prisma } from "@/lib/prisma";

export type ActivityType =
  | "CANDIDATE_CREATED"
  | "CANDIDATE_EDITED"
  | "CANDIDATE_DELETED"
  | "CANDIDATE_NOTE_CREATED"
  | "CANDIDATE_NOTE_DELETED"
  | "CANDIDATE_AI_SUMMARY"
  | "JOB_CREATED"
  | "JOB_EDITED"
  | "JOB_DELETED"
  | "IMPORT_STARTED"
  | "IMPORT_COMPLETED"
  | "DUPLICATE_RESOLVED"
  // A pool-wide duplicate SCAN, as distinct from resolving one pair. Expensive and
  // it writes review items across the whole candidate pool, so who ran it is worth
  // recording - see app/api/duplicate-review/candidates/scan/route.ts.
  | "DUPLICATE_SCAN_RUN"
  | "OFFER_STATUS_CHANGED"
  | "INTERVIEW_SCHEDULED"
  | "INTERVIEW_UPDATED"
  | "INTERVIEW_CANCELED"
  | "PERMISSION_CHANGED"
  | "USER_LOGIN"
  | "USER_LOGOUT"
  | "AUTH_SIGN_IN_ATTEMPT"
  | "USER_DELETED"
  // An email that did NOT reach its real recipient. Written from whichever
  // machine sent it — and because local dev and production share one database,
  // a redirect that happened on a laptop shows up on the live Activity page.
  | "EMAIL_REDIRECTED_TO_TEST"
  | "EMAIL_SEND_BLOCKED"
  // Rotating the public new-hire contacts share link. Recorded because it
  // silently breaks a link somebody is already holding — when a new hire reports
  // a dead contacts link, "who rotated it and when" is the question asked.
  | "SHARE_LINK_ROTATED";

export interface ActivityLogPayload {
  userId?: string;
  userEmail?: string;
  activityType: ActivityType;
  description: string;
  entityType?: string;
  entityId?: string;
  // string[] is allowed because this is JSON.stringify'd on the way in — a list
  // of recipients is the natural shape for an email log entry, and flattening it
  // to a joined string would mean re-splitting on a delimiter that can legally
  // appear inside a display name.
  metadata?: Record<string, string | number | boolean | null | string[]>;
}

export async function logActivity(payload: ActivityLogPayload) {
  try {
    await prisma.activityLog.create({
      data: {
        userId: payload.userId,
        userEmail: payload.userEmail,
        activityType: payload.activityType,
        description: payload.description,
        entityType: payload.entityType,
        entityId: payload.entityId,
        metadata: payload.metadata ? JSON.stringify(payload.metadata) : null,
      },
    });
  } catch (error) {
    // Log to console but don't fail the request
    console.error("Failed to log activity:", error);
  }
}

interface ActivityStatsOptions {
  userId?: string;
  activityType?: ActivityType;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
}

export async function getActivityStats(options?: ActivityStatsOptions) {
  const where: Record<string, unknown> = {};

  if (options?.userId) where.userId = options.userId;
  if (options?.activityType) where.activityType = options.activityType;
  if (options?.startDate || options?.endDate) {
    where.createdAt = {
      ...(options?.startDate && { gte: options.startDate }),
      ...(options?.endDate && { lte: options.endDate }),
    };
  }

  const logs = await prisma.activityLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: options?.limit || 100,
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  return logs;
}

export async function getUserActivitySummary(userId: string, days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const activities = await prisma.activityLog.findMany({
    where: {
      userId,
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: "desc" },
  });

  // Count by activity type
  const byType: Record<string, number> = {};
  const byDate: Record<string, number> = {};

  activities.forEach((activity) => {
    // Count by type
    byType[activity.activityType] = (byType[activity.activityType] || 0) + 1;

    // Count by date
    const dateKey = activity.createdAt.toISOString().split("T")[0];
    byDate[dateKey] = (byDate[dateKey] || 0) + 1;
  });

  const summary = {
    total: activities.length,
    byType,
    byDate,
  };

  return summary;
}

export async function getTeamActivitySummary(days: number = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const activities = await prisma.activityLog.findMany({
    where: {
      createdAt: { gte: startDate },
    },
    orderBy: { createdAt: "desc" },
    include: {
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  // Count by activity type
  const byType: Record<string, number> = {};
  const byUser: Record<string, number> = {};

  activities.forEach((activity) => {
    byType[activity.activityType] = (byType[activity.activityType] || 0) + 1;
    const userKey = activity.user?.name || activity.userEmail || "Unknown";
    byUser[userKey] = (byUser[userKey] || 0) + 1;
  });

  return {
    total: activities.length,
    byType,
    byUser,
    recentActivities: activities.slice(0, 20),
  };
}
