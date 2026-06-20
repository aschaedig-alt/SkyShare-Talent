/**
 * READ-ONLY: every CJ / CJ2 / CE-525 / M2 pilot requirement with its pay, so we
 * can apply the user's pay-based classification rules:
 *   $125k (525/CJ2)        -> SkyShare CJ2
 *   $145k-$160k            -> Managed M2,  tail N785PD
 *   $140k-160k / $150k-160k-> Managed CJ,  tail N443BC
 */
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

function classify(pay: string): string {
  const p = pay.replace(/[, ]/g, "").toLowerCase();
  const has = (n: string) => p.includes(n);
  if (has("125000") || has("125k")) return "SkyShare CJ2 ($125k)";
  if (has("145000") || has("145k")) return "Managed M2 N785PD ($145-160k)";
  if (has("140000") || has("140k") || has("150000") || has("150k")) return "Managed CJ N443BC ($140/150-160k)";
  return "(no rule match)";
}

async function main() {
  const reqs = await prisma.pilotRequirement.findMany({
    where: { NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
    select: {
      id: true,
      title: true,
      advertisedTitle: true,
      operatorType: true,
      pilotSeat: true,
      payScaleRaw: true,
      fleetPositionSlug: true,
      aircraftTypesJson: true,
      sourceJobRecord: { select: { id: true, title: true, paySummary: true } },
      managedVariants: { select: { tailNumber: true, payScaleRaw: true } },
      _count: { select: { applications: true, gates: true } }
    }
  });

  const family = reqs.filter((r) => {
    const hay = `${r.title} ${r.advertisedTitle ?? ""} ${r.fleetPositionSlug ?? ""} ${arr(r.aircraftTypesJson).join(" ")}`.toLowerCase();
    return /\bcj\b|cj2|ce-?525|\bm2\b/.test(hay);
  });

  console.log(`\n=== CJ / CJ2 / CE-525 / M2 FAMILY (${family.length} requirements) ===\n`);
  for (const r of family) {
    const pay = r.payScaleRaw ?? r.sourceJobRecord?.paySummary ?? "";
    console.log(`• "${r.title}" (${r.id.slice(0, 8)}) seat=${r.pilotSeat ?? "—"} op=${r.operatorType ?? "(unset)"}`);
    console.log(`     pay(req)=${r.payScaleRaw ?? "—"} | pay(job)=${r.sourceJobRecord?.paySummary ?? "—"}`);
    console.log(`     slug=${r.fleetPositionSlug ?? "—"} | tags=${arr(r.aircraftTypesJson).join("/") || "—"} | adv=${(r.advertisedTitle ?? "—").slice(0, 60)}`);
    console.log(`     apps=${r._count.applications} gates=${r._count.gates} variants=[${r.managedVariants.map((v) => v.tailNumber).join(", ") || "none"}] | sourceJob=${r.sourceJobRecord?.id?.slice(0, 8) ?? "none"}`);
    console.log(`     >>> RULE: ${pay ? classify(pay) : "(no pay on record)"}`);
    console.log("");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
