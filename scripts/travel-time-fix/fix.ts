import "dotenv/config";
import { writeFileSync, readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../prisma/generated/client/client";
import { zonedWallClockToUtc } from "../../lib/booking/timezone";
import { DEFAULT_TIMEZONE } from "../../lib/calendar/timezones";

/**
 * Re-anchor travel item times that were stored as if UTC.
 *
 * The confirmation extractor used new Date() on a bare wall-clock string, which
 * reads it in the runtime's zone — UTC on the server. So a 9:37am departure was
 * written as 09:37Z, i.e. 3:37am Mountain, and every flight read six hours early.
 * The parser is fixed; these are the rows written before that.
 *
 * The correction: take the wall-clock the row currently shows in UTC and re-read
 * it as MOUNTAIN. 09:37Z -> 09:37 Mountain -> 15:37Z.
 *
 * Only rows carrying a real time are touched. A row at exactly midnight UTC is a
 * date-only record and re-anchoring it would invent a departure time.
 *
 *   npx tsx scripts/travel-time-fix/fix.ts           # dry run
 *   npx tsx scripts/travel-time-fix/fix.ts --apply   # writes + UNDO.json
 *   npx tsx scripts/travel-time-fix/fix.ts --undo
 */

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
const UNDO = "scripts/travel-time-fix/UNDO.json";

const isMidnightUtc = (d: Date) => d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;

function reanchor(d: Date): Date {
  return zonedWallClockToUtc(
    d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), DEFAULT_TIMEZONE
  );
}
const mt = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { timeZone: DEFAULT_TIMEZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(d);

(async () => {
  try {
    if (process.argv.includes("--undo")) {
      const saved = JSON.parse(readFileSync(UNDO, "utf8")) as { items: { id: string; startsAt: string }[] };
      for (const i of saved.items) await prisma.travelItem.update({ where: { id: i.id }, data: { startsAt: new Date(i.startsAt) } });
      console.log(`Restored ${saved.items.length} item(s).`);
      return;
    }

    const items = await prisma.travelItem.findMany({
      where: { startsAt: { not: null } },
      select: { id: true, type: true, vendor: true, startsAt: true, trip: { select: { newHire: { select: { name: true } }, candidate: { select: { displayName: true } } } } }
    });

    const targets = items.filter((i) => !isMidnightUtc(i.startsAt!));
    console.log(`${items.length} dated travel items; ${targets.length} carry a time and would be re-anchored:\n`);
    for (const i of targets) {
      const who = i.trip.newHire?.name ?? i.trip.candidate?.displayName ?? "?";
      const next = reanchor(i.startsAt!);
      console.log(`  ${who.padEnd(18)} ${i.type.padEnd(7)} ${String(i.vendor ?? "-").padEnd(12)} ${mt(i.startsAt!).padEnd(18)} ->  ${mt(next)}`);
    }
    console.log(`\n${items.length - targets.length} date-only item(s) left alone.`);

    if (!process.argv.includes("--apply")) { console.log("\nDRY RUN — nothing written."); return; }

    writeFileSync(UNDO, JSON.stringify({ writtenAt: new Date().toISOString(), items: targets.map((i) => ({ id: i.id, startsAt: i.startsAt!.toISOString() })) }, null, 2));
    for (const i of targets) await prisma.travelItem.update({ where: { id: i.id }, data: { startsAt: reanchor(i.startsAt!) } });
    console.log(`\nAPPLIED to ${targets.length} item(s). Undo -> npx tsx scripts/travel-time-fix/fix.ts --undo`);
  } finally {
    await prisma.$disconnect();
  }
})();
