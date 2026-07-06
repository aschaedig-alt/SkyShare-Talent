// Merge the 3 user-confirmed fuzzy pairs:
//  - Brannon Bedde (junk, no role) → Brannon Beddes (Maintenance Tech).
//  - Angel Martinez (terminated, junk 2019 dates) → Angel Pagan-Martinez (active,
//    real journey) — keep the active record's clean journey, drop the junk one.
//  - Rozella Nelson (earlier 2013 stint history, no role) → Rozie Nelson (Lead
//    Technician) — carry the earlier stints + earliest start; keep name "Rozella
//    Nelson". (The Rozie-Nelson vs Rozella-Allen surname link is left for the user.)
//   npx tsx prisma/apply-fuzzy-answers.ts            (preview)
//   npx tsx prisma/apply-fuzzy-answers.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);

async function get(id: string) {
  return prisma.newHire.findUnique({ where: { id }, select: { id: true, name: true, employmentStatus: true, terminationDate: true, startDate: true } });
}
// Move keepable relations off the drop, then delete it (cascades its roles/stints/tasks).
async function absorb(survId: string, dropId: string) {
  await prisma.travelTrip.updateMany({ where: { newHireId: dropId }, data: { newHireId: survId } });
  await prisma.redemption.updateMany({ where: { newHireId: dropId }, data: { newHireId: survId } });
  await prisma.recognition.updateMany({ where: { giverId: dropId }, data: { giverId: survId } });
  await prisma.recognition.updateMany({ where: { recipientId: dropId }, data: { recipientId: survId } });
  await prisma.newHire.delete({ where: { id: dropId } });
}

async function main() {
  // 1) Brannon Beddes (keep) ← Brannon Bedde (junk)
  const beddes = "cmr5dxfsh00bh0orm9vunt6jm", bedde = "cmr5dxhon00ch0ormmp3su6q5";
  log(`Brannon Beddes  ←  Brannon Bedde (junk record removed)`);
  if (commit) await absorb(beddes, bedde);

  // 2) Angel Pagan-Martinez (keep, active, real journey) ← Angel Martinez (junk 2019)
  const pagan = "cmr5dwwjo002h0ormef8hqv5n", martinez = "cmr5dxew300az0ormk0h3yj59";
  log(`Angel Pagan-Martinez  ←  Angel Martinez (junk record removed; kept active journey)`);
  if (commit) await absorb(pagan, martinez);

  // 3) Rozie Nelson (keep role) ← Rozella Nelson (carry earlier 2013 stints + start)
  const rozie = "cmr5dww7l002b0ormx8cnivn2", rozella = "cmr5dxl2e00e40orm7lspodwh";
  const [rz, rl] = await Promise.all([get(rozie), get(rozella)]);
  if (rz && rl) {
    const start = [rz.startDate, rl.startDate].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
    const bothTerm = rz.employmentStatus === "TERMINATED" && rl.employmentStatus === "TERMINATED";
    const term = bothTerm ? [rz.terminationDate, rl.terminationDate].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null : null;
    log(`Rozella Nelson  ←  merge Rozie + Rozella Nelson  [${bothTerm ? "TERMINATED " + d(term) : "ACTIVE"}] start ${d(start)}`);
    if (commit) {
      await prisma.employmentStint.updateMany({ where: { newHireId: rozella }, data: { newHireId: rozie } });
      await absorb(rozie, rozella);
      await prisma.newHire.update({ where: { id: rozie }, data: { name: "Rozella Nelson", startDate: start, ...(bothTerm ? { employmentStatus: "TERMINATED", terminationDate: term, stage: "ARCHIVED" } : {}) } });
    }
  } else log(`(skip Nelson — rozie:${!!rz} rozella:${!!rl})`);

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
