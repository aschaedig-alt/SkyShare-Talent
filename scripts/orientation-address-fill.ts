/**
 * Fill in OrientationSession.address where it is missing, so the email's location
 * override can actually fire.
 *
 * WHY THIS EXISTS. lib/front/orientation-email.ts rewrites the Location: line of a
 * Front template from session.address when the two disagree. That shipped on Aug 31
 * and has never been able to fire, because the sessions that matter hold a null
 * address. The capability was correct and the data was empty - a build could not
 * fix it, only a write could.
 *
 * WHY HQ IS THE RIGHT VALUE HERE, and this is evidence rather than a guess:
 *   1. Every one of the 6 sessions has location = "SkyShare HQ, Salt Lake City".
 *   2. Two past sessions (Jun 15, Jul 7) already carry the address
 *      "180 2400 W, Salt Lake City, UT 84116" - so that exact string is the
 *      established value in this table, not something invented here.
 *   3. Front templates rsp_qnije and rsp_qnioq both read
 *      "Location: 180 2400 W, Salt Lake City, UT 84116" already.
 * Because of 3, writing HQ is an IDENTITY change as far as the email is concerned:
 * the override anchors on the Location: label, finds the same string, and rewrites
 * nothing. The email that goes out is byte-identical to today's. What it buys is
 * that the machinery is live, so the day a session moves to Atlantic Aviation or
 * Ogden, changing the address on that session actually changes the email.
 *
 * The other two venues he named, for whoever needs them later:
 *   Atlantic Aviation FBO   369 N 2370 W, Salt Lake City, UT 84116
 *   Ogden                   3715 Airport Road, Ogden, UT 84405
 * Neither is written by this script. If a session is at one of those, set it on the
 * session page - that is a per-session fact, not a backfill.
 *
 * SCOPE: FUTURE sessions with a null or empty address. Past sessions are left alone
 * on purpose - no mail goes out for them, so filling them would be a live write
 * that changes nothing for anybody.
 *
 * USAGE
 *   npx tsx scripts/orientation-address-fill.ts            # dry run, writes nothing
 *   npx tsx scripts/orientation-address-fill.ts --apply    # writes, records undo
 *   npx tsx scripts/orientation-address-fill.ts --undo     # restores from the record
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string })
});

const HQ_ADDRESS = "180 2400 W, Salt Lake City, UT 84116";
// process.cwd(), NOT __dirname: under tsx, __dirname resolved into
// prisma/generated/client, which is gitignored - so the undo record landed
// somewhere it could never be committed. The whole point of the record is that it
// travels with the repo.
const OUT_DIR = join(process.cwd(), "scripts", "orientation-address-fill");
const UNDO = join(OUT_DIR, "UNDO.json");

type UndoRow = { id: string; date: string; address: string | null };

const apply = process.argv.includes("--apply");
const undo = process.argv.includes("--undo");

async function main() {
  if (undo) return runUndo();

  // Read EVERY session, not just the ones that need changing. A report that lists
  // only its targets cannot be checked - you cannot see what it decided to skip.
  const all = await prisma.orientationSession.findMany({
    orderBy: { date: "asc" },
    select: { id: true, date: true, address: true, location: true, _count: { select: { attendees: true } } }
  });

  const now = Date.now();
  const blank = (v: string | null) => !v || !v.trim();

  console.log(`ALL ${all.length} orientation sessions, and what this script does with each:`);
  const targets: typeof all = [];
  for (const s of all) {
    const future = s.date.getTime() > now;
    let verdict: string;
    if (!future) verdict = "SKIP - past, no mail goes out for it";
    else if (!blank(s.address)) verdict = "SKIP - already has an address";
    else {
      verdict = "FILL";
      targets.push(s);
    }
    console.log(
      `  ${s.date.toISOString().slice(0, 10)}  ${future ? "future" : "past  "}  attendees=${s._count.attendees}  ` +
        `address=${s.address === null ? "null" : JSON.stringify(s.address)}  -> ${verdict}`
    );
    console.log(`      location=${JSON.stringify(s.location)}`);
  }

  console.log(`\nWould set address = ${JSON.stringify(HQ_ADDRESS)} on ${targets.length} session(s).`);
  if (!targets.length) {
    console.log("Nothing to do.");
    await prisma.$disconnect();
    return;
  }

  // Anything whose location does NOT read as HQ must not be assumed to be at HQ.
  const odd = targets.filter((t) => !/hq|headquarters/i.test(t.location ?? ""));
  if (odd.length) {
    console.log(`\nREFUSING ${odd.length} of them: their location does not say HQ, so HQ cannot be assumed:`);
    for (const o of odd) console.log(`  ${o.date.toISOString().slice(0, 10)}  location=${JSON.stringify(o.location)}`);
    console.log("Set those on the session page instead.");
  }
  const safe = targets.filter((t) => /hq|headquarters/i.test(t.location ?? ""));
  console.log(`\nProceeding on ${safe.length}.`);

  if (!apply) {
    console.log("\nDRY RUN - nothing written. Re-run with --apply.");
    await prisma.$disconnect();
    return;
  }

  const undoRows: UndoRow[] = safe.map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    address: s.address
  }));
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  // The undo record is written BEFORE the change, so a crash mid-write still
  // leaves something to restore from.
  writeFileSync(UNDO, JSON.stringify({ writtenAt: new Date().toISOString(), newValue: HQ_ADDRESS, rows: undoRows }, null, 2));
  console.log(`\nundo record written: ${UNDO}`);

  for (const s of safe) {
    await prisma.orientationSession.update({ where: { id: s.id }, data: { address: HQ_ADDRESS } });
    console.log(`  set ${s.date.toISOString().slice(0, 10)}  ${s.id}`);
  }

  // Read back rather than trusting the update count.
  const after = await prisma.orientationSession.findMany({
    where: { id: { in: safe.map((s) => s.id) } },
    select: { id: true, date: true, address: true }
  });
  console.log("\nread back from the database:");
  for (const a of after) console.log(`  ${a.date.toISOString().slice(0, 10)}  address=${JSON.stringify(a.address)}`);

  await prisma.$disconnect();
}

async function runUndo() {
  if (!existsSync(UNDO)) {
    console.log(`No undo record at ${UNDO} - nothing to undo.`);
    await prisma.$disconnect();
    return;
  }
  const rec = JSON.parse(readFileSync(UNDO, "utf8")) as { rows: UndoRow[] };
  console.log(`restoring ${rec.rows.length} session(s) from the record:`);
  for (const r of rec.rows) {
    await prisma.orientationSession.update({ where: { id: r.id }, data: { address: r.address } });
    console.log(`  ${r.date.slice(0, 10)}  address back to ${r.address === null ? "null" : JSON.stringify(r.address)}`);
  }
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
