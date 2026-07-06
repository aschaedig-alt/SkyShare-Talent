// Final confirmed merges (user-approved) + XL→560XL label standardization.
//  1) Nicholas Charles (TERMINATED, keep)   ← Nik Charles (active dup)
//  2) Daniel Gonzalez (TERMINATED, keep — has PC-12→CJ2 movement) ← Daniel Gonzalez Herrera
//  3) Ward Holbrook (TERMINATED, keep — has G200→PC-12 history)   ← William Holbrook (active dup)
//  4) Standardize role titles / positions "XL" → "560XL" (Ben Fleckenstein et al.)
//   npx tsx prisma/final-merges-xl.ts            (preview)
//   npx tsx prisma/final-merges-xl.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);

async function byName(name: string) {
  const rows = await prisma.newHire.findMany({ where: { name }, select: { id: true, name: true, employmentStatus: true } });
  if (rows.length !== 1) throw new Error(`Expected exactly 1 "${name}", found ${rows.length}`);
  return rows[0];
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
  // 1) Nicholas Charles (keep, terminated) ← Nik Charles. Carry Nik's stint, close it
  //    at the termination date (Nicholas has the correctly-closed PC-12 role, no stint).
  const nicholas = await byName("Nicholas Charles");
  const nik = await byName("Nik Charles");
  const nikTerm = new Date("2025-11-06T00:00:00.000Z");
  log(`Nicholas Charles  ←  Nik Charles  [TERMINATED 2025-11-06]`);
  if (commit) {
    await prisma.employmentStint.updateMany({ where: { newHireId: nik.id }, data: { newHireId: nicholas.id } });
    await absorb(nicholas.id, nik.id);
    await prisma.employmentStint.updateMany({ where: { newHireId: nicholas.id, endDate: null }, data: { endDate: nikTerm } });
    await prisma.newHire.update({
      where: { id: nicholas.id },
      data: { employmentStatus: "TERMINATED", terminationDate: nikTerm, stage: "ARCHIVED", importKey: "roster:nik charles" }
    });
  }

  // 2) Daniel Gonzalez (keep, terminated, has the movement) ← Daniel Gonzalez Herrera (both termed 2025-06-11).
  const daniel = await byName("Daniel Gonzalez");
  const herrera = await byName("Daniel Gonzalez Herrera");
  log(`Daniel Gonzalez  ←  Daniel Gonzalez Herrera  [TERMINATED 2025-06-11, movement history kept]`);
  if (commit) {
    await prisma.employmentStint.updateMany({ where: { newHireId: herrera.id }, data: { newHireId: daniel.id } });
    await absorb(daniel.id, herrera.id);
  }

  // 3) Ward Holbrook (keep, terminated, has G200→PC-12 history) ← William Holbrook (active dup).
  const ward = await byName("Ward Holbrook");
  const william = await byName("William Holbrook");
  log(`Ward Holbrook  ←  William Holbrook  [TERMINATED 2022-12-31, history kept]`);
  if (commit) {
    await prisma.employmentStint.updateMany({ where: { newHireId: william.id }, data: { newHireId: ward.id } });
    await absorb(ward.id, william.id);
  }

  // 4) Standardize "XL" → "560XL" (standalone token only; leaves 560XL / 560XLS+ / XLS+ intact).
  const roles = await prisma.roleAssignment.findMany({ where: { title: { contains: "XL" } }, select: { id: true, title: true } });
  for (const r of roles) {
    const next = r.title.replace(/\bXL\b/g, "560XL");
    if (next !== r.title) {
      log(`role  "${r.title}"  →  "${next}"`);
      if (commit) await prisma.roleAssignment.update({ where: { id: r.id }, data: { title: next } });
    }
  }
  const positions = await prisma.newHire.findMany({ where: { position: { contains: "XL" } }, select: { id: true, name: true, position: true } });
  for (const p of positions) {
    if (!p.position) continue;
    const next = p.position.replace(/\bXL\b/g, "560XL");
    if (next !== p.position) {
      log(`position [${p.name}]  "${p.position}"  →  "${next}"`);
      if (commit) await prisma.newHire.update({ where: { id: p.id }, data: { position: next } });
    }
  }

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
