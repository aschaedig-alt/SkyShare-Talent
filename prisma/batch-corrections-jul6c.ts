// Third batch of corrections (2026-07-06), all with user-supplied dates.
//  2) Devon Carter    — Assistant Chief Pilot 2025-05-08 (still CJ2 + PC-12 Captain)
//  3) Alexander Andrade — Assistant Director of Training 2026-04-29 (still PC-12 Captain)
//  4) Kathleen Larson — upgraded to G200 Captain 2026-03-23
//  6) Zach Davis      — split: the pilot (560XLS+ Captain, hired 2026-03-23) is a
//                        DIFFERENT person than the 2020 line/detailer record.
//  7) Patrick McPartland — terminated 2022-08-01; later G450 flying was contract, not
//                        employment; offered a return but declined (not rehired).
//
//   npx tsx prisma/batch-corrections-jul6c.ts            (preview)
//   npx tsx prisma/batch-corrections-jul6c.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function byName(name: string) {
  const rows = await prisma.newHire.findMany({ where: { name }, select: { id: true, name: true } });
  if (rows.length !== 1) throw new Error(`Expected exactly 1 "${name}", found ${rows.length}`);
  return rows[0];
}

async function main() {
  // 2) Devon Carter — took on Assistant Chief Pilot on 2025-05-08 (management hat;
  //    still flies as CJ2 + PC-12 Captain). Add as a non-flying role (seat/aircraft null).
  const devon = await byName("Devon Carter");
  log(`Devon Carter + Assistant Chief Pilot (2025-05-08)`);
  if (commit)
    await prisma.roleAssignment.create({
      data: { newHireId: devon.id, title: "Assistant Chief Pilot", seat: null, aircraft: null, startDate: D("2025-05-08"), endDate: null, transitionType: "PROMOTION", notes: "Management role — still flying as CJ2 + PC-12 Captain" }
    });

  // 3) Alexander Andrade — Assistant Director of Training on 2026-04-29 (still PC-12 Captain).
  const andrade = await byName("Alexander Andrade");
  log(`Alexander Andrade + Assistant Director of Training (2026-04-29)`);
  if (commit)
    await prisma.roleAssignment.create({
      data: { newHireId: andrade.id, title: "Assistant Director of Training", seat: null, aircraft: null, startDate: D("2026-04-29"), endDate: null, transitionType: "PROMOTION", notes: "Training role — still a PC-12 Captain" }
    });

  // 4) Kathleen Larson — G200 First Officer -> G200 Captain on 2026-03-23 (an upgrade).
  const larson = await byName("Kathleen Larson");
  log(`Kathleen Larson → G200 Captain upgrade (2026-03-23)`);
  if (commit) {
    await prisma.roleAssignment.updateMany({ where: { newHireId: larson.id, title: "G200 First Officer", endDate: null }, data: { endDate: D("2026-03-23") } });
    await prisma.roleAssignment.create({
      data: { newHireId: larson.id, title: "G200 Captain", seat: "PIC", aircraft: "G200", startDate: D("2026-03-23"), endDate: null, transitionType: "UPGRADE" }
    });
  }

  // 6) Zach Davis — the pilot and the 2020 line/detailer are NOT the same person.
  //    Keep the existing (prevhire) record as the detailer; restore its open detailer
  //    role/stint; then create a separate record for the pilot (560XLS+ Captain, 2026-03-23).
  const zach = await byName("Zach Davis"); // currently the single (wrongly-merged) record
  log(`Zach Davis → split: keep detailer record; create separate 560XLS+ Captain pilot (hired 2026-03-23)`);
  if (commit) {
    await prisma.roleAssignment.deleteMany({ where: { newHireId: zach.id, title: { contains: "560XL" } } });
    await prisma.roleAssignment.updateMany({ where: { newHireId: zach.id, title: { contains: "Detailer" } }, data: { endDate: null } });
    await prisma.employmentStint.updateMany({ where: { newHireId: zach.id, endDate: { not: null } }, data: { endDate: null } });
    const pilot = await prisma.newHire.create({
      data: {
        name: "Zach Davis",
        position: "560XLS+ Captain",
        department: "Flight",
        stage: "POST_ONBOARD",
        employmentStatus: "ACTIVE",
        startDate: D("2026-03-23"),
        notes: "Managed-aircraft pilot. Distinct person from the 2020 line/detailer Zach Davis (confirmed by user).",
        employmentStints: { create: { startDate: D("2026-03-23"), endDate: null } },
        roleAssignments: { create: { title: "560XLS+ Captain", seat: "PIC", aircraft: "560XLS+", startDate: D("2026-03-23"), endDate: null, transitionType: "HIRE" } }
      },
      select: { id: true }
    });
    // Tag the detailer so the (expected) exact-name scan hit isn't re-merged by mistake.
    await prisma.newHire.update({ where: { id: zach.id }, data: { notes: `Line service / detailer Zach Davis (2020). Distinct person from the managed-aircraft pilot Zach Davis ${pilot.id} (confirmed by user).` } });
  }

  // 7) Patrick McPartland — hired 2021-08-15, terminated 2022-08-01. The later G450
  //    flying was contract work, not employment; he was offered a return but declined
  //    (not rehired). Close employment at the term date; drop the contract-era roles.
  const patrick = await byName("Patrick Mcpartland");
  const pTerm = D("2022-08-01");
  log(`Patrick Mcpartland → TERMINATED 2022-08-01; drop contract-era G450 roles`);
  if (commit) {
    await prisma.roleAssignment.deleteMany({ where: { newHireId: patrick.id, title: { contains: "G450" } } });
    await prisma.roleAssignment.updateMany({ where: { newHireId: patrick.id, title: "G200 Captain" }, data: { endDate: pTerm } });
    await prisma.employmentStint.updateMany({ where: { newHireId: patrick.id, endDate: null }, data: { endDate: pTerm } });
    await prisma.newHire.update({
      where: { id: patrick.id },
      data: {
        employmentStatus: "TERMINATED",
        terminationDate: pTerm,
        stage: "ARCHIVED",
        notes: "Left 08/01/2022. Later flew for us on contract (G450 Captain, then G450 Lead Captain). Offered a return but declined — not rehired."
      }
    });
  }

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
