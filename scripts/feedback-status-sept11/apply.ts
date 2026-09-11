/**
 * Mark the feedback items that have actually been built as DONE.
 *
 * Asked for on 2026-09-11: "there's a lot of stuff that says new, but if it's
 * completed, let's make sure it gets changed to done."
 *
 * THE IDS ARE HAND-PICKED, one per item, and each carries the reason it is on the
 * list. That is the whole safety property: a query like "everything NEW before
 * today" would sweep in the items that are researched-but-unbuilt and the ones
 * waiting on her, and marking those done would lose them. Nothing here is
 * inferred.
 *
 * Dry run by default. --apply writes, and writes an undo file first.
 *
 *   npx tsx scripts/feedback-status-sept11/apply.ts            what would change
 *   npx tsx scripts/feedback-status-sept11/apply.ts --apply    do it
 *   npx tsx scripts/feedback-status-sept11/apply.ts --undo     put it all back
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const HERE = join(process.cwd(), "scripts", "feedback-status-sept11");
const UNDO = join(HERE, "UNDO.json");
const PLAN = join(HERE, "PLAN.txt");

/** id -> what shipped for it. Every one of these is built and on the dev server. */
const DONE: Record<string, string> = {
  // --- the seven from Sept 10 ---
  cmtvnemon000004l42lzjbvf1: "Email preview no longer centers the body; Send as test to hrotasks@ added",
  cmtvni1a2000204l45ryc3t3o: "Checklist step + dialog that sends a hire's contact details to their supervisor",
  cmtvntro8000004k0ko16ceoa: "Feedback button on mobile, and Make contact (vCard) on the hire page",
  cmtvpen09000004l6fpada59o: "Travel spend by month, hired vs not hired, on /travel",
  cmtvpibgm000204l6wknqgzjb: "Ask about reimbursements — editable Front-template send, template picked in the dialog",
  cmtw239fd000604l2ec1ap816: "term button on the crew chart: notice date + last day, and the X now asks first",
  cmtw2f85p000h04l2clhocmuk: "Backup plan panel per seat — internal ladder plus ranked outside candidates",

  // --- older items cleared in the same batch ---
  cmtk7edgg000204juepdudvay: "Note editor cursor jump and the phantom bold, both fixed and driven in a real browser",
  cmthjmp2y000304iguobr4r5i: "Duplicate scan now names every pair it finds, with a Reopen to merge",
  cmtizpmbj000004leuubutmwi: "Business cards: next-order target line, editable, never a gate",
  cmtk7yfmi000304juae332isb: "Business card status no longer reverts; the checklist N/A now shows through",
  cmtizg9bx000004l43s1xd0i9: "The stale red reminder alert is gone and completing a session clears its flag",
  cmtiziq3s000004josijy3rf7: "Credit card column is three-way now, and the header says Credit card",
  cmtk9k1tr000204ic31oscym3: "Travel pending names the people, and the list reads the real trip",
  cmtk9llnv000404ico6j471wz: "Attendee names link to their checklist in a new tab"
};

/**
 * Left alone ON PURPOSE, with the reason. Printed by the dry run so the list of
 * what is NOT being closed is as visible as the list that is — that is the half
 * of this that can quietly lose work.
 */
const HELD: Record<string, string> = {
  cmtk7a8mt000004juaivhkf88: "Private HR note — BUILT, but she has not looked at it yet",
  cmtngd2ay001704jo205yf9bk: "Checklist order — the audit is done and the live bug is fixed, but she still has to confirm the PRD section is where she wants it",
  cmthwk0a9000004l2rqrh3qv9: "Nav scrollbar / pop-out — the pop-out is now collapsed-only, waiting on her to confirm that is what she meant",
  cmthlyx3z000004l8icennhe5: "Orientation email body / time / location — researched, NOT built",
  cmtg6yl0f000204l3r19h64lb: "Jobs page redesign — she wants visuals before anything is built"
};

async function main() {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  if (undo) {
    if (!existsSync(UNDO)) throw new Error("No UNDO.json — nothing was applied from here.");
    const saved = JSON.parse(readFileSync(UNDO, "utf8")) as Array<{ id: string; status: string }>;
    for (const row of saved) {
      await prisma.feedback.update({ where: { id: row.id }, data: { status: row.status } });
    }
    console.log(`Restored ${saved.length} rows to the status they had before.`);
    await prisma.$disconnect();
    return;
  }

  // Read the CURRENT state of every row named here, plus the whole table as the
  // positive control — so a missing id shows up as missing rather than silently
  // doing nothing.
  const ids = Object.keys(DONE);
  const rows = await prisma.feedback.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, type: true, message: true }
  });
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const missing = ids.filter((id) => !byId.has(id));

  const all = await prisma.feedback.groupBy({ by: ["status"], _count: { status: true } });

  const lines: string[] = [];
  lines.push(`Feedback rows by status right now: ${all.map((a) => `${a.status}=${a._count.status}`).join(", ")}`);
  lines.push(`Named as done here: ${ids.length}. Found: ${rows.length}. Missing: ${missing.length}`);
  if (missing.length) lines.push(`  MISSING IDS (check these): ${missing.join(", ")}`);
  lines.push("");
  lines.push("WOULD CHANGE TO DONE");
  let changing = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    if (row.status === "DONE") {
      lines.push(`  (already DONE) ${id}  ${DONE[id]}`);
      continue;
    }
    changing++;
    lines.push(`  ${row.status} -> DONE  ${id}`);
    lines.push(`      ${DONE[id]}`);
    lines.push(`      her words: ${row.message.replace(/\s+/g, " ").trim().slice(0, 110)}`);
  }
  lines.push("");
  lines.push("DELIBERATELY LEFT OPEN");
  for (const [id, why] of Object.entries(HELD)) {
    const row = await prisma.feedback.findUnique({ where: { id }, select: { status: true } });
    lines.push(`  ${row?.status ?? "NOT FOUND"}  ${id}  ${why}`);
  }
  lines.push("");
  lines.push(`${changing} row${changing === 1 ? "" : "s"} would change.`);

  const text = lines.join("\n");
  writeFileSync(PLAN, text + "\n");
  console.log(text);
  console.log(`\nPlan written to ${PLAN}`);

  if (!apply) {
    console.log("\nDry run. Nothing written. Re-run with --apply to do it.");
    await prisma.$disconnect();
    return;
  }

  // Undo record FIRST, so an interrupted apply is still reversible.
  writeFileSync(UNDO, JSON.stringify(rows.map((r) => ({ id: r.id, status: r.status })), null, 2));
  let changed = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.status === "DONE") continue;
    await prisma.feedback.update({ where: { id }, data: { status: "DONE" } });
    changed++;
  }
  const after = await prisma.feedback.groupBy({ by: ["status"], _count: { status: true } });
  console.log(`\nApplied. ${changed} rows set to DONE.`);
  console.log(`By status now: ${after.map((a) => `${a.status}=${a._count.status}`).join(", ")}`);
  console.log(`Undo record: ${UNDO} (re-run with --undo to put it all back)`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
