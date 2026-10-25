/**
 * The Paycom applicant upload's PREVIEW, run from the command line. READ-ONLY.
 *
 *   npx tsx scripts/paycom-applicant-dryrun.ts "<ApplicationDocuments.zip>" "<ResumeDocuments.zip>"
 *
 * Runs exactly what the Imports page's preview runs (lib/paycom/applicant-import.ts
 * buildPreview) against the live database and prints it: who each application is,
 * which job it goes to, what would be created or reopened. Writes nothing — no
 * batch, no rows, no files — so it is the safe way to see what an upload would do,
 * and the check that the parser still reads Paycom's layout after they change it.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { readFileSync } from "node:fs";
import path from "node:path";
import { buildPreview, readExport } from "../lib/paycom/applicant-import";
import { prisma } from "../lib/prisma";

async function main() {
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!files.length) throw new Error("Pass the two Paycom zips (or the PDFs out of them).");
  const read = await readExport(files.map((f) => ({ name: path.basename(f), bytes: new Uint8Array(readFileSync(f)) })));
  const preview = await buildPreview(read);

  const rows = preview.rows;
  const fresh = rows.filter((r) => !r.alreadyImported);
  const count = (k: string) => fresh.filter((r) => r.candidate.kind === k).length;
  console.log(`\n${read.bundles.length} bundle PDF(s), ${rows.length} applications, ${read.resumes.size} resumes`);
  console.log(`already in the app: ${rows.length - fresh.length}`);
  console.log(`existing person (email/phone): ${count("existing")}   needs a decision: ${count("decide")}   new person: ${count("new")}`);
  console.log(`no resume: ${fresh.filter((r) => !r.resumeName).length}   resumes with no application: ${preview.resumesWithoutApplication.length}`);
  if (preview.problems.length) console.log(`problems:\n  ${preview.problems.join("\n  ")}`);

  console.log("\nJOBS");
  for (const j of preview.jobs) {
    const where = j.match
      ? `-> ${j.match.title} [${j.match.status}] (${j.match.via})${j.match.status !== "OPEN" && !j.closedPosting ? "  WOULD REOPEN" : ""}`
      : `-> NEW JOB "${j.newJobTitle}"${j.closedPosting ? " (retired: posting closed)" : ""}${j.suggestions.length ? `   near: ${j.suggestions.map((s) => `${s.title} [${s.status}]`).join("; ")}` : ""}`;
    console.log(`  ${String(j.count).padStart(3)}  ${j.paycomTitle}  ${where}`);
  }

  console.log("\nPEOPLE");
  for (const r of rows) {
    const c = r.candidate;
    const who = r.alreadyImported
      ? "ALREADY IMPORTED"
      : c.kind === "existing"
        ? `existing by ${c.by}: ${c.hit.displayName}${c.hit.archived ? (c.hit.employed ? " [archived, EMPLOYEE]" : " [archived -> reactivate]") : ""}${c.hit.viaMergedName ? ` (via merged ${c.hit.viaMergedName})` : ""}`
        : c.kind === "decide"
          ? `DECIDE (${c.by}): ${c.options.map((o) => `${o.displayName}${o.archived ? " [archived]" : ""}`).join(" | ")}`
          : "new";
    console.log(`  ${r.applicationId}  ${r.displayName.padEnd(26)} ${who}${r.resumeName ? "" : "  (no resume)"}`);
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
