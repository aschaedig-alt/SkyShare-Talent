/**
 * Create First Officer roles for the 560XLS+ and Phenom 300 managed aircraft.
 * Same tail as their Captain role; FO gates cloned from the matching sibling FO.
 * Idempotent; dry-run unless --apply.
 *
 *   npx tsx scripts/create-fo-roles.ts            (dry run)
 *   npx tsx scripts/create-fo-roles.ts --apply
 */
import { prisma } from "../lib/prisma";
import { FLEET_POSITIONS } from "../lib/fleet/positions";

const APPLY = process.argv.includes("--apply");
const log = (s: string) => console.log(s);
const act = (s: string) => console.log(`   ${APPLY ? "✓" : "would"} ${s}`);

async function visibleByTitle(title: string) {
  const rows = await prisma.pilotRequirement.findMany({
    where: { title, NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
    include: { managedVariants: true }
  });
  if (rows.length > 1) {
    log(`   ! AMBIGUOUS "${title}" (${rows.length}) — skipping`);
    return null;
  }
  return rows[0] ?? null;
}

async function ensureVariant(reqId: string, tail: string) {
  const existing = await prisma.managedVariant.findFirst({ where: { pilotRequirementId: reqId, tailNumber: tail } });
  if (existing) {
    log(`   ✓ variant ${tail} already present`);
    return;
  }
  act(`add variant ${tail}`);
  if (APPLY) {
    const count = await prisma.managedVariant.count({ where: { pilotRequirementId: reqId } });
    await prisma.managedVariant.create({ data: { pilotRequirementId: reqId, tailNumber: tail, sortOrder: count } });
  }
}

async function cloneGates(fromReqId: string, toReqId: string) {
  const gates = await prisma.pilotRequirementGate.findMany({ where: { pilotRequirementId: fromReqId } });
  act(`clone ${gates.length} gates`);
  if (APPLY && gates.length > 0) {
    await prisma.pilotRequirementGate.createMany({
      data: gates.map((g) => ({
        pilotRequirementId: toReqId,
        catalogItemId: g.catalogItemId,
        key: g.key,
        label: g.label,
        category: g.category,
        valueType: g.valueType,
        enabled: g.enabled,
        numericValue: g.numericValue,
        textValue: g.textValue,
        evidenceText: g.evidenceText,
        sortOrder: g.sortOrder
      }))
    });
  }
}

async function createFoRole(fleetTitle: string, tail: string, cloneFromTitle: string) {
  const fp = FLEET_POSITIONS.find((p) => p.title === fleetTitle);
  if (!fp) {
    log(`\n${fleetTitle} — ! not in fleet registry; skipping`);
    return;
  }
  const existing = await visibleByTitle(fleetTitle);
  if (existing) {
    log(`\n${fleetTitle} — already exists (${existing.id.slice(0, 8)})`);
    if (existing.operatorType !== "Managed") {
      act(`set operator → Managed`);
      if (APPLY) await prisma.pilotRequirement.update({ where: { id: existing.id }, data: { operatorType: "Managed" } });
    }
    await ensureVariant(existing.id, tail);
    return;
  }
  const sibling = await visibleByTitle(cloneFromTitle);
  if (!sibling) {
    log(`\n${fleetTitle} — ! sibling "${cloneFromTitle}" not found; skipping`);
    return;
  }
  log(`\n${fleetTitle} — CREATE Managed FO (slug=${fp.slug}, seat=${fp.seat}, tags=[${fp.aircraft}]) cloning gates from "${cloneFromTitle}"`);
  act(`create requirement`);
  if (APPLY) {
    const created = await prisma.pilotRequirement.create({
      data: {
        title: fleetTitle,
        normalizedTitle: fleetTitle.toLowerCase(),
        fleetPositionSlug: fp.slug,
        operatorType: "Managed",
        roleCategory: "Pilot",
        pilotSeat: fp.seat,
        aircraftTypesJson: JSON.stringify([fp.aircraft]),
        status: "ACTIVE",
        reviewStatus: "DRAFT"
      }
    });
    await cloneGates(sibling.id, created.id);
    await ensureVariant(created.id, tail);
  } else {
    await cloneGates(sibling.id, "DRY");
    log(`   would add variant ${tail}`);
  }
}

async function main() {
  log(`\n=== CREATE FO ROLES  (${APPLY ? "APPLY" : "DRY RUN"}) ===`);
  await createFoRole("560XLS+ First Officer", "N6TM", "Citation 560XL First Officer");
  await createFoRole("Phenom 300 First Officer", "N409KG", "Phenom 100 First Officer");
  log(`\n${APPLY ? "Applied." : "Dry run only. Re-run with --apply."}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
