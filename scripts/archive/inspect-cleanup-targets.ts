/** READ-ONLY: inspect the cleanup targets before mutating anything. */
import { prisma } from "../../lib/prisma";

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
  console.log(`\n=== CJ / CJ2 JOBS + their linked requirements ===`);
  const jobs = await prisma.job.findMany({
    where: { isPilotRole: true, mergedIntoJobId: null, title: { contains: "C", mode: "insensitive" } },
    select: {
      id: true,
      title: true,
      city: true,
      paySummary: true,
      aircraftTypesJson: true,
      pilotSeat: true,
      pilotRequirements: { select: { id: true, title: true, operatorType: true, pilotSeat: true } },
      _count: { select: { applications: true } }
    }
  });
  for (const j of jobs.filter((x) => /\bcj|ce-?525/i.test(x.title))) {
    console.log(`\n• JOB "${j.title}" (${j.id.slice(0, 8)}) | city=${j.city ?? "—"} | pay=${j.paySummary ?? "—"} | tags=${arr(j.aircraftTypesJson).join("/") || "—"} | apps=${j._count.applications}`);
    for (const r of j.pilotRequirements) {
      console.log(`     ↳ req "${r.title}" (${r.id.slice(0, 8)}) operator=${r.operatorType ?? "(unset)"} seat=${r.pilotSeat ?? "—"}`);
    }
    if (j.pilotRequirements.length === 0) console.log(`     ↳ (no linked requirement)`);
  }

  console.log(`\n\n=== M2 CAPTAIN requirements ===`);
  const m2 = await prisma.pilotRequirement.findMany({
    where: { title: { contains: "M2", mode: "insensitive" } },
    select: {
      id: true,
      title: true,
      operatorType: true,
      pilotSeat: true,
      sourceJobRecordId: true,
      _count: { select: { applications: true, gates: true, managedVariants: true, changes: true, jobPosts: true } }
    }
  });
  for (const r of m2.filter((x) => /captain/i.test(x.title))) {
    console.log(
      `• "${r.title}" (${r.id.slice(0, 8)}) operator=${r.operatorType ?? "(unset)"} seat=${r.pilotSeat ?? "—"} source=${r.sourceJobRecordId?.slice(0, 8) ?? "none"} | apps=${r._count.applications} gates=${r._count.gates} variants=${r._count.managedVariants} changes=${r._count.changes} jobPosts=${r._count.jobPosts}`
    );
  }

  console.log(`\n=== CE-525 FIRST OFFICER mislabeled job ===`);
  const feo = await prisma.job.findMany({
    where: { isPilotRole: true, mergedIntoJobId: null, title: { contains: "525", mode: "insensitive" } },
    select: { id: true, title: true, pilotSeat: true, aircraftTypesJson: true }
  });
  for (const j of feo.filter((x) => /first officer|\bfo\b|sic/i.test(x.title))) {
    console.log(`• "${j.title}" (${j.id.slice(0, 8)}) seat=${j.pilotSeat ?? "—"} tags=${arr(j.aircraftTypesJson).join("/") || "—"}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
