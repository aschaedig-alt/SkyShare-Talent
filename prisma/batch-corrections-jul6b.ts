// Second batch of corrections (2026-07-06). Only unambiguous items; the role
// additions that need dates (David Ricks chief-pilot track, Devon Carter asst
// chief, Alexander Andrade training role) are held for the user.
//
//   npx tsx prisma/batch-corrections-jul6b.ts            (preview)
//   npx tsx prisma/batch-corrections-jul6b.ts --commit   (apply)
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
  // 1) PDP graduates — the only two who completed the Pilot Development Program and
  //    upgraded to Captain. Star on their profile.
  for (const nm of ["Chris Geradine", "Ren Carter"]) {
    const p = await byName(nm);
    log(`${nm} → PDP graduate (star)`);
    if (commit) await prisma.newHire.update({ where: { id: p.id }, data: { pdpGraduate: true } });
  }

  // 2) Will Page — journey was backwards. He was HIRED on the CJ2 and later moved to
  //    the managed Phenom 300. Rebuild as two clean roles (First Officer seat kept).
  const page = await byName("Will Page");
  log(`Will Page → CJ2 First Officer (hire 2024-01-01) → Phenom 300 First Officer, managed (2024-03-11)`);
  if (commit) {
    await prisma.roleAssignment.deleteMany({ where: { newHireId: page.id } });
    await prisma.roleAssignment.createMany({
      data: [
        { newHireId: page.id, title: "CJ2 First Officer", seat: "SIC", aircraft: "CJ2", startDate: D("2024-01-01"), endDate: D("2024-03-11"), transitionType: "HIRE" },
        { newHireId: page.id, title: "Phenom 300 First Officer", seat: "SIC", aircraft: "Phenom 300", startDate: D("2024-03-11"), endDate: null, transitionType: "TRANSFER", notes: "Moved to the managed Phenom 300" }
      ]
    });
  }

  // 3) Kevin Smith — upgraded to 560XL Captain (was recorded as a 560XL First Officer).
  const kevin = await byName("Kevin Smith");
  log(`Kevin Smith → 560XL Captain (was 560XL First Officer)`);
  if (commit) await prisma.roleAssignment.updateMany({ where: { newHireId: kevin.id, title: "560XL First Officer" }, data: { title: "560XL Captain", seat: "PIC" } });

  // 4) Teren Christensen — technically terminated; now contract only. CONTRACT status
  //    (leave his current role open — he still flies for us as a contractor).
  const teren = await byName("Teren Christensen");
  log(`Teren Christensen → CONTRACT (contract only)`);
  if (commit) await prisma.newHire.update({ where: { id: teren.id }, data: { employmentStatus: "CONTRACT", terminationDate: null } });

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
