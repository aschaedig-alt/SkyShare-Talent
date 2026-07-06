// Apply the user's answers to the arrivals/departures review items:
//  - Merge 2 late-found duplicates (vowel/spelling variants the scan missed),
//    keeping the TERMINATED original: Rozie→Rozella Allen (term 2025-01-13),
//    Allen Youssef←→Yousef (term 2024-10-06).
//  - Wesley Snowder: record his known rehire stint + role (2024-04-08→2024-09-29);
//    first tenure ended 2023-03-29, original hire date unknown → kept in a note.
//  - Create two employees the sheet's typo'd dates had blocked: Carolyn Sanchez
//    (active, 2024-08-12) and Ricky Lee (active rehire, 2025-05-12).
//   npx tsx prisma/apply-answers.ts            (preview)
//   npx tsx prisma/apply-answers.ts --commit   (apply)
import { prisma } from "@/lib/prisma";
import { resolveFleetPosition } from "@/lib/fleet/positions";

const commit = process.argv.includes("--commit");
const U = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);

async function one(name: string) {
  const r = await prisma.newHire.findFirst({ where: { name }, select: { id: true, name: true, employmentStatus: true, terminationDate: true, startDate: true } });
  return r;
}

// Move a duplicate's keepable relations onto the survivor, then delete it.
async function absorb(survivorId: string, dropId: string) {
  await prisma.travelTrip.updateMany({ where: { newHireId: dropId }, data: { newHireId: survivorId } });
  await prisma.redemption.updateMany({ where: { newHireId: dropId }, data: { newHireId: survivorId } });
  await prisma.recognition.updateMany({ where: { giverId: dropId }, data: { giverId: survivorId } });
  await prisma.recognition.updateMany({ where: { recipientId: dropId }, data: { recipientId: survivorId } });
  await prisma.newHire.delete({ where: { id: dropId } }); // cascades the dup's remaining roles/stints/tasks
}

async function main() {
  // 1) Rozie Allen (active dup) -> Rozella Allen (terminated 2025-01-13)
  const rozella = await one("Rozella Allen");
  const rozie = await one("Rozie Allen");
  if (rozella && rozie) {
    log(`Merge "Rozie Allen" → "Rozella Allen" (TERMINATED 2025-01-13)`);
    if (commit) {
      const term = U(2025, 1, 13);
      // keep Rozella's role; carry Rozie's stint over, closed at the term date
      await prisma.employmentStint.updateMany({ where: { newHireId: rozie.id }, data: { newHireId: rozella.id } });
      await prisma.roleAssignment.deleteMany({ where: { newHireId: rozie.id } });
      await absorb(rozella.id, rozie.id);
      await prisma.employmentStint.updateMany({ where: { newHireId: rozella.id, endDate: null }, data: { endDate: term } });
      await prisma.roleAssignment.updateMany({ where: { newHireId: rozella.id, endDate: null }, data: { endDate: term } });
      await prisma.newHire.update({ where: { id: rozella.id }, data: { employmentStatus: "TERMINATED", terminationDate: term, stage: "ARCHIVED" } });
    }
  } else log(`(skip Allen merge — Rozella:${!!rozella} Rozie:${!!rozie})`);

  // 2) Allen Yousef (terminated 2024-10-06) <-> Allen Youssef (active, real role). Keep
  // Youssef (richer role: 560XL Captain since 2023-09-12), apply the termination.
  const yousef = await one("Allen Yousef");
  const youssef = await one("Allen Youssef");
  if (yousef && youssef) {
    log(`Merge "Allen Yousef" → "Allen Youssef", TERMINATED 2024-10-06`);
    if (commit) {
      const term = U(2024, 10, 6);
      await absorb(youssef.id, yousef.id);
      await prisma.roleAssignment.updateMany({ where: { newHireId: youssef.id, endDate: null }, data: { endDate: term } });
      const hasStint = await prisma.employmentStint.count({ where: { newHireId: youssef.id } });
      if (!hasStint) await prisma.employmentStint.create({ data: { newHireId: youssef.id, startDate: youssef.startDate ?? U(2023, 9, 12), endDate: term } });
      else await prisma.employmentStint.updateMany({ where: { newHireId: youssef.id, endDate: null }, data: { endDate: term } });
      await prisma.newHire.update({ where: { id: youssef.id }, data: { employmentStatus: "TERMINATED", terminationDate: term, stage: "ARCHIVED" } });
    }
  } else log(`(skip Yousef merge — Yousef:${!!yousef} Youssef:${!!youssef})`);

  // 3) Wesley Snowder: known rehire tenure + note the earlier one (hire date unknown).
  const wes = await one("Wesley Snowder");
  if (wes) {
    log(`Wesley Snowder: add stint+role 2024-04-08→2024-09-29; note first term 2023-03-29`);
    if (commit) {
      await prisma.employmentStint.deleteMany({ where: { newHireId: wes.id } });
      await prisma.roleAssignment.deleteMany({ where: { newHireId: wes.id } });
      await prisma.employmentStint.create({ data: { newHireId: wes.id, startDate: U(2024, 4, 8), endDate: U(2024, 9, 29), note: "Rehired" } });
      await prisma.roleAssignment.create({ data: { newHireId: wes.id, title: "Line Service Technician", startDate: U(2024, 4, 8), endDate: U(2024, 9, 29), transitionType: "HIRE" } });
      await prisma.newHire.update({ where: { id: wes.id }, data: { position: "Line Service Technician", startDate: U(2024, 4, 8), employmentStatus: "TERMINATED", terminationDate: U(2024, 9, 29), stage: "ARCHIVED", notes: "First tenure ended 03/29/2023 (original hire date unknown); rehired 04/08/2024, departed 09/29/2024." } });
    }
  }

  // 4) Create Carolyn Sanchez + Ricky Lee (corrected dates; both active, Ricky a rehire).
  const creates = [
    { name: "Carolyn Sanchez", position: "Accounts Receivable/Payable Specialist", start: U(2024, 8, 12) },
    { name: "Ricky Lee", position: "Director of Safety", start: U(2025, 5, 12) }
  ];
  for (const c of creates) {
    const exists = await prisma.newHire.findFirst({ where: { name: c.name }, select: { id: true } });
    if (exists) { log(`(skip create ${c.name} — already exists)`); continue; }
    log(`Create ${c.name} · ${c.position} · start ${c.start.toISOString().slice(0, 10)} (active)`);
    if (commit) {
      const fp = resolveFleetPosition(c.position);
      const nh = await prisma.newHire.create({ data: { name: c.name, position: fp?.title ?? c.position, startDate: c.start, stage: "POST_ONBOARD", employmentStatus: "ACTIVE", importKey: `answers:${c.name.toLowerCase()}` } });
      await prisma.roleAssignment.create({ data: { newHireId: nh.id, title: fp?.title ?? c.position, fleetPositionSlug: fp?.slug ?? null, seat: fp?.seat ?? null, aircraft: fp?.aircraft ?? null, startDate: c.start, endDate: null, transitionType: "HIRE" } });
      await prisma.employmentStint.create({ data: { newHireId: nh.id, startDate: c.start, endDate: null } });
    }
  }

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
