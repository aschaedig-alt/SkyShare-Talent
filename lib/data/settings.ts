import { prisma } from "@/lib/prisma";
import { getAuthRuntimeStatus } from "@/lib/auth/auth-config";
import { rolePermissions, type RoleName } from "@/lib/auth/roles";
import { getWorkspaceModuleAccessPolicy } from "@/lib/data/module-access";
import { getWorkspaceBranding, type WorkspaceBranding } from "@/lib/data/branding";
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
  branding: WorkspaceBranding;
};

function appEnvironment() {
  return process.env.NEXT_PUBLIC_APP_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "local development");
}

/**
 * The only NEXT_PUBLIC_APP_ENV values that mean "this is a real deployment".
 *
 * The readiness badge used to be `appEnv && appEnv !== "local development"`, so
 * ANY other string turned it green — a machine labelled "development", "dev" or
 * a plain typo all reported READY. An allowlist can only go green for an
 * environment we actually recognise.
 */
const HOSTED_APP_ENVS = ["production", "staging"];

/**
 * WHAT THE APP IS ACTUALLY RUNNING ON, read from the environment.
 *
 * These two lines used to be hardcoded sentences — "SQLite local dev now" and
 * "Local storage now" — and both had gone false without anything noticing:
 * the workspace runs on Neon Postgres, and S3 was enabled everywhere on Jul 30.
 * Settings was confidently telling whoever read it the opposite of the truth.
 * They are derived from the same env values the readiness checks below already
 * read, so they cannot drift out of date again.
 */
function isPostgresUrl(databaseUrl: string) {
  return databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://");
}

function describeDatabaseProvider(databaseUrl: string) {
  if (!databaseUrl) return "Not configured — DATABASE_URL is unset";
  if (isPostgresUrl(databaseUrl)) {
    // The hostname is the only thing distinguishing our hosted Postgres (Neon)
    // from any other Postgres, so name it only when the host says so.
    return databaseUrl.includes("neon.tech") ? "PostgreSQL (Neon)" : "PostgreSQL";
  }
  if (databaseUrl.startsWith("file:")) return "SQLite (local file)";
  const scheme = databaseUrl.split(":")[0];
  return scheme ? `Unrecognized database provider (${scheme})` : "Unrecognized DATABASE_URL";
}

function describeFileStorage(fileStorageProvider: string) {
  if (fileStorageProvider !== "s3") {
    return `Local disk storage (FILE_STORAGE_PROVIDER=${fileStorageProvider})`;
  }
  const bucket = process.env.S3_CANDIDATE_FILES_BUCKET;
  return bucket ? `Private S3 (${bucket})` : "Private S3 (S3_CANDIDATE_FILES_BUCKET not set)";
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
  const isPostgres = isPostgresUrl(databaseUrl);
  const authStatus = getAuthRuntimeStatus();
  const moduleAccessPolicy = await getWorkspaceModuleAccessPolicy();
  const branding = await getWorkspaceBranding();

  return {
    environment: {
      appEnvironment: appEnvironment(),
      nodeEnvironment: process.env.NODE_ENV ?? "development",
      databaseProvider: describeDatabaseProvider(databaseUrl),
      fileStorage: describeFileStorage(fileStorageProvider)
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
        status: HOSTED_APP_ENVS.includes(appEnv) ? "ready" : "todo",
        detail: appEnv || "Set NEXT_PUBLIC_APP_ENV to staging or production."
      },
      {
        label: "PostgreSQL database",
        status: isPostgres ? "ready" : "todo",
        // When it IS Postgres, say what was detected rather than printing a
        // "set this" instruction next to a green badge — the same shape the S3
        // row below uses.
        detail: isPostgres
          ? `${describeDatabaseProvider(databaseUrl)} connection string is set.`
          : databaseUrl.startsWith("file:")
            ? "Currently using local SQLite."
            : "Set DATABASE_URL to the Neon PostgreSQL connection string."
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
    moduleAccessPolicy,
    branding
  };
}
