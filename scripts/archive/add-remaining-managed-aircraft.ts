/**
 * Record the remaining managed aircraft. Idempotent; dry-run unless --apply.
 *   • PC-12 NG  (existing role)  -> Managed, tail N413UU
 *   • PC-12 NGX (existing role)  -> Managed + INACTIVE (retired); tail N825NX (unconfirmed)
 *   • 560XLS+ Captain (CREATE)   -> Managed, tail N6TM   (gates cloned from 560XL Captain)
 *   • Legacy 650 Captain (CREATE)-> Managed, tail N650JF (gates cloned from G450 Captain)
 *   • Phenom 300 Captain (CREATE)-> Managed, tail N409KG (gates cloned from Phenom 100 Captain)
 *
 *   npx tsx scripts/add-remaining-managed-aircraft.ts            (dry run)
 *   npx tsx scripts/add-remaining-managed-aircraft.ts --apply
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

async function ensureVariant(reqId: string, tail: string, opts: { status?: string; notes?: string } = {}) {
  const existing = await prisma.managedVariant.findFirst({ where: { pilotRequirementId: reqId, tailNumber: tail } });
  if (existing) {
    log(`   ✓ variant ${tail} already present`);
    return;
  }
  act(`add variant ${tail}${opts.notes ? ` (${opts.notes})` : ""}`);
  if (APPLY) {
    const count = await prisma.managedVariant.count({ where: { pilotRequirementId: reqId } });
    await prisma.managedVariant.create({
      data: { pilotRequirementId: reqId, tailNumber: tail, status: opts.status ?? "ACTIVE", notes: opts.notes ?? null, sortOrder: count }
    });
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

async function createManagedRole(fleetTitle: string, tail: string, cloneFromTitle: string) {
  const fp = FLEET_POSITIONS.find((p) => p.title === fleetTitle);
  if (!fp) {
    log(`   ! fleet position "${fleetTitle}" not found in registry — skipping`);
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
    log(`\n${fleetTitle} — ! sibling "${cloneFromTitle}" not found to clone gates; skipping create`);
    return;
  }

  log(`\n${fleetTitle} — CREATE Managed role (slug=${fp.slug}, seat=${fp.seat}, tags=[${fp.aircraft}]) cloning gates from "${cloneFromTitle}"`);
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
  log(`\n=== ADD REMAINING MANAGED AIRCRAFT  (${APPLY ? "APPLY" : "DRY RUN"}) ===`);

  // 1) PC-12 NG -> Managed, N413UU
  log(`\n1) PC-12 NG -> Managed, N413UU`);
  const ng = await visibleByTitle("Pilatus PC-12 NG Lead Captain");
  if (ng) {
    if (ng.operatorType !== "Managed") {
      act(`set "${ng.title}" (${ng.id.slice(0, 8)}) operator ${ng.operatorType ?? "(unset)"} → Managed`);
      if (APPLY) await prisma.pilotRequirement.update({ where: { id: ng.id }, data: { operatorType: "Managed" } });
    }
    await ensureVariant(ng.id, "N413UU");
  } else log(`   ! PC-12 NG role not found`);

  // 2) PC-12 NGX -> Managed + INACTIVE (retired), N825NX unconfirmed
  log(`\n2) PC-12 NGX -> Managed + retired (INACTIVE), tail N825NX (unconfirmed)`);
  const ngx = await visibleByTitle("PC-12 NGX Lead Captain");
  if (ngx) {
    act(`set "${ngx.title}" (${ngx.id.slice(0, 8)}) operator → Managed, status → INACTIVE`);
    if (APPLY) await prisma.pilotRequirement.update({ where: { id: ngx.id }, data: { operatorType: "Managed", status: "INACTIVE" } });
    await ensureVariant(ngx.id, "N825NX", { status: "INACTIVE", notes: "Retired — tail unconfirmed; aircraft no longer in fleet" });
  } else log(`   ! PC-12 NGX role not found`);

  // 3) Create the three missing managed aircraft roles
  await createManagedRole("560XLS+ Captain", "N6TM", "Citation 560XL Captain");
  await createManagedRole("Legacy 650 Captain", "N650JF", "Gulfstream G450 Captain");
  await createManagedRole("Phenom 300 Captain", "N409KG", "Phenom 100 Captain");

  log(`\n${APPLY ? "Applied." : "Dry run only. Re-run with --apply."}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
