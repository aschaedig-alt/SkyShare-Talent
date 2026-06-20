/**
 * Sort the G450 family per the user:
 *   • G450 & GV (Home-Based, UT) Captain + FO  -> SkyShare (2 SkyShare aircraft)
 *   • plain Gulfstream G450 (NV) Captain/Lead/FO -> Managed, tail N787JS
 * Recategorize + tag a managed tail only. Idempotent.
 *
 *   npx tsx scripts/sort-g450-family.ts            (dry run)
 *   npx tsx scripts/sort-g450-family.ts --apply
 */
import { prisma } from "../lib/prisma";

const APPLY = process.argv.includes("--apply");
const log = (s: string) => console.log(s);
const act = (s: string) => console.log(`   ${APPLY ? "✓" : "would"} ${s}`);

async function reqByTitle(title: string) {
  const rows = await prisma.pilotRequirement.findMany({
    where: { title, NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
    include: { managedVariants: true }
  });
  if (rows.length === 0) {
    log(`   ! no visible requirement titled "${title}"`);
    return null;
  }
  if (rows.length > 1) {
    log(`   ! AMBIGUOUS: ${rows.length} rows titled "${title}" — skipping`);
    return null;
  }
  return rows[0];
}

async function setOperator(title: string, operator: string) {
  const r = await reqByTitle(title);
  if (!r) return;
  if (r.operatorType === operator) {
    log(`   ✓ "${title}" already ${operator}`);
    return;
  }
  act(`set "${title}" (${r.id.slice(0, 8)}) operator ${r.operatorType ?? "(unset)"} → ${operator}`);
  if (APPLY) await prisma.pilotRequirement.update({ where: { id: r.id }, data: { operatorType: operator } });
}

async function setManagedWithTail(title: string, tail: string) {
  const r = await reqByTitle(title);
  if (!r) return;
  if (r.operatorType !== "Managed") {
    act(`set "${title}" (${r.id.slice(0, 8)}) operator ${r.operatorType ?? "(unset)"} → Managed`);
    if (APPLY) await prisma.pilotRequirement.update({ where: { id: r.id }, data: { operatorType: "Managed" } });
  } else {
    log(`   ✓ "${title}" already Managed`);
  }
  const has = r.managedVariants.some((v) => v.tailNumber === tail);
  if (has) {
    log(`   ✓ variant ${tail} already on "${title}"`);
    return;
  }
  act(`add variant ${tail} to "${title}"`);
  if (APPLY) {
    const count = await prisma.managedVariant.count({ where: { pilotRequirementId: r.id } });
    await prisma.managedVariant.create({ data: { pilotRequirementId: r.id, tailNumber: tail, sortOrder: count } });
  }
}

async function setTags(title: string, tags: string[]) {
  const r = await reqByTitle(title);
  if (!r) return;
  const next = JSON.stringify(tags);
  if (r.aircraftTypesJson === next) {
    log(`   ✓ "${title}" tags already ${next}`);
    return;
  }
  act(`set "${title}" (${r.id.slice(0, 8)}) tags ${r.aircraftTypesJson ?? "—"} → ${next}`);
  if (APPLY) await prisma.pilotRequirement.update({ where: { id: r.id }, data: { aircraftTypesJson: next } });
}

async function main() {
  log(`\n=== SORT G450 FAMILY  (${APPLY ? "APPLY" : "DRY RUN"}) ===`);

  log(`\n1) G450 & GV (UT) → SkyShare`);
  await setOperator("Gulfstream G450 & GV Captain (Home-Based)", "SkyShare");
  await setOperator("Gulfstream G450 & GV First Officer (Home-Based)", "SkyShare");

  log(`\n2) Gulfstream G450 (NV) → Managed, tail N787JS`);
  await setManagedWithTail("Gulfstream G450 Captain", "N787JS");
  await setManagedWithTail("Gulfstream G450 Lead Captain", "N787JS");
  await setManagedWithTail("Gulfstream G450 First Officer", "N787JS");

  log(`\n3) Clean spurious PC-12 tag off the G450 & GV roles`);
  await setTags("Gulfstream G450 & GV Captain (Home-Based)", ["Gulfstream G450", "GV"]);
  await setTags("Gulfstream G450 & GV First Officer (Home-Based)", ["Gulfstream G450", "GV"]);

  log(`\n${APPLY ? "Applied." : "Dry run only. Re-run with --apply."}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
