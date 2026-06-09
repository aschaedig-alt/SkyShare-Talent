import { countSeededJobs, disconnectSeedPrisma, ensureSchema, resetAndSeed } from "./seed";
import { ensureRecruitingSeedData } from "./recruiting-seed";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/client/client";

async function main() {
  await ensureSchema();

  const jobCount = await countSeededJobs();
  if (jobCount === 0) {
    await resetAndSeed();
  }

  const adapter = new PrismaBetterSqlite3(
    {
      url: process.env.DATABASE_URL ?? "file:./prisma/dev.db"
    },
    {
      timestampFormat: "unixepoch-ms"
    }
  );
  const prisma = new PrismaClient({ adapter });

  try {
    await ensureRecruitingSeedData(prisma);
  } finally {
    await prisma.$disconnect();
  }

  console.log(`Local database ready with ${jobCount} job posts.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await disconnectSeedPrisma();
  });
