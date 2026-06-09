import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/client/client";
import { schemaStatements } from "./schema-sql";
import { masterJobCatalog, type MasterJobCatalogEntry } from "../lib/seed/master-job-catalog";

const adapter = new PrismaBetterSqlite3(
  {
    url: process.env.DATABASE_URL ?? "file:./prisma/dev.db"
  },
  {
    timestampFormat: "unixepoch-ms"
  }
);

const prisma = new PrismaClient({ adapter });

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

async function ensureSchema() {
  for (const statement of schemaStatements) {
    await prisma.$executeRawUnsafe(statement);
  }

  const blockColumns = (await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("ContentBlock")`
  )).map((column) => column.name);

  if (!blockColumns.includes("placement")) {
    await prisma.$executeRawUnsafe(`ALTER TABLE "ContentBlock" ADD COLUMN "placement" TEXT NOT NULL DEFAULT 'OPTIONAL'`);
    await prisma.$executeRawUnsafe(`
      UPDATE "ContentBlock"
      SET "placement" = CASE
        WHEN "category" IN ('ABOUT', 'VALUES', 'CTA') THEN 'REQUIRED'
        WHEN "scope" = 'DEPARTMENT' THEN 'DEPARTMENT_SPECIFIC'
        WHEN "scope" = 'ROLE' THEN 'ROLE_SPECIFIC'
        ELSE 'OPTIONAL'
      END
    `);
  }
}

function blocksForEntry(entry: MasterJobCatalogEntry) {
  const isPilotLike =
    entry.category === "FlightOps" ||
    /captain|first officer|pilot|cabin attendant/i.test(entry.title);
  const isMaintenance = entry.category === "Maintenance" || entry.department === "Maintenance";
  const isSLC = /SLC|Salt Lake/i.test(entry.location ?? "");
  const isOGD = /OGD|Ogden/i.test(entry.location ?? "");
  const names = ["About SkyShare", "Core Values"];

  if (isPilotLike) {
    names.push("Pilot Responsibilities", "Pilot Qualifications", "Paycom Default Pilot Templates");
  }

  if (isMaintenance) {
    names.push("Maintenance Qualifications", "Paycom Maintenance Templates");
  }

  names.push("Benefits");

  if (isSLC) {
    names.push("Location Requirement - SLC");
  }

  if (isOGD) {
    names.push("Location Requirement - OGD");
  }

  if (isPilotLike || isMaintenance) {
    names.push("Work Authorization");
  }

  names.push("Closing CTA");
  return Array.from(new Set(names));
}

async function importMasterJobs() {
  await ensureSchema();

  const [existingJobs, blocks] = await Promise.all([
    prisma.jobPost.findMany({ select: { title: true } }),
    prisma.contentBlock.findMany({ include: { versions: true } })
  ]);
  const existingTitles = new Set(existingJobs.map((job) => normalize(job.title)));
  const blockMap = new Map(blocks.map((block) => [block.name, block]));
  let imported = 0;
  let skipped = 0;

  for (const entry of masterJobCatalog) {
    if (existingTitles.has(normalize(entry.title))) {
      skipped += 1;
      continue;
    }

    const job = await prisma.jobPost.create({
      data: {
        title: entry.title,
        internalName: entry.internalName ?? `${entry.title} - PDF Master`,
        department: entry.department,
        category: entry.category,
        location: entry.location ?? null,
        secondaryLocation: entry.secondaryLocation ?? null,
        positionType: entry.positionType ?? "Full Time",
        salaryRange: entry.salaryRange ?? null,
        reportsTo: entry.reportsTo ?? null,
        status: entry.status ?? "NEEDS_REVIEW",
        summary: "Imported from the master PDF catalog. Review this job-specific summary against the source posting before publishing.",
        keyResponsibilities: "Review responsibilities from the source posting\nConfirm department-specific duties\nVerify role expectations before publishing",
        qualificationsText: "Review qualifications from the source posting\nConfirm required experience and credentials\nVerify work authorization language",
        benefitsText: "Review salary, schedule, perks, and benefits from the source posting before publishing.",
        postedDate: new Date("2026-05-26")
      }
    });

    for (const [index, blockName] of blocksForEntry(entry).entries()) {
      const block = blockMap.get(blockName);
      if (!block?.currentVersionId) {
        continue;
      }

      await prisma.jobBlockInstance.create({
        data: {
          jobPostId: job.id,
          contentBlockId: block.id,
          blockVersionId: block.currentVersionId,
          sortOrder: index + 1,
          sectionKey: block.category.toLowerCase(),
          mode: "LINKED"
        }
      });
    }

    imported += 1;
    existingTitles.add(normalize(entry.title));
  }

  console.log(`Imported ${imported} master PDF jobs. Skipped ${skipped} jobs already in the system.`);
}

importMasterJobs()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
