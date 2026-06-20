/**
 * Legacy 650 flies with 2 captains (no FO). Add the second seat: a Lead Captain
 * role. Managed, tail N650JF, gates cloned from G450 Lead Captain. Idempotent.
 *
 *   npx tsx scripts/create-legacy-lead-captain.ts            (dry run)
 *   npx tsx scripts/create-legacy-lead-captain.ts --apply
 */
import { prisma } from "../../lib/prisma";
import { FLEET_POSITIONS } from "../../lib/fleet/positions";

const APPLY = process.argv.includes("--apply");
const log = (s: string) => console.log(s);
const act = (s: string) => console.log(`   ${APPLY ? "✓" : "would"} ${s}`);

const TITLE = "Legacy 650 Lead Captain";
const CLONE_FROM = "Gulfstream G450 Lead Captain";
const TAIL = "N650JF";
const PILOT_SEAT = "Lead PIC"; // match the convention used by other Lead Captain rows

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

async function main() {
  log(`\n=== CREATE LEGACY 650 LEAD CAPTAIN  (${APPLY ? "APPLY" : "DRY RUN"}) ===`);

  const fp = FLEET_POSITIONS.find((p) => p.title === TITLE);
  if (!fp) {
    log(`! "${TITLE}" not in fleet registry — aborting`);
    return;
  }
  if (await visibleByTitle(TITLE)) {
    log(`"${TITLE}" already exists — nothing to do.`);
    return;
  }
  const sibling = await visibleByTitle(CLONE_FROM);
  if (!sibling) {
    log(`! sibling "${CLONE_FROM}" not found — aborting`);
    return;
  }

  log(`\nCREATE "${TITLE}" (slug=${fp.slug}, seat=${PILOT_SEAT}, tags=[${fp.aircraft}]) cloning gates from "${CLONE_FROM}"`);
  act(`create requirement + clone gates + add variant ${TAIL}`);
  if (APPLY) {
    const created = await prisma.pilotRequirement.create({
      data: {
        title: TITLE,
        normalizedTitle: TITLE.toLowerCase(),
        fleetPositionSlug: fp.slug,
        operatorType: "Managed",
        roleCategory: "Pilot",
        pilotSeat: PILOT_SEAT,
        aircraftTypesJson: JSON.stringify([fp.aircraft]),
        status: "ACTIVE",
        reviewStatus: "DRAFT"
      }
    });
    const gates = await prisma.pilotRequirementGate.findMany({ where: { pilotRequirementId: sibling.id } });
    await prisma.pilotRequirementGate.createMany({
      data: gates.map((g) => ({
        pilotRequirementId: created.id,
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
    await prisma.managedVariant.create({ data: { pilotRequirementId: created.id, tailNumber: TAIL, sortOrder: 0 } });
    log(`   ✓ created ${created.id.slice(0, 8)} with ${gates.length} gates and tail ${TAIL}`);
  }

  log(`\n${APPLY ? "Applied." : "Dry run only. Re-run with --apply."}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
