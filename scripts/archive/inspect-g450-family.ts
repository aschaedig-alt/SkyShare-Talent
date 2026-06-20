/** READ-ONLY: every G450 / GV pilot requirement with base + pay, to sort out
 * UT (SkyShare, 2 aircraft) vs NV (managed tail N787JS). */
import { prisma } from "../lib/prisma";

function arr(v: string | null): string[] {
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

async function main() {
  const reqs = await prisma.pilotRequirement.findMany({
    where: { NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
    select: {
      id: true,
      title: true,
      operatorType: true,
      pilotSeat: true,
      payScaleRaw: true,
      baseCity: true,
      baseState: true,
      baseAirport: true,
      fleetPositionSlug: true,
      aircraftTypesJson: true,
      sourceJobRecord: { select: { id: true, title: true, city: true, state: true, baseLocation: true, paySummary: true } },
      managedVariants: { select: { tailNumber: true } },
      _count: { select: { applications: true } }
    }
  });

  const fam = reqs.filter((r) => {
    const hay = `${r.title} ${r.fleetPositionSlug ?? ""} ${arr(r.aircraftTypesJson).join(" ")}`.toLowerCase();
    return /g450|\bgv\b|g-?v\b/.test(hay);
  });

  console.log(`\n=== G450 / GV FAMILY (${fam.length} requirements) ===\n`);
  for (const r of fam) {
    const reqBase = [r.baseCity, r.baseState].filter(Boolean).join(", ") || r.baseAirport || "—";
    const jobBase = [r.sourceJobRecord?.city, r.sourceJobRecord?.state].filter(Boolean).join(", ") || r.sourceJobRecord?.baseLocation || "—";
    console.log(`• "${r.title}" (${r.id.slice(0, 8)}) seat=${r.pilotSeat ?? "—"} op=${r.operatorType ?? "(unset)"}`);
    console.log(`     base(req)=${reqBase} | base(job)=${jobBase} | jobTitle=${r.sourceJobRecord?.title ?? "—"}`);
    console.log(`     pay=${r.payScaleRaw ?? r.sourceJobRecord?.paySummary ?? "—"} | slug=${r.fleetPositionSlug ?? "—"} | tags=${arr(r.aircraftTypesJson).join("/") || "—"}`);
    console.log(`     apps=${r._count.applications} variants=[${r.managedVariants.map((v) => v.tailNumber).join(", ") || "none"}]`);
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
