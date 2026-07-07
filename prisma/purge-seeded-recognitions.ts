// Purge the seeded/demo Compliments activity so the program starts empty for
// real use. Deletes all peer-to-peer Recognitions (cascades their likes/
// comments), all demo Redemptions, and resets every points balance to 0.
//
// KEEPS: the reward catalog (Reward), the RecognitionValues (core values), the
// roster, and Celebrations (birthdays/anniversaries — computed from real dates,
// never stored as recognitions).
//
//   npx tsx prisma/purge-seeded-recognitions.ts            (dry-run scan)
//   npx tsx prisma/purge-seeded-recognitions.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");

async function main() {
  const [recognitions, likes, comments, redemptions, rewards, values, pointed] = await Promise.all([
    prisma.recognition.count(),
    prisma.recognitionLike.count(),
    prisma.recognitionComment.count(),
    prisma.redemption.count(),
    prisma.reward.count(),
    prisma.recognitionValue.count(),
    prisma.newHire.count({ where: { pointsBalance: { gt: 0 } } })
  ]);
  const span = await prisma.recognition.aggregate({ _min: { createdAt: true }, _max: { createdAt: true } });

  console.log("=== WILL DELETE ===");
  console.log(`  Recognitions:        ${recognitions}  (created ${span._min.createdAt?.toISOString().slice(0, 10) ?? "—"} → ${span._max.createdAt?.toISOString().slice(0, 10) ?? "—"})`);
  console.log(`    ↳ likes:           ${likes}  (cascade)`);
  console.log(`    ↳ comments:        ${comments}  (cascade)`);
  console.log(`  Redemptions:         ${redemptions}`);
  console.log(`  Points balances >0:  ${pointed}  → reset to 0`);
  console.log("=== WILL KEEP ===");
  console.log(`  Reward catalog:      ${rewards}`);
  console.log(`  Core values:         ${values}`);
  console.log(`  Celebrations:        computed from birthdays/anniversaries (untouched)`);

  if (commit) {
    await prisma.recognitionLike.deleteMany();
    await prisma.recognitionComment.deleteMany();
    await prisma.redemption.deleteMany();
    await prisma.recognition.deleteMany();
    await prisma.newHire.updateMany({ where: { pointsBalance: { not: 0 } }, data: { pointsBalance: 0 } });
    console.log("\nAPPLIED — Compliments recognition activity cleared; catalog + values + celebrations intact.");
  } else {
    console.log("\nDRY RUN — re-run with --commit");
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
