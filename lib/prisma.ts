import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const databaseUrl = process.env.DATABASE_URL ?? "file:./prisma/dev.db";

function isPostgresUrl(value: string) {
  return value.startsWith("postgresql://") || value.startsWith("postgres://");
}

function createPrismaAdapter() {
  if (isPostgresUrl(databaseUrl)) {
    return new PrismaPg({
      connectionString: databaseUrl
    });
  }

  return new PrismaBetterSqlite3(
    {
      url: databaseUrl
    },
    {
      timestampFormat: "unixepoch-ms"
    }
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: createPrismaAdapter(),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
