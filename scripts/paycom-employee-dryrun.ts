// Read-only dry run of the Imports -> Paycom employees upload against the live database:
// the same preview the page shows, printed. Writes nothing - no ImportBatch either.
//
//   npx tsx scripts/paycom-employee-dryrun.ts <xlsx>
//
// The second half is a control for the position comparison, which has no baseline until
// an upload is applied: it re-runs the preview against a made-up baseline in which the
// first three current people held a different Paycom position, and those three must
// come back as position changes - and nobody else.

import path from "node:path";
import { prisma } from "@/lib/prisma";
import { readExport } from "@/lib/paycom/employee-export";
import { asOfFromFilename, buildPreview, loadBaseline } from "@/lib/paycom/employee-import";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: <xlsx>");
  const name = path.basename(file);
  const rows = readExport(file);
  const asOf = asOfFromFilename(name) ?? new Date().toISOString().slice(0, 10);
  const baseline = await loadBaseline();
  const { preview, positions } = await buildPreview({ rows, file: name, asOf, asOfFrom: asOfFromFilename(name) ? "file name" : "upload day", baseline });

  console.log(`file ${name} | as of ${preview.asOf} (${preview.asOfFrom})`);
  console.log(`export rows ${preview.exportRows} | matched ${preview.matched} | dates agree ${preview.agree} | changes ${preview.changes.length} | for a person ${preview.forPerson.length} | unmatched ${preview.unmatched.length}`);
  console.log(`full/part time: ${Object.entries(preview.dolTally).map(([k, v]) => `${k} ${v}`).join(" | ")}`);
  console.log(`position baseline: ${preview.baseline ? `${preview.baseline.file} (${preview.baseline.at})` : "none - applying this upload records the starting point"}`);
  for (const c of preview.changes) {
    console.log(`\n${c.name} [Paycom ${c.paycomLabel}]`);
    if (c.dates) console.log(`   dates (${c.dates.action}): ${c.dates.what.join("; ")} => ${c.dates.result}`);
    if (c.dol) console.log(`   type: ${c.dol}`);
    if (c.position) console.log(`   position: Paycom ${c.position.from} -> ${c.position.to}; app title now ${c.position.appTitle ?? "(none)"}, suggested ${c.suggestedTitle ?? "(none)"}`);
  }
  if (preview.forPerson.length) console.log(`\nFOR A PERSON - not changed:\n  ${preview.forPerson.map((f) => `${f.name} (Paycom ${f.paycomLabel}) - ${f.why}`).join("\n  ")}`);
  if (preview.unmatched.length) console.log(`\nNOT MATCHED:\n  ${preview.unmatched.map((u) => `${u.label} | ${u.position || "(no position)"} | hire ${u.hire}${u.term ? ` left ${u.term}` : ""}`).join("\n  ")}`);

  // ---- control: a made-up baseline with three positions moved
  const current = preview.changes.length ? [] : Object.keys(positions);
  const people = await prisma.newHire.findMany({ where: { id: { in: current }, employmentStatus: "ACTIVE" }, select: { id: true, name: true }, orderBy: { name: "asc" } });
  const moved = people.filter((p) => rows.some((r) => !r.term && r.position === positions[p.id])).slice(0, 3);
  const fake = { ...positions };
  for (const p of moved) fake[p.id] = "CONTROL - an older Paycom position";
  const control = await buildPreview({ rows, file: name, asOf, asOfFrom: "file name", baseline: { batchId: "control", at: "control", file: "control", positions: fake } });
  const hit = control.preview.changes.filter((c) => c.position);
  console.log(`\nCONTROL: moved ${moved.length} baseline positions (${moved.map((p) => p.name).join(", ")})`);
  console.log(`CONTROL: preview found ${hit.length} position changes: ${hit.map((c) => `${c.name}: ${c.position!.from} -> ${c.position!.to}, suggested app title ${c.suggestedTitle ?? "(none)"}`).join(" | ")}`);
  console.log(`\nDRY RUN - nothing written.`);
}

main().finally(() => prisma.$disconnect());
