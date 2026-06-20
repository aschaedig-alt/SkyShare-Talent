/** READ-ONLY: find existing requirement rows for the remaining managed aircraft
 * (560XLS+/XLS+, Legacy 650, Phenom 300, PC-12 NG, PC-12 NGX). Shows ALL rows
 * incl. archived + merged-away, so we know what to update vs. create. */
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

const GROUPS: Array<{ label: string; re: RegExp }> = [
  { label: "560XLS+ / XLS+", re: /xls|560\s*xls/i },
  { label: "560XL (Excel)", re: /560\s*xl(?!s)/i },
  { label: "Legacy 650", re: /legacy|650/i },
  { label: "Phenom 300", re: /phenom\s*300|phenom300/i },
  { label: "PC-12 NG (not NGX)", re: /pc-?12\s*ng(?!x)/i },
  { label: "PC-12 NGX", re: /ngx/i }
];

async function main() {
  const reqs = await prisma.pilotRequirement.findMany({
    include: {
      sourceJobRecord: { select: { id: true, mergedIntoJobId: true } },
      managedVariants: { select: { tailNumber: true } }
    }
  });

  for (const g of GROUPS) {
    const matches = reqs.filter((r) => {
      const hay = `${r.title} ${r.fleetPositionSlug ?? ""} ${arr(r.aircraftTypesJson).join(" ")}`;
      return g.re.test(hay);
    });
    console.log(`\n=== ${g.label} (${matches.length}) ===`);
    for (const r of matches) {
      const hidden = r.sourceJobRecord?.mergedIntoJobId ? " [MERGED-AWAY/hidden]" : "";
      console.log(
        `• "${r.title}" (${r.id.slice(0, 8)}) status=${r.status} op=${r.operatorType ?? "(unset)"} seat=${r.pilotSeat ?? "—"}${hidden}`
      );
      console.log(`     slug=${r.fleetPositionSlug ?? "—"} tags=${arr(r.aircraftTypesJson).join("/") || "—"} variants=[${r.managedVariants.map((v) => v.tailNumber).join(", ") || "none"}]`);
    }
    if (matches.length === 0) console.log("   (no requirement rows — would need to CREATE)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
