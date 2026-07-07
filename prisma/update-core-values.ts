// Update the live Compliments core values to the new set:
//   Safety First      → renamed to "Fueled by Passion" (keeps its recognitions)
//   Own the Outcome   → removed (M2M join rows drop; recognitions are seed data)
//   Team Alignment / Deliver the Wow / Solutions Focused → kept
// RecognitionValue has no description column — definitions live in the
// COMPANY_VALUES constant and are shown in the UI, so nothing to store here.
//   npx tsx prisma/update-core-values.ts            (preview)
//   npx tsx prisma/update-core-values.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);

async function main() {
  const values = await prisma.recognitionValue.findMany({ select: { id: true, name: true, _count: { select: { recognitions: true } } } });
  console.log("Current values:", values.map((v) => `${v.name} (${v._count.recognitions} recognitions)`).join(", "), "\n");

  const safety = values.find((v) => v.name === "Safety First");
  const own = values.find((v) => v.name === "Own the Outcome");

  if (safety) {
    log(`Rename "Safety First" → "Fueled by Passion" (keeps ${safety._count.recognitions} recognitions)`);
    if (commit) await prisma.recognitionValue.update({ where: { id: safety.id }, data: { name: "Fueled by Passion" } });
  } else {
    log(`(no "Safety First" row — already renamed?)`);
  }

  if (own) {
    log(`Remove "Own the Outcome" (drops ${own._count.recognitions} value-tag links; recognitions themselves untouched)`);
    if (commit) await prisma.recognitionValue.delete({ where: { id: own.id } });
  } else {
    log(`(no "Own the Outcome" row — already removed?)`);
  }

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
