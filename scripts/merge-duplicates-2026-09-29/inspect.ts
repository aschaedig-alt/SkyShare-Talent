// READ-ONLY: everything about the six duplicate pairs he approved merging (Sep 29 2026) -
// each record's fields, what hangs off it, its stints, roles and type periods - so the
// survivor of each pair is chosen on evidence. Contact details are masked.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import { prisma } from "../../lib/prisma";

export const PAIRS: Array<[string, string]> = [
  ["Tyson Martinez", "Martin Martinez"],
  ["Larry Uzelac", "Lawrence Uzelac"],
  ["Ed Jayousi", "Ahmad Jayousi"],
  ["Lambert McGrath", "Roe McGrath"],
  ["Alex Ortiz", "Saul Ortiz Parson"],
  ["Mauricio Almeida", "Mauricio Almeida Negron"]
];
const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : "-");

(async () => {
  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.join("  <->  ")}`);
    for (const name of pair) {
      const rows = await prisma.newHire.findMany({
        where: { name },
        include: {
          _count: true,
          employmentStints: { orderBy: { startDate: "asc" } },
          roleAssignments: { orderBy: { startDate: "asc" } },
          contractPeriods: true,
          employmentTypePeriods: { orderBy: { startDate: "asc" } }
        }
      });
      if (rows.length !== 1) { console.log(`   ${name}: ${rows.length} records (expected 1)`); continue; }
      const h = rows[0];
      const counts = Object.entries(h._count).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(", ");
      console.log(`   ${h.name} | ${h.id} | key ${h.importKey ?? "-"} | ${h.employmentStatus}/${h.stage}${h.canceled ? " CANCELED" : ""} | legal ${h.legalName ?? "-"} | start ${d(h.startDate)} term ${d(h.terminationDate)} | ${h.position ?? "-"} / ${h.department ?? "-"} | candidate ${h.candidateId ?? "-"} | tags [${h.tags.join(",")}] | email ${h.ssEmail ? "yes" : "-"} | personal ${h.personalEmail ? "yes" : "-"} | phone ${h.phone ? "yes" : "-"} | birthday ${h.birthday ? "yes" : "-"} | created ${d(h.createdAt)}`);
      console.log(`      has: ${counts || "nothing linked"}`);
      console.log(`      stints: ${h.employmentStints.map((s) => `${d(s.startDate)}..${d(s.endDate)}${s.note ? ` (${s.note})` : ""}`).join(" | ") || "none"}`);
      console.log(`      roles: ${h.roleAssignments.map((r) => `${r.title}${r.seat ? ` [${r.seat}]` : ""} ${d(r.startDate)}..${d(r.endDate)} ${r.transitionType}`).join(" | ") || "none"}`);
      console.log(`      contract: ${h.contractPeriods.map((c) => `${d(c.startDate)}..${d(c.endDate)}`).join(" | ") || "none"} | types: ${h.employmentTypePeriods.map((t) => `${t.type} ${d(t.startDate)}..${d(t.endDate)}`).join(" | ") || "none"}`);
      if (h.notes) console.log(`      notes: ${h.notes.slice(0, 200).replace(/\s+/g, " ")}`);
    }
  }
  await prisma.$disconnect();
})();
