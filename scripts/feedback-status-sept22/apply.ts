/**
 * Mark the Sep 22 feedback sweep's finished items DONE — AFTER the deploy.
 *
 * Same shape as scripts/feedback-status-sept11/apply.ts, for the same reason:
 * THE IDS ARE HAND-PICKED, each with what shipped for it, and the ones still
 * waiting on somebody are listed separately so the dry run shows what is NOT
 * being closed as plainly as what is. Nothing is inferred from dates or statuses.
 *
 * Run it only once the commit is LIVE. Marking an item done while the fix sits in
 * a handoff tells Aimee it is there when she cannot see it.
 *
 *   npx tsx scripts/feedback-status-sept22/apply.ts            what would change
 *   npx tsx scripts/feedback-status-sept22/apply.ts --apply    do it (writes UNDO.json first)
 *   npx tsx scripts/feedback-status-sept22/apply.ts --undo     put every row back
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "../../lib/prisma";

const HERE = join(process.cwd(), "scripts", "feedback-status-sept22");
const UNDO = join(HERE, "UNDO.json");

/** id -> what shipped for it. */
const DONE: Record<string, string> = {
  // --- Sep 21 and 22 ---
  cmuctrf78000304jwbab921zk:
    "PRD section starts on the candidate (Checklists tab) and carries onto the hire's checklist; finished sections fold, with Expand all / Collapse all",
  cmubu8leo002d04i72azyeir5:
    "Front mail check: names in ordinary capitals now read, legal name and Paycom id match (Henry = Flynn McFarland), text-message and requisition mail no longer counted as unreadable",
  cmubtj8sq001c04i7utxcmbx3: "Travel request details line up: one row per kind of fact, fixed-height labels, item rows no longer stretch",
  cmubt2fgb000604i7k9ymrp70: "Applied to shows the job Paycom named, when they applied, and a one-click link to the job",
  // --- older ---
  cmtyo947v001b04jxan1yrl2r: "Every detail on the hire page saves itself when you leave the field; the Save details button is gone",
  cmthlyx3z000004l8icennhe5:
    "Change time or place on the session page (HQ, Atlantic, Ogden or somewhere new); emails, invite and summary follow it and say when it is different than normal; every orientation email, the summary included, has an edit box",
  cmtx9cvi4000004jverpxbxtg: "Indoc & orientation is its own trip purpose, beside Orientation and Indoc, and reports as its own line",
  cmtx9et7i000204jvfs1ot43n:
    "Trips were never pre-filled; the missing-items list no longer treats a hotel or car as expected, and an empty trip points at the add buttons",
  cmtx9lbbd0004rsrmj0des0tv: "Clicking a month switches the four tiles to that month, with a rank tile in place of Biggest month",
  cmtx9ms2g0006rsrm8b26aazb:
    "Travel spend on Reports is one report: filter by year, month, department, hired or not and purpose; sortable trip table; CSV download",
  // --- the three he decided on 2026-09-22, after the first six blocks were written ---
  cmtynseh3000204jxabvmy4bt:
    "Every imported application names the job Paycom gave it, when they applied and its Paycom id; 3,400 were linked to their job in bulk (turned-down applicants included, at his instruction). 4,904 still show the title only, because their title does not name exactly one job here",
  cmu1dut0r000004jjfw940ljs:
    "Offer details from the hiring manager: one box on the offer, prefilled with her thirteen lines, HR-only, saving when you click away; shows on the candidate's Offers tab and the hire's checklist",
  cmtg6yl0f000204l3r19h64lb:
    "Jobs page rebuilt as he picked it: a card list, a page per job at its own address, real tabs that swap the pane, and Edit layout dropped"
};

/**
 * Left open ON PURPOSE, with the reason.
 *
 * Empty since 2026-09-22: his three decisions that day (link them all, build the
 * offer box with the pay lines, jobs page option B with real tabs) closed the
 * last three. Kept rather than deleted because the next sweep will need it, and
 * because a dry run that prints "none" is a stronger statement than a section
 * that quietly disappeared.
 */
const HELD: Record<string, string> = {};

async function main() {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const apply = process.argv.includes("--apply");

  if (process.argv.includes("--undo")) {
    if (!existsSync(UNDO)) throw new Error("No UNDO.json — nothing was applied from here.");
    const saved = JSON.parse(readFileSync(UNDO, "utf8")) as Array<{ id: string; status: string }>;
    for (const row of saved) await prisma.feedback.update({ where: { id: row.id }, data: { status: row.status } });
    console.log(`Restored ${saved.length} rows to the status they had before.`);
    return;
  }

  const ids = Object.keys(DONE);
  const rows = await prisma.feedback.findMany({ where: { id: { in: ids } }, select: { id: true, status: true } });
  const found = new Map(rows.map((r) => [r.id, r.status]));
  console.log(`Named as done here: ${ids.length}. Found: ${rows.length}. Missing: ${ids.length - rows.length}\n`);

  const changing = rows.filter((r) => r.status !== "DONE");
  console.log("WOULD CHANGE TO DONE");
  for (const id of ids) {
    const status = found.get(id);
    console.log(`  ${status ?? "MISSING"} -> DONE  ${id}\n      ${DONE[id]}`);
  }
  console.log("\nDELIBERATELY LEFT OPEN");
  const held = Object.entries(HELD);
  if (!held.length) console.log("  (none — all thirteen are closed)");
  for (const [id, why] of held) console.log(`  ${id}  ${why}`);

  if (!apply) {
    console.log(`\nDRY RUN — ${changing.length} rows would change. Pass --apply after the deploy is live.`);
    return;
  }
  writeFileSync(UNDO, JSON.stringify(changing.map((r) => ({ id: r.id, status: r.status })), null, 2));
  for (const r of changing) await prisma.feedback.update({ where: { id: r.id }, data: { status: "DONE" } });
  console.log(`\nAPPLIED — ${changing.length} rows set to DONE. Undo record: ${UNDO}`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
