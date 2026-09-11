/**
 * Close the feedback his Sept-11 answers settled.
 *
 * Same shape as apply.ts: hand-picked ids, each with the reason, a dry run by
 * default, and an undo file written before anything changes. A date-range query
 * would sweep in the six that are genuinely still open.
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
const UNDO = join(HERE, "UNDO-round2.json");

const DONE: Record<string, string> = {
  cmthwk0a9000004l2rqrh3qv9: "Nav pop-out — he answered: collapsed-only is good as it is for now. The scrollbar half was already fixed on Aug 31.",
  cmtk7a8mt000004juaivhkf88: "Private HR note — built, and he has now seen it: \"the private notes section that we've added is good\".",
  cmtngd2ay001704jo205yf9bk: "Checklist order — the live bug in Start new onboarding is fixed, and he confirmed PRD belongs first (done before a pilot offer goes out).",
  cmtx8hb1h0000rsrmy9xhzz39: "Job title size — he picked 11px from the samples; applied.",
  cmtx9r2u40008rsrm3jk8ye8z: "Tab row — he picked the two-row layout from the samples; applied. All eleven tabs fit with no scrollbar.",
  cmtx9i4ek000404jvxf8mnmto: "Matt Smith — he picked option A. Canceled hires now leave the checklist, grid, dashboard and every count, and land in Archived.",
  cmtx9vbcs000arsrmomotbmam: "Not-needed formatting — the control is out of the layout flow now, so it cannot change row height. Measured: the optional inputs were 19px low and now match."
};

/** Still open, with the reason, printed so what is NOT closing is as visible as what is. */
const HELD: Record<string, string> = {
  cmtg6yl0f000204l3r19h64lb: "Jobs page redesign — he wants visuals before anything is built. Not started.",
  cmthlyx3z000004l8icennhe5: "Orientation emails — NOT BUILT. Now scoped wider: multiple SkyShare locations, not just a time change.",
  cmtx9cvi4000004jverpxbxtg: "Travel purposes — NOT BUILT. His billing rule is clear now; the combined indoc+orientation value still has to be added.",
  cmtx9et7i000204jvfs1ot43n: "New trips should start empty — NOT BUILT.",
  cmtx9lbbd0004rsrmj0des0tv: "Clicking a month should drive the tiles — NOT BUILT. Same rebuild as the one below.",
  cmtx9ms2g0006rsrm8b26aazb: "Executive travel reporting — NOT BUILT. He named the readers and the decisions, which changes the design."
};

async function main() {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  if (undo) {
    if (!existsSync(UNDO)) throw new Error("No UNDO-round2.json — nothing was applied from here.");
    const saved = JSON.parse(readFileSync(UNDO, "utf8")) as Array<{ id: string; status: string }>;
    for (const r of saved) await prisma.feedback.update({ where: { id: r.id }, data: { status: r.status } });
    console.log(`Restored ${saved.length} rows.`);
    await prisma.$disconnect();
    return;
  }

  const ids = Object.keys(DONE);
  const rows = await prisma.feedback.findMany({ where: { id: { in: ids } }, select: { id: true, status: true, message: true } });
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const missing = ids.filter((id) => !byId.has(id));
  const before = await prisma.feedback.groupBy({ by: ["status"], _count: { status: true } });

  console.log(`By status now: ${before.map((b) => `${b.status}=${b._count.status}`).join(", ")}`);
  console.log(`Named here: ${ids.length}. Found: ${rows.length}. Missing: ${missing.length}`);
  if (missing.length) console.log(`  MISSING: ${missing.join(", ")}`);

  console.log("\nWOULD CLOSE");
  let changing = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row) continue;
    if (row.status === "DONE") { console.log(`  (already DONE) ${id}`); continue; }
    changing++;
    console.log(`  ${row.status} -> DONE  ${id}`);
    console.log(`      ${DONE[id]}`);
  }

  console.log("\nSTAYING OPEN");
  for (const [id, why] of Object.entries(HELD)) {
    const row = await prisma.feedback.findUnique({ where: { id }, select: { status: true } });
    console.log(`  ${(row?.status ?? "NOT FOUND").padEnd(10)} ${id}  ${why}`);
  }
  console.log(`\n${changing} row${changing === 1 ? "" : "s"} would change.`);

  if (!apply) { console.log("\nDry run. Nothing written."); await prisma.$disconnect(); return; }

  writeFileSync(UNDO, JSON.stringify(rows.map((r) => ({ id: r.id, status: r.status })), null, 2));
  let changed = 0;
  for (const id of ids) {
    const row = byId.get(id);
    if (!row || row.status === "DONE") continue;
    await prisma.feedback.update({ where: { id }, data: { status: "DONE" } });
    changed++;
  }
  const after = await prisma.feedback.groupBy({ by: ["status"], _count: { status: true } });
  console.log(`\nApplied. ${changed} closed. By status now: ${after.map((a) => `${a.status}=${a._count.status}`).join(", ")}`);
  console.log(`Undo: ${UNDO}`);
  await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
