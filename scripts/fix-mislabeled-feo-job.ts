/**
 * Retag the mislabeled "Citation CE-525 First Officer" job: it carries three
 * bogus aircraft tags (Gulfstream G450 / Citation CJ2 / Pilatus PC-12). It's a
 * CE-525 / CJ2 First Officer — keep only "Citation CJ2". Recategorize only.
 *
 *   npx tsx scripts/fix-mislabeled-feo-job.ts --apply   (omit for dry run)
 */
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const TARGET_TAGS = ["Citation CJ2"];

async function main() {
  const jobs = await prisma.job.findMany({
    where: { isPilotRole: true, mergedIntoJobId: null, title: { contains: "CE-525 First Officer", mode: "insensitive" } },
    select: { id: true, title: true, aircraftTypesJson: true }
  });
  if (jobs.length === 0) {
    console.log("No matching CE-525 First Officer job found.");
    return;
  }
  for (const j of jobs) {
    console.log(`\nJOB "${j.title}" (${j.id.slice(0, 8)})`);
    console.log(`   current tags: ${j.aircraftTypesJson ?? "—"}`);
    console.log(`   ${APPLY ? "SET" : "would set"} tags: ${JSON.stringify(TARGET_TAGS)}`);
    if (APPLY) {
      await prisma.job.update({ where: { id: j.id }, data: { aircraftTypesJson: JSON.stringify(TARGET_TAGS) } });
      console.log(`   ✓ updated`);
    }
  }
  console.log(`\n${APPLY ? "Applied." : "Dry run only. Re-run with --apply."}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
