/**
 * Mark the PRD section of the onboarding checklist as starting on the CANDIDATE.
 *
 *   npx tsx scripts/prd-starts-on-candidate.ts            dry run: shows what would change
 *   npx tsx scripts/prd-starts-on-candidate.ts --apply    writes it
 *   npx tsx scripts/prd-starts-on-candidate.ts --undo     switches it back off
 *
 * WHY. Feedback cmuctrf78 (2026-09-22): "this part of the checklist should start
 * when they are a candidate and then carry over to new hires with the accurate
 * status ... so add it on the candidate side." Which sections do that is a layout
 * setting (candidateGroups in lib/data/onboarding-grid-config.ts), editable from
 * Manage tasks as "Starts on the candidate". This sets it for the section she
 * asked about, so it works the day it ships rather than the day somebody finds
 * the checkbox.
 *
 * WHICH SECTION. The PRD section is the CUSTOM group, renamed "PRD" in the saved
 * layout on Sep 9 and holding her two steps, Request PRD Access and Request PRD
 * from ITS. This script REFUSES unless that is still true — it checks the name and
 * that both steps are filed there — so it cannot flag some other section that has
 * since taken the CUSTOM key.
 *
 * WHAT IT WRITES. One key in one WorkspaceSetting (workspace / onboarding-grid-
 * overrides), through the app's own setter. No person's record, no task row. The
 * undo is the same setter with false. Nothing a candidate has ticked is touched by
 * either direction.
 *
 * DEPLOY ORDER MATTERS. Code older than this change reads that setting without the
 * new key and writes it back without it, so a layout edit made on the live site
 * BEFORE the deploy would silently drop the flag. Run (or re-run) this AFTER the
 * deploy; a re-run is a no-op when it is already set.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { getGridChecklist, setSectionCandidateStage } from "../lib/data/onboarding-grid-config";
import { prisma } from "../lib/prisma";

const SECTION = "CUSTOM";
const EXPECT_LABEL = /^prd$/i;
const EXPECT_TASKS = ["custom_request_prd_access_600ce652", "custom_request_prd_from_its_5e15f861"];

async function main() {
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  const groups = await getGridChecklist();
  const section = groups.find((g) => g.key === SECTION);
  if (!section) throw new Error(`No ${SECTION} section in the layout — refusing.`);
  console.log(`Section ${SECTION} is labelled "${section.label}" and holds:`);
  for (const t of section.tasks) console.log(`  - ${t.key}  "${t.label}"${t.hidden ? " (hidden)" : ""}`);
  console.log(`candidateStage is currently: ${section.candidateStage}`);

  if (!EXPECT_LABEL.test(section.label.trim())) {
    throw new Error(`Expected the ${SECTION} section to be named PRD, found "${section.label}" — refusing.`);
  }
  const missing = EXPECT_TASKS.filter((k) => !section.tasks.some((t) => t.key === k));
  if (missing.length) throw new Error(`The PRD steps are not all in this section (${missing.join(", ")}) — refusing.`);

  const want = !undo;
  if (section.candidateStage === want) {
    console.log(`\nAlready ${want ? "ON" : "OFF"} — nothing to do.`);
    return;
  }
  if (!apply && !undo) {
    console.log(`\nDRY RUN — would switch "Starts on the candidate" ON for the ${section.label} section. Pass --apply to write it.`);
    return;
  }
  await setSectionCandidateStage(SECTION, want);
  const after = (await getGridChecklist()).find((g) => g.key === SECTION);
  console.log(`\nWROTE. candidateStage is now: ${after?.candidateStage}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
