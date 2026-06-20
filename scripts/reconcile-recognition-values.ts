import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { COMPANY_VALUES } from "../lib/compliments/constants";

// Idempotently bring the RecognitionValue table in line with COMPANY_VALUES
// (SkyShare's core values) WITHOUT wiping recognitions, likes, comments, or the
// roster. Safe to run against production: it upserts the canonical values by
// name and removes any leftover values that are no longer in the list. For an
// implicit many-to-many, deleting a value just drops its join rows — the
// recognitions themselves stay (they simply lose that one tag).

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is not set");
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

async function main() {
  const canonicalNames = new Set(COMPANY_VALUES.map((v) => v.name));

  // 1) Upsert each canonical value (create if missing, refresh color/order).
  for (const value of COMPANY_VALUES) {
    await prisma.recognitionValue.upsert({
      where: { name: value.name },
      create: { name: value.name, colorKey: value.colorKey, sortOrder: value.sortOrder },
      update: { colorKey: value.colorKey, sortOrder: value.sortOrder }
    });
  }

  // 2) Remove any value no longer in the canonical list (old placeholders).
  const stale = await prisma.recognitionValue.findMany({
    where: { name: { notIn: [...canonicalNames] } },
    select: { id: true, name: true, _count: { select: { recognitions: true } } }
  });
  for (const v of stale) {
    await prisma.recognitionValue.delete({ where: { id: v.id } });
    console.log(`Removed stale value "${v.name}" (was tagged on ${v._count.recognitions} recognition(s)).`);
  }

  const finalValues = await prisma.recognitionValue.findMany({
    orderBy: { sortOrder: "asc" },
    select: { name: true, colorKey: true, sortOrder: true }
  });
  console.log(`\nRecognition values now (${finalValues.length}):`);
  for (const v of finalValues) {
    console.log(`  ${v.sortOrder}. ${v.name} [${v.colorKey}]`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
