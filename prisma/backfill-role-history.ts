// Seed each employee's CURRENT role as the first entry in their role journey.
// Idempotent: skips anyone who already has a RoleAssignment, so it's safe to
// re-run. Dry-run by default; pass --commit to write. Seat/aircraft/slug are
// resolved from the position title via the fleet registry (pilots); non-pilot
// titles just carry the title.
//
//   npx tsx prisma/backfill-role-history.ts            (dry run)
//   npx tsx prisma/backfill-role-history.ts --commit   (write)

import { prisma } from "@/lib/prisma";
import { resolveFleetPosition } from "@/lib/fleet/positions";

async function main() {
  const commit = process.argv.includes("--commit");
  const hires = await prisma.newHire.findMany({
    select: {
      id: true,
      position: true,
      department: true,
      startDate: true,
      createdAt: true,
      employmentStatus: true,
      terminationDate: true,
      roleAssignments: { select: { id: true } }
    }
  });

  let created = 0;
  let skippedExisting = 0;
  let skippedNoPosition = 0;
  let pilotSeats = 0;

  for (const h of hires) {
    if (h.roleAssignments.length > 0) {
      skippedExisting++;
      continue;
    }
    if (!h.position || !h.position.trim()) {
      skippedNoPosition++;
      continue;
    }
    const fp = resolveFleetPosition(h.position);
    if (fp) pilotSeats++;
    const data = {
      newHireId: h.id,
      title: fp?.title ?? h.position.trim(),
      fleetPositionSlug: fp?.slug ?? null,
      seat: fp?.seat ?? null,
      aircraft: fp?.aircraft ?? null,
      department: h.department ?? null,
      startDate: h.startDate ?? h.createdAt,
      endDate: h.employmentStatus === "TERMINATED" ? h.terminationDate ?? null : null,
      transitionType: "HIRE"
    };
    if (commit) await prisma.roleAssignment.create({ data });
    created++;
  }

  console.log(JSON.stringify({ commit, totalHires: hires.length, created, pilotSeatsResolved: pilotSeats, skippedExisting, skippedNoPosition }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
