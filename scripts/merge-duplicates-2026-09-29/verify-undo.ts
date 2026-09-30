// READ-ONLY: after an --undo, is every record in the undo file back EXACTLY as it was?
// Compares each record's fields and its role, stint, contract and type rows, field by field.
//   npx tsx scripts/merge-duplicates-2026-09-29/verify-undo.ts <undo file>
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });
import fs from "node:fs";
import { prisma } from "../../lib/prisma";

const norm = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : Array.isArray(v) ? v.map(norm) : v);

(async () => {
  const file = process.argv[2];
  const rec = JSON.parse(fs.readFileSync(file, "utf8")) as { pairs: Array<Record<"keep" | "drop", Record<string, unknown> & { id: string }>> };
  let fields = 0, rows = 0;
  const diffs: string[] = [];
  for (const pair of rec.pairs) {
    for (const side of ["keep", "drop"] as const) {
      const snap = pair[side];
      const now = await prisma.newHire.findUnique({ where: { id: snap.id }, include: { roleAssignments: true, employmentStints: true, contractPeriods: true, employmentTypePeriods: true } });
      if (!now) { diffs.push(`${snap.name}: record missing`); continue; }
      for (const [k, v] of Object.entries(snap)) {
        if (["_count", "roleAssignments", "employmentStints", "contractPeriods", "employmentTypePeriods", "updatedAt"].includes(k)) continue;
        fields++;
        const a = JSON.stringify(norm(v)), b = JSON.stringify(norm((now as Record<string, unknown>)[k]));
        if (a !== b) diffs.push(`${snap.name}.${k}: was ${a}, now ${b}`);
      }
      for (const key of ["roleAssignments", "employmentStints", "contractPeriods", "employmentTypePeriods"] as const) {
        const was: Array<Record<string, unknown>> = (snap[key] as Array<Record<string, unknown>>).map((r) => ({ ...r, updatedAt: undefined }));
        const is: Array<Record<string, unknown>> = (now[key] as unknown as Array<Record<string, unknown>>).map((r) => ({ ...r, updatedAt: undefined }));
        rows += was.length;
        const byId = new Map(is.map((r) => [r.id as string, r]));
        for (const w of was) {
          const n = byId.get(w.id as string);
          if (!n) { diffs.push(`${snap.name}.${key}: row ${w.id} missing`); continue; }
          for (const [k, v] of Object.entries(w)) if (k !== "updatedAt" && JSON.stringify(norm(v)) !== JSON.stringify(norm(n[k]))) diffs.push(`${snap.name}.${key}.${k}: was ${JSON.stringify(norm(v))}, now ${JSON.stringify(norm(n[k]))}`);
        }
        if (is.length !== was.length) diffs.push(`${snap.name}.${key}: ${was.length} rows before, ${is.length} now`);
      }
    }
  }
  console.log(`checked ${fields} fields and ${rows} rows across ${rec.pairs.length * 2} records | differences: ${diffs.length}${diffs.length ? `\n  ${diffs.join("\n  ")}` : ""}`);
  await prisma.$disconnect();
})();
