import { prisma } from "@/lib/prisma";
import { getAuthRuntimeStatus } from "@/lib/auth/auth-config";
import { rolePermissions, type RoleName } from "@/lib/auth/roles";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import type { ModuleAccessPolicy } from "@/lib/navigation/modules";

export type SettingsData = {
  environment: {
    appEnvironment: string;
    nodeEnvironment: string;
    databaseProvider: string;
    fileStorage: string;
  };
  counts: {
    candidates: number;
    jobs: number;
    pilotRequirements: number;
    candidateFiles: number;
    interviews: number;
    importBatches: number;
  };
  calendarConnection: {
    status: string;
    syncDirection: string;
    accountEmail: string | null;
    lastSyncedAt: string | null;
  } | null;
  productionReadiness: Array<{
    label: string;
    status: "ready" | "todo";
    detail: string;
  }>;
  auth: {
    mode: string;
    provider: string | null;
    requireAuth: boolean;
    detail: string;
    roles: Array<{
      role: RoleName;
      permissionCount: number;
    }>;
  };
  moduleAccessPolicy: ModuleAccessPolicy;
};

function appEnvironment() {
  return process.env.NEXT_PUBLIC_APP_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "local development");
}

export async function getSettingsData(): Promise<SettingsData> {
  const [candidates, jobs, pilotRequirements, candidateFiles, interviews, importBatches, calendarConnection] =
    await Promise.all([
      prisma.candidate.count(),
      prisma.job.count(),
      prisma.pilotRequirement.count(),
      prisma.candidateFile.count(),
      prisma.interview.count(),
      prisma.importBatch.count(),
      prisma.googleCalendarConnection.findFirst({
        orderBy: { updatedAt: "desc" },
        select: {
          accountEmail: true,
          syncDirection: true,
          lastSyncedAt: true,
          lastSyncStatus: true
        }
      })
    ]);

  const databaseUrl = process.env.DATABASE_URL ?? "";
  const fileStorageProvider = process.env.FILE_STORAGE_PROVIDER ?? "local-dev";
  const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? "";
  const authStatus = getAuthRuntimeStatus();
  const moduleAccessPolicy = await getWorkspaceModuleAccessPolicy();

  return {
    environment: {
      appEnvironment: appEnvironment(),
      nodeEnvironment: process.env.NODE_ENV ?? "development",
      databaseProvider: "SQLite local dev now; PostgreSQL required for hosted production",
      fileStorage: "Local storage now; private S3 required for hosted production"
    },
    counts: {
      candidates,
      jobs,
      pilotRequirements,
      candidateFiles,
      interviews,
      importBatches
    },
    calendarConnection: calendarConnection
      ? {
          status: calendarConnection.lastSyncStatus ?? "Not synced",
          syncDirection: calendarConnection.syncDirection,
          accountEmail: calendarConnection.accountEmail,
          lastSyncedAt: calendarConnection.lastSyncedAt?.toISOString() ?? null
        }
      : null,
    productionReadiness: [
      {
        label: "Production environment label",
        status: appEnv && appEnv !== "local development" ? "ready" : "todo",
        detail: appEnv || "Set NEXT_PUBLIC_APP_ENV to staging or production."
      },
      {
        label: "PostgreSQL database",
        status: databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://") ? "ready" : "todo",
        detail: databaseUrl.startsWith("file:") ? "Currently using local SQLite." : "Set DATABASE_URL to RDS PostgreSQL."
      },
      {
        label: "Private S3 file storage",
        status: fileStorageProvider === "s3" ? "ready" : "todo",
        detail: fileStorageProvider === "s3" ? "S3 provider selected." : "Current file storage provider is local-dev."
      },
      {
        label: "Candidate files bucket",
        status: process.env.S3_CANDIDATE_FILES_BUCKET ? "ready" : "todo",
        detail: process.env.S3_CANDIDATE_FILES_BUCKET || "Set S3_CANDIDATE_FILES_BUCKET."
      },
      {
        label: "Authentication provider",
        status: authStatus.mode === "google-session-validation" ? "ready" : "todo",
        detail:
          authStatus.mode === "google-session-validation"
            ? "Google auth provider, session secret, and allowlist are configured."
            : "Set AUTH_PROVIDER, Google OAuth credentials, NEXTAUTH_SECRET, and an allowed email/domain list."
      }
    ],
    auth: {
      mode: authStatus.mode,
      provider: authStatus.provider,
      requireAuth: authStatus.requireAuth,
      detail: authStatus.detail,
      roles: (Object.keys(rolePermissions) as RoleName[]).map((role) => ({
        role,
        permissionCount: rolePermissions[role].length
      }))
    },
    moduleAccessPolicy
  };
}
