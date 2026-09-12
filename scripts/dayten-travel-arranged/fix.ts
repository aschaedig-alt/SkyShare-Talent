/**
 * One row: Dayten Schureman's orientation travel flag, NEEDED -> ARRANGED.
 *
 * His travel IS booked — an ORIENTATION trip in BOOKED status carrying $2,685.96
 * — but the manual attendee flag was never moved off NEEDED. That is what made
 * the orientation LIST say "1 travel pending" while the session DETAIL said
 * Booked, for the same person. The list now reads the real trip when one exists,
 * so the pill is already gone; this clears the underlying flag so the two agree
 * at the source rather than one compensating for the other.
 *
 * Approved directly on 2026-09-11: "Dayton's travel should be marked as booked.
 * It should not be pending anymore. It's done, so go ahead and fix that."
 *
 * ARRANGED, not BOOKED — that is the word the attendee dropdown and the PATCH
 * route both use (app/api/orientation/attendees/[id]/route.ts). BOOKED is the
 * TravelTrip vocabulary and would be rejected.
 *
 *   npx tsx scripts/dayten-travel-arranged/fix.ts           dry run
 *   npx tsx scripts/dayten-travel-arranged/fix.ts --apply   do it
 *   npx tsx scripts/dayten-travel-arranged/fix.ts --undo     put it back
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const HERE = join(process.cwd(), "scripts", "dayten-travel-arranged");
const UNDO = join(HERE, "UNDO.json");
const ATTENDEE_ID = "cmt0idp2r000004kv4997q3mm";

async function main() {
  if (!existsSync(HERE)) mkdirSync(HERE, { recursive: true });
  const apply = process.argv.includes("--apply");
  const undo = process.argv.includes("--undo");

  if (undo) {
    if (!existsSync(UNDO)) throw new Error("No UNDO.json — nothing was applied from here.");
    const saved = JSON.parse(readFileSync(UNDO, "utf8")) as { id: string; travelStatus: string | null };
    await prisma.orientationAttendee.update({ where: { id: saved.id }, data: { travelStatus: saved.travelStatus ?? "NA" } });
    console.log(`Restored ${saved.id} to ${saved.travelStatus}`);
    await prisma.$disconnect();
    return;
  }

  // The whole scope, so a single-row change is read next to its alternatives.
  const spread = await prisma.orientationAttendee.groupBy({ by: ["travelStatus"], _count: { _all: true } });
  console.log("Every OrientationAttendee.travelStatus value in use:");
  for (const r of spread) console.log(`  ${String(r.travelStatus).padEnd(10)} ${r._count._all}`);

  const row = await prisma.orientationAttendee.findUnique({
    where: { id: ATTENDEE_ID },
    select: {
      id: true,
      travelStatus: true,
      newHire: { select: { name: true, travelTrips: { select: { purpose: true, status: true, items: { select: { amount: true } } } } } }
    }
  });
  if (!row) throw new Error(`Attendee ${ATTENDEE_ID} not found — do not guess at another row.`);

  const trips = row.newHire?.travelTrips ?? [];
  const total = trips.flatMap((t) => t.items).reduce((s, i) => s + (i.amount ?? 0), 0);
  console.log(`\n${row.newHire?.name}: travelStatus ${row.travelStatus} -> ARRANGED`);
  console.log(`  trips behind it: ${trips.map((t) => `${t.purpose}/${t.status}`).join(", ") || "NONE"}  total $${total.toFixed(2)}`);

  // Refuse if the justification is not there. The whole reason for this change is
  // that a booked trip exists; without one there is nothing to reconcile to.
  const booked = trips.some((t) => t.status === "BOOKED" || t.status === "COMPLETED");
  if (!booked) throw new Error("No booked or completed trip behind this attendee — refusing to mark travel arranged.");
  if (row.travelStatus === "ARRANGED") { console.log("\nAlready ARRANGED. Nothing to do."); await prisma.$disconnect(); return; }

  if (!apply) {
    console.log("\nDry run. Nothing written. Re-run with --apply.");
    await prisma.$disconnect();
    return;
  }

  writeFileSync(UNDO, JSON.stringify({ id: row.id, travelStatus: row.travelStatus }, null, 2));
  await prisma.orientationAttendee.update({ where: { id: row.id }, data: { travelStatus: "ARRANGED" } });
  const after = await prisma.orientationAttendee.groupBy({ by: ["travelStatus"], _count: { _all: true } });
  console.log(`\nApplied. Now: ${after.map((a) => `${a.travelStatus}=${a._count._all}`).join(", ")}`);
  console.log(`Undo: ${UNDO}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(String(e));
  await prisma.$disconnect();
  process.exit(1);
});
