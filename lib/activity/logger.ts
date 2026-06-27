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
  | "INTERVIEW_SCHEDULED"
  | "INTERVIEW_UPDATED"
  | "INTERVIEW_CANCELED"
  | "PERMISSION_CHANGED"
  | "USER_LOGIN"
  | "USER_LOGOUT";

export interface ActivityLogPayload {
  userId?: string;
  userEmail?: string;
  activityType: ActivityType;
  description: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, string | number | boolean | null>;
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
