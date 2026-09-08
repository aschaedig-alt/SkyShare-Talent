/**
 * Puts a starting colour on each saved pipeline stage.
 *
 *   npx tsx scripts/seed-stage-colors.ts            # review, writes nothing
 *   npx tsx scripts/seed-stage-colors.ts --apply    # save it
 *   npx tsx scripts/seed-stage-colors.ts --undo     # clear every stage colour
 *
 * The stage list gained a colour field but every saved stage still has none, so
 * the pills fall back to the keyword guess in SelectableCandidateTable — which
 * gives Hired and Offer the SAME green, because one rule matches "hire" or
 * "offer". The two ends of the pipeline should not look identical on a list
 * whose job is to be scanned.
 *
 * DISPLAY ONLY. This writes one WorkspaceSetting row holding the stage
 * vocabulary. It changes no candidate, moves nobody between stages, and --undo
 * puts it back exactly as it was.
 *
 * Order and grouping are NOT touched — only the colour, and only on stages
 * whose name matches one this file knows. Anything else is left alone rather
 * than guessed at.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "@/lib/prisma";
import { getStageList, saveStageList } from "@/lib/data/candidate-stages";
import { CANDIDATE_STAGES } from "@/lib/candidates/stages";

async function main() {
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  const saved = await getStageList();
  const wanted = new Map(
    CANDIDATE_STAGES.map((s) => [s.value.toLowerCase(), s.color ?? null])
  );

  const next = saved.map((stage) => {
    const color = undo ? null : wanted.get(stage.value.toLowerCase()) ?? stage.color ?? null;
    return { ...stage, color };
  });

  console.log(undo ? "CLEARING every stage colour:\n" : "Stage colours:\n");
  let changes = 0;
  for (let i = 0; i < saved.length; i += 1) {
    const before = saved[i].color ?? "(none)";
    const after = next[i].color ?? "(none)";
    const changed = before !== after;
    if (changed) changes += 1;
    console.log(
      `  ${saved[i].group.padEnd(6)}  ${saved[i].value.padEnd(20)} ${before.padEnd(9)} ${
        changed ? `-> ${after}` : "(unchanged)"
      }`
    );
  }

  console.log(`\n  ${changes} of ${saved.length} stages change.`);

  if (!apply && !undo) {
    console.log("\nDry run — nothing written. Re-run with --apply to save.");
    return;
  }
  if (undo && !apply) {
    console.log("\nDry run — nothing written. Re-run with --undo --apply to clear them.");
    return;
  }

  await saveStageList(next);
  const check = await getStageList();
  console.log("\nSaved. Read back from the database:");
  for (const s of check) {
    console.log(`  ${s.group.padEnd(6)}  ${s.value.padEnd(20)} ${s.color ?? "(none)"}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
