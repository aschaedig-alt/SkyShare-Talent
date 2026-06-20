/** READ-ONLY review for the scoring follow-ups:
 *  1) the cloned hour-minimum gates on the new managed roles
 *  2) which (aircraft, seat) profiles the scoring setup will list, vs every role
 */
import { prisma } from "../../lib/prisma";
import { profileKey, profileLabel } from "../../lib/matching/scoring-config";

function arr(v: string | null): string[] {
  if (!v) return [];
  try {
    const p = JSON.parse(v);
    return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const NEW_ROLES = [
  "560XLS+ Captain",
  "560XLS+ First Officer",
  "Phenom 300 Captain",
  "Phenom 300 First Officer",
  "Legacy 650 Captain",
  "Legacy 650 Lead Captain"
];

async function main() {
  // ---- 1) Cloned gates on the new managed roles ----
  console.log(`\n=== 1) CLONED HOUR-MINIMUM GATES ON NEW MANAGED ROLES ===`);
  for (const title of NEW_ROLES) {
    const r = await prisma.pilotRequirement.findFirst({
      where: { title },
      include: { gates: { where: { enabled: true }, orderBy: [{ category: "asc" }, { sortOrder: "asc" }] } }
    });
    if (!r) {
      console.log(`\n• ${title} — NOT FOUND`);
      continue;
    }
    const mins = r.gates.filter((g) => typeof g.numericValue === "number" && g.numericValue > 0);
    console.log(`\n• ${title} (${r.id.slice(0, 8)}) — ${r.gates.length} enabled gates, ${mins.length} numeric minimums`);
    for (const g of mins) {
      console.log(`     ${g.label}: ${g.numericValue?.toLocaleString()}`);
    }
    const textGates = r.gates.filter((g) => g.numericValue === null);
    if (textGates.length) console.log(`     [other enabled: ${textGates.map((g) => g.label).join(", ")}]`);
  }

  // ---- 2) Scoring-setup profile coverage ----
  console.log(`\n\n=== 2) SCORING-SETUP PROFILE COVERAGE ===`);
  const rows = await prisma.pilotRequirement.findMany({
    where: { NOT: { sourceJobRecord: { mergedIntoJobId: { not: null } } } },
    select: { title: true, aircraftTypesJson: true, pilotSeat: true, operatorType: true }
  });
  const combos = new Map<string, { label: string; count: number; roles: string[] }>();
  for (const r of rows) {
    const aircraft = arr(r.aircraftTypesJson)[0] ?? null;
    const key = profileKey(aircraft, r.pilotSeat);
    const g = combos.get(key) ?? { label: profileLabel(aircraft, r.pilotSeat), count: 0, roles: [] };
    g.count += 1;
    g.roles.push(r.title);
    combos.set(key, g);
  }
  console.log(`Total visible roles: ${rows.length} → ${combos.size} scoring profiles\n`);
  for (const [, g] of [...combos.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label))) {
    console.log(`• ${g.label}  (${g.count} role${g.count === 1 ? "" : "s"}: ${g.roles.join(", ")})`);
  }

  // Flag roles whose aircraft tag is missing/odd (they collapse to "Any aircraft")
  const noAircraft = rows.filter((r) => !arr(r.aircraftTypesJson)[0]);
  console.log(`\nRoles with NO aircraft tag (collapse to "Any aircraft" profile): ${noAircraft.length}`);
  for (const r of noAircraft) console.log(`   - ${r.title} (seat=${r.pilotSeat ?? "—"})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
