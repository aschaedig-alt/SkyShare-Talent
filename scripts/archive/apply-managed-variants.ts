/**
 * Apply the user-specified managed-aircraft variants + operator recategorization.
 * Idempotent: re-running won't create duplicate variants (keyed by tail number).
 * Recategorize/merge only — never removes a role or aircraft.
 *
 *   npx tsx scripts/apply-managed-variants.ts --apply    (omit --apply for dry run)
 *
 * Specified by the user (2026-06-19):
 *  - Phenom 100 Captain + First Officer → Managed, tail N450JF
 *  - CJ Captain (the $150-160k role) → Managed variant tail N443BC  (it's a CJ, not CJ2)
 */
import { prisma } from "../lib/prisma";
import { resolveFleetPosition } from "../lib/fleet/positions";

const APPLY = process.argv.includes("--apply");

type VariantSpec = {
  tailNumber: string;
  payScaleRaw?: string;
  notes?: string;
};

async function ensureVariant(requirementId: string, spec: VariantSpec) {
  const existing = await prisma.managedVariant.findFirst({
    where: { pilotRequirementId: requirementId, tailNumber: spec.tailNumber }
  });
  if (existing) {
    console.log(`      ✓ variant ${spec.tailNumber} already exists (${existing.id.slice(0, 8)}) — skip`);
    return;
  }
  if (!APPLY) {
    console.log(`      + would CREATE variant ${spec.tailNumber}${spec.payScaleRaw ? ` (${spec.payScaleRaw})` : ""}`);
    return;
  }
  const count = await prisma.managedVariant.count({ where: { pilotRequirementId: requirementId } });
  const created = await prisma.managedVariant.create({
    data: {
      pilotRequirementId: requirementId,
      tailNumber: spec.tailNumber,
      payScaleRaw: spec.payScaleRaw ?? null,
      notes: spec.notes ?? null,
      sortOrder: count
    }
  });
  console.log(`      + CREATED variant ${spec.tailNumber} (${created.id.slice(0, 8)})`);
}

async function setManaged(requirementId: string, currentOperator: string | null) {
  if ((currentOperator ?? "").toLowerCase() === "managed") {
    console.log(`      ✓ operatorType already Managed`);
    return;
  }
  if (!APPLY) {
    console.log(`      ~ would SET operatorType: ${currentOperator ?? "(unset)"} → Managed`);
    return;
  }
  await prisma.pilotRequirement.update({ where: { id: requirementId }, data: { operatorType: "Managed" } });
  console.log(`      ~ SET operatorType → Managed`);
}

async function main() {
  console.log(`\n=== APPLY MANAGED VARIANTS  (${APPLY ? "APPLY" : "DRY RUN"}) ===\n`);

  const all = await prisma.pilotRequirement.findMany({
    where: { NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
    select: { id: true, title: true, operatorType: true, pilotSeat: true }
  });

  const findByCanonical = (positionTitle: string) =>
    all.filter((r) => resolveFleetPosition(r.title)?.title === positionTitle);

  // 1) Phenom 100 Captain + First Officer → Managed + tail N450JF
  const phenoms = findByCanonical("Phenom 100 Captain").concat(findByCanonical("Phenom 100 First Officer"));
  console.log(`Phenom 100 (Captain + First Officer) → Managed, tail N450JF  [${phenoms.length} role(s)]`);
  for (const r of phenoms) {
    console.log(`   • ${r.title} (${r.id.slice(0, 8)}) seat=${r.pilotSeat ?? "—"} op=${r.operatorType ?? "(unset)"}`);
    await setManaged(r.id, r.operatorType);
    await ensureVariant(r.id, { tailNumber: "N450JF" });
  }
  if (phenoms.length === 0) console.log(`   ! no Phenom 100 roles resolved — check titles`);

  // 2) CJ Captain (managed, $150-160k) → tail N443BC
  const cjCaptains = findByCanonical("CJ Captain");
  console.log(`\nCJ Captain → Managed, tail N443BC ($150,000 - $160,000)  [${cjCaptains.length} role(s)]`);
  for (const r of cjCaptains) {
    console.log(`   • ${r.title} (${r.id.slice(0, 8)}) seat=${r.pilotSeat ?? "—"} op=${r.operatorType ?? "(unset)"}`);
    await setManaged(r.id, r.operatorType);
    await ensureVariant(r.id, { tailNumber: "N443BC", payScaleRaw: "$150,000 - $160,000 annually" });
  }
  if (cjCaptains.length === 0) console.log(`   ! no CJ Captain role resolved — check titles`);

  console.log(`\n${APPLY ? "Applied." : "Dry run only. Re-run with --apply to write."}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
