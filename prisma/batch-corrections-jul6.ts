// Batch of user-confirmed employee corrections (2026-07-06). Only the items whose
// data is unambiguous are here; date-dependent items (Larson upgrade, Morri/Benik
// term, Zach start, McPartland term) are held for the user.
//
//   npx tsx prisma/batch-corrections-jul6.ts            (preview)
//   npx tsx prisma/batch-corrections-jul6.ts --commit   (apply)
import { prisma } from "@/lib/prisma";
import { normalizeName, splitCandidateName } from "@/lib/candidates/normalize";

const commit = process.argv.includes("--commit");
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function byName(name: string) {
  const rows = await prisma.newHire.findMany({ where: { name }, select: { id: true, name: true, position: true, employmentStatus: true } });
  if (rows.length !== 1) throw new Error(`Expected exactly 1 "${name}", found ${rows.length}`);
  return rows[0];
}
async function absorb(survId: string, dropId: string) {
  await prisma.travelTrip.updateMany({ where: { newHireId: dropId }, data: { newHireId: survId } });
  await prisma.redemption.updateMany({ where: { newHireId: dropId }, data: { newHireId: survId } });
  await prisma.recognition.updateMany({ where: { giverId: dropId }, data: { giverId: survId } });
  await prisma.recognition.updateMany({ where: { recipientId: dropId }, data: { recipientId: survId } });
  await prisma.newHire.delete({ where: { id: dropId } });
}
// Close any still-open role/stint at a termination date (mirrors "mark as former").
async function closeOpen(hireId: string, end: Date) {
  await prisma.roleAssignment.updateMany({ where: { newHireId: hireId, endDate: null }, data: { endDate: end } });
  await prisma.employmentStint.updateMany({ where: { newHireId: hireId, endDate: null }, data: { endDate: end } });
}

async function main() {
  // 1) Ben Houston — TERMINATED 2026-01-09 (from the arrivals/departures roster CSV).
  const houston = await byName("Ben Houston");
  const houstonTerm = D("2026-01-09");
  log(`Ben Houston → TERMINATED 2026-01-09`);
  if (commit) {
    await closeOpen(houston.id, houstonTerm);
    await prisma.newHire.update({ where: { id: houston.id }, data: { employmentStatus: "TERMINATED", terminationDate: houstonTerm, stage: "ARCHIVED" } });
  }

  // 2) Caiden Bright IS Katie Bright — keep the role-bearing record, rename to "Katie
  //    Bright", carry the prevhire importKey; drop the empty duplicate. Both TERMINATED 2026-04-06.
  const caiden = await byName("Caiden Bright");
  const katie = await byName("Katie Bright");
  log(`Katie Bright  ←  merge Caiden Bright (keep PC-12 FO history, name "Katie Bright")`);
  if (commit) {
    await prisma.employmentStint.updateMany({ where: { newHireId: katie.id }, data: { newHireId: caiden.id } });
    const key = (await prisma.newHire.findUnique({ where: { id: katie.id }, select: { importKey: true } }))?.importKey ?? null;
    await absorb(caiden.id, katie.id);
    await prisma.newHire.update({ where: { id: caiden.id }, data: { name: "Katie Bright", importKey: key } });
  }

  // 3) James Walker — not a pilot; G200 MX tech. "just AMT is fine."
  const walker = await byName("James Walker");
  log(`James Walker → AMT (Maintenance), role seat cleared`);
  if (commit) {
    await prisma.roleAssignment.updateMany({ where: { newHireId: walker.id }, data: { title: "AMT", seat: null } });
    await prisma.newHire.update({ where: { id: walker.id }, data: { position: "AMT", department: "Maintenance" } });
  }

  // 4) JD Bumgarner — not a pilot; dedicated MX tech for the G450 in HND.
  const jd = await byName("JD Bumgarner");
  log(`JD Bumgarner → G450 Maintenance Technician (HND), role seat cleared`);
  if (commit) {
    await prisma.roleAssignment.updateMany({ where: { newHireId: jd.id }, data: { title: "G450 Maintenance Technician (HND)", seat: null } });
    await prisma.newHire.update({ where: { id: jd.id }, data: { position: "G450 Maintenance Technician", department: "Maintenance" } });
  }

  // 5) Jonathan Rossi — declined the offer; record as an offered Candidate, remove the employee record.
  const rossi = await prisma.newHire.findFirst({ where: { name: "Jonathan Rossi" }, select: { id: true, name: true, position: true, offerSentDate: true, offerSignedDate: true, startDate: true } });
  if (rossi) {
    log(`Jonathan Rossi → Candidate [Offer] (declined; removed from employee roster)`);
    if (commit) {
      const { firstName, lastName, displayName } = splitCandidateName(rossi.name);
      await prisma.$transaction(async (tx) => {
        const cand = await tx.candidate.create({
          data: { displayName, firstName, lastName, normalizedName: normalizeName(rossi.name), currentTitle: rossi.position, stage: "Offer", status: "ACTIVE", origin: "MANUAL", source: "Offered — declined" }
        });
        await tx.candidateNote.create({ data: { candidateId: cand.id, body: "Did not accept the offer — recorded as an offered candidate (never an employee).", source: "system" } });
        await tx.newHire.delete({ where: { id: rossi.id } });
      });
    }
  } else log(`(skip Jonathan Rossi — not found)`);

  // 6) Joshua Tyler goes by Brock.
  const josh = await byName("Joshua Tyler");
  log(`Joshua Tyler → "Joshua (Brock) Tyler"`);
  if (commit) await prisma.newHire.update({ where: { id: josh.id }, data: { name: "Joshua (Brock) Tyler" } });

  // 7) David Costa — occasional contract work; not an active employee. CONTRACT status.
  const costa = await byName("David Costa");
  log(`David Costa → CONTRACT (no longer an active employee)`);
  if (commit) await prisma.newHire.update({ where: { id: costa.id }, data: { employmentStatus: "CONTRACT", terminationDate: null } });

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
