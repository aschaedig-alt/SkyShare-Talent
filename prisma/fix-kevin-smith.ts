// Restore Kevin Smith's three roles (an earlier edit collapsed his 560XL First
// Officer step into Captain). Dates from the user:
//   PC-12 Captain (hire, 2023-08-28) → 560XL First Officer (2025-04-23) → 560XL Captain (2026-03-30)
//   npx tsx prisma/fix-kevin-smith.ts            (preview)
//   npx tsx prisma/fix-kevin-smith.ts --commit   (apply)
import { prisma } from "@/lib/prisma";

const commit = process.argv.includes("--commit");
const log = (s: string) => console.log((commit ? "✓ " : "· ") + s);
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  const kevin = await prisma.newHire.findFirst({ where: { name: "Kevin Smith", importKey: "upgrade-tracker:A0B5" }, select: { id: true } });
  if (!kevin) throw new Error("Kevin Smith (A0B5) not found");

  const roles = await prisma.roleAssignment.findMany({ where: { newHireId: kevin.id }, select: { id: true, title: true }, orderBy: { startDate: "asc" } });
  const pc12 = roles.find((r) => /PC-12/i.test(r.title));
  const xl = roles.find((r) => /560XL/i.test(r.title)); // the overwritten FO row (currently "560XL Captain")
  if (!pc12 || !xl) throw new Error(`Expected PC-12 + 560XL roles, found: ${roles.map((r) => r.title).join(", ")}`);

  const foStart = D("2025-04-23");
  const captStart = D("2026-03-30");

  log(`PC-12 Captain: end → 2025-04-23`);
  log(`repurpose overwritten row → 560XL First Officer [SIC] 2025-04-23 → 2026-03-30 (PROMOTION)`);
  log(`+ new 560XL Captain [PIC] 2026-03-30 → present (UPGRADE)`);

  if (commit) {
    await prisma.roleAssignment.update({ where: { id: pc12.id }, data: { endDate: foStart } });
    await prisma.roleAssignment.update({
      where: { id: xl.id },
      data: { title: "560XL First Officer", seat: "SIC", aircraft: "560XL", startDate: foStart, endDate: captStart, transitionType: "PROMOTION" }
    });
    await prisma.roleAssignment.create({
      data: { newHireId: kevin.id, title: "560XL Captain", seat: "PIC", aircraft: "560XL", startDate: captStart, endDate: null, transitionType: "UPGRADE" }
    });
    await prisma.newHire.update({ where: { id: kevin.id }, data: { position: "560XL Captain" } });
  }

  console.log(`\n${commit ? "APPLIED" : "DRY RUN — re-run with --commit"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
