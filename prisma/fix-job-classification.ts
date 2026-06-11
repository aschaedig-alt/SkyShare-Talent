import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

// Mirrors lib/imports/job-import.ts isPilotTitle (title-only; aircraft names do NOT imply pilot).
function isPilotTitle(title: string) {
  return /\b(pilot|captain|first officer|chief pilot|pic|sic|aviator)\b/.test(title.toLowerCase());
}

async function main() {
  const jobs = await prisma.job.findMany({
    where: { mergedIntoJobId: null },
    select: { id: true, title: true, department: true, isPilotRole: true }
  });

  const changed: string[] = [];
  for (const job of jobs) {
    const shouldBePilot = isPilotTitle(job.title);
    if (!shouldBePilot && job.isPilotRole) {
      const supportCategory =
        job.department && job.department.toLowerCase() !== "pilot" ? job.department : "Support";
      await prisma.job.update({
        where: { id: job.id },
        data: {
          isPilotRole: false,
          isPilotLeadershipRole: false,
          pilotSeat: null,
          aircraftTypesJson: null,
          roleCategory: supportCategory
        }
      });
      const removed = await prisma.pilotRequirement.deleteMany({ where: { sourceJobRecordId: job.id } });
      changed.push(`${job.title}  (removed ${removed.count} requirement[s])`);
    }
  }

  console.log(`Reviewed ${jobs.length} jobs. Downgraded ${changed.length} to support:`);
  for (const c of changed) console.log("  -", c);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
