import "dotenv/config";
import { existsSync } from "node:fs";
import path from "node:path";

type Check = {
  label: string;
  ok: boolean;
  detail: string;
};

const strict = process.argv.includes("--strict");
const databaseUrl = process.env.DATABASE_URL ?? "";
const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? "";
const fileStorageProvider = process.env.FILE_STORAGE_PROVIDER ?? "";
const s3Credentials = Boolean(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);
const authProvider = process.env.AUTH_PROVIDER ?? "";
const authSecret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
const googleClientId = process.env.AUTH_GOOGLE_ID ?? process.env.GOOGLE_CLIENT_ID ?? "";
const googleClientSecret = process.env.AUTH_GOOGLE_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
const authAllowlist = process.env.AUTH_ADMIN_EMAILS ?? process.env.AUTH_ALLOWED_EMAILS ?? process.env.AUTH_ALLOWED_DOMAINS ?? "";
const postgresSchemaExists = existsSync(path.join(process.cwd(), "prisma", "schema.postgres.prisma"));

const checks: Check[] = [
  {
    label: "App environment",
    ok: Boolean(appEnv && appEnv !== "local development"),
    detail: appEnv || "NEXT_PUBLIC_APP_ENV is not set."
  },
  {
    label: "PostgreSQL DATABASE_URL",
    ok: databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://"),
    detail:
      databaseUrl.startsWith("postgresql://") || databaseUrl.startsWith("postgres://")
        ? "DATABASE_URL points to PostgreSQL."
        : databaseUrl.startsWith("file:")
          ? "Current DATABASE_URL points to local SQLite."
          : databaseUrl
            ? "DATABASE_URL is not a recognized PostgreSQL URL."
            : "DATABASE_URL is missing."
  },
  {
    label: "PostgreSQL schema snapshot",
    ok: postgresSchemaExists,
    detail: postgresSchemaExists
      ? "prisma/schema.postgres.prisma is available for hosted builds."
      : "Run npm run db:postgres:schema to generate prisma/schema.postgres.prisma."
  },
  {
    label: "File storage provider",
    ok: fileStorageProvider === "s3",
    detail: fileStorageProvider || "FILE_STORAGE_PROVIDER is not set; local-dev is the runtime default."
  },
  {
    label: "S3 bucket",
    ok: Boolean(process.env.S3_CANDIDATE_FILES_BUCKET),
    detail: process.env.S3_CANDIDATE_FILES_BUCKET || "S3_CANDIDATE_FILES_BUCKET is not set."
  },
  {
    label: "S3 write credentials",
    ok: fileStorageProvider !== "s3" || s3Credentials,
    detail:
      fileStorageProvider !== "s3"
        ? "S3 credentials are required only when FILE_STORAGE_PROVIDER=s3."
        : s3Credentials
          ? "AWS access key and secret are configured."
          : "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY for a limited S3 IAM user."
  },
  {
    label: "Authentication provider",
    ok: Boolean(authProvider),
    detail: authProvider || "AUTH_PROVIDER is not set."
  },
  {
    label: "Auth session secret",
    ok: Boolean(authSecret),
    detail: authSecret ? "Session signing secret is configured." : "Set NEXTAUTH_SECRET or AUTH_SECRET."
  },
  {
    label: "Google OAuth credentials",
    ok: Boolean(googleClientId && googleClientSecret),
    detail: googleClientId && googleClientSecret ? "Google OAuth client id/secret are configured." : "Set AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET."
  },
  {
    label: "Auth allowlist",
    ok: Boolean(authAllowlist),
    detail: authAllowlist ? "Allowed admin/email/domain list is configured." : "Set AUTH_ADMIN_EMAILS, AUTH_ALLOWED_EMAILS, or AUTH_ALLOWED_DOMAINS."
  }
];

console.log("SkyShare Talent production readiness");
console.log("=====================================");

for (const check of checks) {
  console.log(`${check.ok ? "OK " : "TODO"} ${check.label}: ${check.detail}`);
}

const failed = checks.filter((check) => !check.ok);
console.log("");
console.log(`${checks.length - failed.length}/${checks.length} production checks ready.`);

if (strict && failed.length > 0) {
  process.exitCode = 1;
}
