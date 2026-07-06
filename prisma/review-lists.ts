// Print the two "needs a human decision" lists from the employee-history cleanup,
// each with a clickable /people/<id> profile link:
//   npx tsx prisma/review-lists.ts
import { prisma } from "@/lib/prisma";

const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "open");

async function main() {
  // 1) Active employees still sitting in the ARCHIVED stage (excluding canceled).
  const aa = await prisma.newHire.findMany({
    where: { employmentStatus: "ACTIVE", stage: "ARCHIVED", canceled: false },
    select: { id: true, name: true, position: true },
    orderBy: { name: "asc" }
  });
  console.log(`\n=== ACTIVE but filed under ARCHIVED (${aa.length}) — current or truly archived? ===`);
  for (const h of aa) console.log(`  ${h.name.padEnd(22)} ${h.position ?? "-"}   /people/${h.id}`);

  // 2) Terminated former employees with an inverted role/stint (junk inferred date).
  const term = await prisma.newHire.findMany({
    where: { employmentStatus: "TERMINATED" },
    select: {
      id: true,
      name: true,
      roleAssignments: { select: { title: true, startDate: true, endDate: true } },
      employmentStints: { select: { startDate: true, endDate: true } }
    },
    orderBy: { name: "asc" }
  });
  const flagged: string[] = [];
  for (const h of term) {
    const br = h.roleAssignments.find((r) => r.endDate && r.endDate < r.startDate);
    const bs = h.employmentStints.find((s) => s.endDate && s.endDate < s.startDate);
    if (!br && !bs) continue;
    const why = br
      ? `role "${br.title}" ends ${d(br.endDate)} before start ${d(br.startDate)}`
      : `stint ${d(bs!.startDate)} → ${d(bs!.endDate)} inverted`;
    flagged.push(`  ${h.name.padEnd(22)} ${why}   /people/${h.id}`);
  }
  console.log(`\n=== Terminated w/ junk inferred dates (${flagged.length}) — fix via the role editor ===`);
  console.log(flagged.join("\n"));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
