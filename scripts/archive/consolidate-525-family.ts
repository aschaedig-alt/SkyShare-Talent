/**
 * Consolidate the CJ / CJ2 / CE-525 / M2 family per the user's pay rules.
 * Recategorize + merge empty duplicates only — never removes an aircraft, and
 * refuses to merge/delete any row that has applications. Idempotent.
 *
 *   npx tsx scripts/consolidate-525-family.ts            (dry run)
 *   npx tsx scripts/consolidate-525-family.ts --apply
 *
 * End state for this family:
 *   • SkyShare CJ2 Captain        = cmq5idxv  (dup cmq5lgfh merged in)
 *   • Managed CJ Captain  N443BC  = cmq5iesf  (relabelled; dup cmqjm9w5 removed)
 *   • Managed M2 Captain  N785PD  = cmqjm9vx
 *   • Managed M2 First Officer N785PD = cmq5jxek
 *   • SkyShare CJ2 First Officer  = cmq5lght  (already retagged)
 */
import { prisma } from "../../lib/prisma";

const APPLY = process.argv.includes("--apply");
const log = (s: string) => console.log(s);
const act = (s: string) => console.log(`   ${APPLY ? "✓" : "would"} ${s}`);

async function reqById(id: string) {
  return prisma.pilotRequirement.findUnique({
    where: { id },
    include: { _count: { select: { applications: true, jobPosts: true } }, managedVariants: true }
  });
}

// Rows are resolved by their (distinct) titles among the VISIBLE requirements
// (source job not merged away), then we use the real cuid. Refuses ambiguity.
async function reqByTitle(title: string) {
  const rows = await prisma.pilotRequirement.findMany({
    where: { title, NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
    include: { _count: { select: { applications: true, jobPosts: true } }, managedVariants: true }
  });
  if (rows.length === 0) {
    log(`   ! no visible requirement titled "${title}"`);
    return null;
  }
  if (rows.length > 1) {
    log(`   ! AMBIGUOUS: ${rows.length} visible rows titled "${title}" (${rows.map((r) => r.id.slice(0, 8)).join(", ")}) — skipping`);
    return null;
  }
  return rows[0];
}

async function ensureVariant(reqId: string, tail: string, pay: string | null) {
  const existing = await prisma.managedVariant.findFirst({ where: { pilotRequirementId: reqId, tailNumber: tail } });
  if (existing) {
    log(`   ✓ variant ${tail} already on ${reqId.slice(0, 8)}`);
    return;
  }
  act(`add variant ${tail}${pay ? ` (${pay})` : ""} to ${reqId.slice(0, 8)}`);
  if (APPLY) {
    const count = await prisma.managedVariant.count({ where: { pilotRequirementId: reqId } });
    await prisma.managedVariant.create({ data: { pilotRequirementId: reqId, tailNumber: tail, payScaleRaw: pay, sortOrder: count } });
  }
}

async function updateReq(id: string, data: Record<string, unknown>) {
  act(`update ${id.slice(0, 8)}: ${JSON.stringify(data)}`);
  if (APPLY) await prisma.pilotRequirement.update({ where: { id }, data });
}

async function safeDeleteReq(id: string) {
  const r = await reqById(id);
  if (!r) {
    log(`   ✓ ${id.slice(0, 8)} already gone`);
    return;
  }
  if (r._count.applications > 0 || r._count.jobPosts > 0) {
    log(`   ! REFUSING to delete ${id.slice(0, 8)} — apps=${r._count.applications} jobPosts=${r._count.jobPosts}`);
    return;
  }
  act(`delete empty duplicate ${id.slice(0, 8)} "${r.title}" (+ its gates/changes/variants)`);
  if (APPLY) {
    await prisma.$transaction([
      prisma.managedVariant.deleteMany({ where: { pilotRequirementId: id } }),
      prisma.pilotRequirementChange.deleteMany({ where: { pilotRequirementId: id } }),
      prisma.pilotRequirementGate.deleteMany({ where: { pilotRequirementId: id } }),
      prisma.pilotRequirement.delete({ where: { id } })
    ]);
  }
}

async function mergeJob(dupJobId: string, survivorJobId: string) {
  const dup = await prisma.job.findUnique({ where: { id: dupJobId }, select: { mergedIntoJobId: true } });
  if (!dup) {
    log(`   ! dup job ${dupJobId.slice(0, 8)} not found`);
    return;
  }
  if (dup.mergedIntoJobId) {
    log(`   ✓ job ${dupJobId.slice(0, 8)} already merged`);
    return;
  }
  act(`merge job ${dupJobId.slice(0, 8)} → ${survivorJobId.slice(0, 8)} (hides its duplicate requirement)`);
  if (APPLY) await prisma.job.update({ where: { id: dupJobId }, data: { mergedIntoJobId: survivorJobId } });
}

async function main() {
  log(`\n=== CONSOLIDATE 525 FAMILY  (${APPLY ? "APPLY" : "DRY RUN"}) ===`);

  // ---- 1) SkyShare CJ2 Captain: keep "Citation CJ2 Captain", merge $125k dup ----
  log(`\n1) SkyShare CJ2 Captain — keep "Citation CJ2 Captain", merge $125k dup`);
  const cj2 = await reqByTitle("Citation CJ2 Captain");
  const cj2dup = await reqByTitle("Citation CE-525 (CJ2) Captain");
  if (cj2 && cj2dup) {
    await updateReq(cj2dup.id, { operatorType: "SkyShare", aircraftTypesJson: JSON.stringify(["Citation CJ2"]) });
    if (cj2.sourceJobRecordId && cj2dup.sourceJobRecordId) await mergeJob(cj2dup.sourceJobRecordId, cj2.sourceJobRecordId);
    else log(`   ! missing source jobs (survivor=${cj2.sourceJobRecordId} dup=${cj2dup.sourceJobRecordId})`);
  }

  // ---- 2) Managed CJ Captain N443BC: canonical "Citation CE525 Captain", remove "CJ Captain" dup ----
  log(`\n2) Managed CJ Captain N443BC — relabel "Citation CE525 Captain" as canonical, remove "CJ Captain" dup`);
  const cjManaged = await reqByTitle("Citation CE525 Captain");
  const cjDup = await reqByTitle("CJ Captain");
  if (cjManaged) {
    await updateReq(cjManaged.id, {
      title: "CJ Captain",
      fleetPositionSlug: "cj-captain",
      operatorType: "Managed",
      aircraftTypesJson: JSON.stringify(["Citation CJ", "CE-525"])
    });
    await ensureVariant(cjManaged.id, "N443BC", "$140,000 - $160,000 annually");
    if (cjDup) await safeDeleteReq(cjDup.id);
  }

  // ---- 3) Managed M2 (tail N785PD), both seats ----
  log(`\n3) Managed M2 N785PD — Captain "M2 Captain" + First Officer "Citation M2 First Officer"`);
  const m2cap = await reqByTitle("M2 Captain");
  if (m2cap) {
    await updateReq(m2cap.id, { operatorType: "Managed", payScaleRaw: "$145,000 - $160,000 annually" });
    await ensureVariant(m2cap.id, "N785PD", "$145,000 - $160,000 annually");
  }
  const m2fo = await reqByTitle("Citation M2 First Officer");
  if (m2fo) {
    await updateReq(m2fo.id, { operatorType: "Managed" });
    await ensureVariant(m2fo.id, "N785PD", null);
  }

  log(`\n${APPLY ? "Applied." : "Dry run only. Re-run with --apply."}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
