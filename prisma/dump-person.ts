// Dump one or more people's stints + roles for review:
//   npx tsx prisma/dump-person.ts "Andrew Steward" "Kylee Madsen"
import { prisma } from "@/lib/prisma";

const d = (x: Date | null) => (x ? x.toISOString().slice(0, 10) : "—(open)");

async function main() {
  const names = process.argv.slice(2);
  for (const name of names) {
    const h = await prisma.newHire.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: {
        id: true, name: true, importKey: true, employmentStatus: true, terminationDate: true, startDate: true,
        employmentStints: { select: { startDate: true, endDate: true, note: true }, orderBy: { startDate: "asc" } },
        roleAssignments: { select: { title: true, seat: true, aircraft: true, startDate: true, endDate: true, transitionType: true, createdAt: true } }
      }
    });
    if (!h) { console.log(`\n${name}: NOT FOUND`); continue; }
    console.log(`\n=== ${h.name}  [${h.employmentStatus}${h.terminationDate ? " term " + d(h.terminationDate) : ""}]  key=${h.importKey ?? "—"}`);
    console.log("  stints:");
    for (const s of h.employmentStints) console.log(`    ${d(s.startDate)} → ${d(s.endDate)}${s.note ? "  (" + s.note + ")" : ""}`);
    console.log("  roles:");
    const roles = [...h.roleAssignments].sort((a, b) => a.startDate.getTime() - b.startDate.getTime() || a.createdAt.getTime() - b.createdAt.getTime());
    for (const r of roles) console.log(`    ${d(r.startDate)} → ${d(r.endDate)}  ${r.title}  [${r.seat ?? "—"}] ${r.transitionType}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
