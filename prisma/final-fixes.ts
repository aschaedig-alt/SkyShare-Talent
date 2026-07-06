// Final two corrections from the user:
//  A) Wesley Snowder — two full tenures now known:
//       03/29/2023 → 10/18/2023, then rehired 04/08/2024 → 09/29/2024 (Line Service Technician).
//  B) Rozella Nelson = Rozella Allen (same person; maiden Nelson → married Allen,
//     goes by "Rozie"). Merge the Nelson record into "Rozella Allen".
//   npx tsx prisma/final-fixes.ts            (preview)
//   npx tsx prisma/final-fixes.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const U = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—");
const normTitle = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);

async function main() {
  // A) Wesley Snowder — rebuild with both tenures.
  const wes = await prisma.newHire.findFirst({ where: { name: "Wesley Snowder" }, select: { id: true } });
  if (wes) {
    log(`Wesley Snowder: tenures 2023-03-29→2023-10-18 and 2024-04-08→2024-09-29 (terminated)`);
    if (commit) {
      await prisma.employmentStint.deleteMany({ where: { newHireId: wes.id } });
      await prisma.roleAssignment.deleteMany({ where: { newHireId: wes.id } });
      await prisma.employmentStint.create({ data: { newHireId: wes.id, startDate: U(2023, 3, 29), endDate: U(2023, 10, 18), note: "First tenure" } });
      await prisma.employmentStint.create({ data: { newHireId: wes.id, startDate: U(2024, 4, 8), endDate: U(2024, 9, 29), note: "Rehired" } });
      await prisma.roleAssignment.create({ data: { newHireId: wes.id, title: "Line Service Technician", startDate: U(2023, 3, 29), endDate: U(2023, 10, 18), transitionType: "HIRE" } });
      await prisma.roleAssignment.create({ data: { newHireId: wes.id, title: "Line Service Technician", startDate: U(2024, 4, 8), endDate: U(2024, 9, 29), transitionType: "HIRE" } });
      await prisma.newHire.update({ where: { id: wes.id }, data: { position: "Line Service Technician", startDate: U(2023, 3, 29), employmentStatus: "TERMINATED", terminationDate: U(2024, 9, 29), stage: "ARCHIVED", notes: "Two tenures: 03/29/2023–10/18/2023, then rehired 04/08/2024–09/29/2024." } });
    }
  } else log(`(skip Wesley — not found)`);

  // B) Merge Rozella Nelson (drop) into Rozella Allen (survivor, married name).
  const [allen, nelson] = await Promise.all([
    prisma.newHire.findFirst({ where: { name: "Rozella Allen" }, select: { id: true, employmentStatus: true, terminationDate: true, startDate: true, pointsBalance: true, roleAssignments: { select: { title: true, seat: true, aircraft: true, fleetPositionSlug: true, department: true, startDate: true } } } }),
    prisma.newHire.findFirst({ where: { name: "Rozella Nelson" }, select: { id: true, employmentStatus: true, terminationDate: true, startDate: true, pointsBalance: true, roleAssignments: { select: { title: true, seat: true, aircraft: true, fleetPositionSlug: true, department: true, startDate: true } }, employmentStints: { select: { startDate: true, endDate: true, note: true } } } })
  ]);
  if (allen && nelson) {
    const start = [allen.startDate, nelson.startDate].filter(Boolean).sort((a, b) => a!.getTime() - b!.getTime())[0] ?? null;
    const term = [allen.terminationDate, nelson.terminationDate].filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null;
    // Union roles by title, rechain by date; last role closes at the final term.
    const byTitle = new Map<string, { title: string; seat: string | null; aircraft: string | null; fleetPositionSlug: string | null; department: string | null; startDate: Date }>();
    for (const r of [...allen.roleAssignments, ...nelson.roleAssignments]) {
      const k = normTitle(r.title);
      const cur = byTitle.get(k);
      if (!cur) byTitle.set(k, { ...r });
      else if (r.startDate < cur.startDate) cur.startDate = r.startDate;
    }
    const seq = [...byTitle.values()].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    const chain = seq.map((r, i) => ({ r, end: i < seq.length - 1 ? seq[i + 1].startDate : term, tt: i === 0 ? "HIRE" : "PROMOTION" }));
    log(`Rozella Allen  ←  merge Rozella Nelson (same person)  [TERMINATED ${d(term)}] start ${d(start)}`);
    for (const c of chain) console.log(`    ${c.r.title} ${d(c.r.startDate)}→${d(c.end)} ${c.tt}`);
    if (commit) {
      await prisma.travelTrip.updateMany({ where: { newHireId: nelson.id }, data: { newHireId: allen.id } });
      await prisma.redemption.updateMany({ where: { newHireId: nelson.id }, data: { newHireId: allen.id } });
      await prisma.recognition.updateMany({ where: { giverId: nelson.id }, data: { giverId: allen.id } });
      await prisma.recognition.updateMany({ where: { recipientId: nelson.id }, data: { recipientId: allen.id } });
      // carry Nelson's stints over
      await prisma.employmentStint.updateMany({ where: { newHireId: nelson.id }, data: { newHireId: allen.id } });
      // rebuild the role chain on Allen
      await prisma.roleAssignment.deleteMany({ where: { newHireId: { in: [allen.id, nelson.id] } } });
      for (const c of chain) await prisma.roleAssignment.create({ data: { newHireId: allen.id, title: c.r.title, seat: c.r.seat, aircraft: c.r.aircraft, fleetPositionSlug: c.r.fleetPositionSlug, department: c.r.department, startDate: c.r.startDate, endDate: c.end, transitionType: c.tt } });
      await prisma.newHire.update({ where: { id: allen.id }, data: { name: "Rozella Allen", startDate: start, employmentStatus: "TERMINATED", terminationDate: term, stage: "ARCHIVED", pointsBalance: allen.pointsBalance + nelson.pointsBalance } });
      await prisma.newHire.delete({ where: { id: nelson.id } });
    }
  } else log(`(skip Rozella — allen:${!!allen} nelson:${!!nelson})`);

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
