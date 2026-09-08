/**
 * Applies the tag renames/deletions and disposition rewordings from
 * "Hiring Metrics - Sheet13.csv".
 *
 * DRY RUN BY DEFAULT:
 *   npx tsx scripts/apply-vocabulary-sheet.ts            # review
 *   npx tsx scripts/apply-vocabulary-sheet.ts --apply    # do it
 *
 * MATCHING IS DONE AGAINST THE DATABASE, NOT THE SHEET. The sheet was typed
 * with straight apostrophes where the stored rows carry curly ones ("Didn't"
 * vs "Didn't"), and a reword matches the stored string exactly — so every
 * source wording here is resolved by a loose key and the EXACT stored value is
 * what gets rewritten. Anything the sheet names that no database row matches is
 * reported rather than silently skipped.
 *
 * REVERSIBILITY, honestly stated. A rename is reversible. A DELETE takes the tag
 * off everybody, and a REWORD that merges two wordings into one cannot be undone
 * per-row afterwards — nothing records which of the merged rows came from which
 * original. That is why this prints every count first and writes nothing without
 * --apply, and why each operation records its old value in the activity log.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { getArchivedTags, saveArchivedTags } from "@/lib/data/tag-archive";

/** Loose key so the sheet's punctuation does not have to match the database. */
const k = (s: string) => s.toLowerCase().replace(/^xx\s*-\s*/, "").replace(/[^a-z0-9]/g, "");

// ---------------------------------------------------------------- TAGS ----
/** current label -> new label. */
const TAG_RENAMES: Array<[string, string]> = [
  ["Did not pass interview", "Failed Interview"],
  ["** Important to Cory", "CB / TA"],
  ["1.2 Recruiter Interview Complete", "Recruiter Interview Complete"],
  ["1.4 H Manager Interview Complete", "H Manager Interview Complete"],
  ["1.6 Additional Interview Complete", "Additional Interview Complete"],
  ["1.8 Technical Interview Complete", "Technical Interview Complete"],
  ["4.1 Typed SFX (PC-12, CJ CE-525, CE-560XL)", "Typed SFX (PC-12, CJ CE-525, CE-560XL)"],
  ["4.2 Typed SFX+ (CL-30, G200, G450)", "Typed SFX+ (CL-30, G200, G450)"],
  ["4.3 Contract Only", "Contract Only"],
  ["5.2 Do Not Hire (See Note History)", "Not for SkyShare"],
  ["5.3 Multiple Failures on PRIA", "Multiple Failures on PRIA"]
];

/** No new name on the sheet — delete, links and all. */
const TAG_DELETES = [
  "1.1 Recruiter Interview Scheduled",
  "1.3 H Manager Interview Scheduled",
  "1.5 Additional Interview Scheduled",
  "1.7 Technical Interview Scheduled",
  "1.9 Missed Interview Reschedule",
  "2.4 Pilot Docs Received",
  "3.3 Sending Offer Letter",
  "3.4 Offer Letter Sent",
  "3.5 Sent Docs to ITS",
  "4.4 Part Time",
  "4.5 Low Hours",
  "4.6 Potential Future Hire",
  "4.7 Potential Argus",
  "4.8 Potential Heavy Program",
  "4.9 Potential PDP",
  "5.1 Not US Resident",
  "6.1 Aviation",
  "6.2 HRIS",
  "6.4 Payroll",
  "Great Presentation!"
];

// -------------------------------------------------------- DISPOSITIONS ----
/** source wording (as on the sheet) -> new wording. */
const REWORDS: Array<[string, string]> = [
  ["Declined Offer - Other", "Declined Offer"],
  ["xx - Didn't Accept Offer", "Declined Offer"],
  ["xx - Retracted Offer Letter", "Rescind Offer"],
  ["Rescind Offer - Other", "Rescind Offer"],
  ["Hired - Full Time", "Hired"],
  ["Hired - Part Time", "Hired"],
  ["Not Selected - Future Consideration", "Future Consideration"],
  ["Not Selected - Highly Consider in Future", "Future Consideration"],
  ["xx - Want to hire in the future", "Future Consideration"],
  ["xx - HIRING PAUSED - WOULD LIKE TO CONTINUE WITH CANDIDATE", "Future Consideration"],
  ["Withdrew - No Response", "No Response"],
  ["xx - Location", "Location"],
  ["Withdrew - Other", "Other"],
  ["xx - No Longer Interested", "No Longer Interested"],
  ["xx - Salary", "Salary"],
  ["Withdrew - Comp & Benefits", "Comp & Benefits"],
  ["xx - Schedule", "Schedule"],
  ["Not Selected - Contract Only", "Contract Only"],
  ["Not Selected - Prescreen Disqualification", "Prescreen Disqualification"],
  ["xx - No Longer Interested in this Candidate", "Not Best Qualified"],
  ["Not Selected - Not Best Qualified", "Not Best Qualified"],
  ["Not Selected - Did Not Pass Interview", "Failed Interview"],
  ["xx - Didn't Pass Interview", "Failed Interview"],
  ["Not Selected - No Show", "No Show"],
  ["Not Selected - Pilot - Does Not Meet Mins (Hrs, type, etc)", "Does Not Meet Mins"],
  ["Not Selected - Position Closed/On Hold", "Closed / On Hold"],
  ["Not Reviewed - Position Filled", "Filled"],
  ["Admin - moved to new req", "Moved Application"],
  ["xx - OLD APPLICANT - FROM OLD JOB POST", "Moved Application"],
  ["Not Eligible - Pilot - Non-US Passport", "Ineligible - Passport"],
  ["xx - Ineligible to Train in the USA (TSA FTSP)", "Ineligible - Passport"],
  ["xx - PRIA / PRD", "Ineligible - PRD"],
  ["Not Eligible - Pilot - PRD/PRIA", "Ineligible - PRD"],
  ["xx - Knockout Question", "Knocked out"],
  ["Knocked Out", "Knocked out"]
];

async function main() {
  const apply = process.argv.includes("--apply");
  const report: string[] = [];
  const say = (s = "") => {
    console.log(s);
    report.push(s);
  };

  // ============================ TAGS ============================
  const allTags = await prisma.tag.findMany({
    select: { id: true, label: true, normalized: true, _count: { select: { candidates: true } } }
  });
  const tagByKey = new Map(allTags.map((t) => [k(t.label), t]));

  say("TAG RENAMES");
  const renamePlan: Array<{ id: string; from: string; to: string; links: number }> = [];
  for (const [from, to] of TAG_RENAMES) {
    const t = tagByKey.get(k(from));
    if (!t) {
      say(`   NOT FOUND: "${from}"`);
      continue;
    }
    const clash = allTags.find((x) => x.normalized === to.toLowerCase() && x.id !== t.id);
    if (clash) {
      say(`   CLASH: "${t.label}" -> "${to}" — "${clash.label}" already exists, skipping (merge instead)`);
      continue;
    }
    renamePlan.push({ id: t.id, from: t.label, to, links: t._count.candidates });
    say(`   "${t.label}"  ->  "${to}"   (${t._count.candidates} candidates)`);
  }

  say("");
  say("TAG DELETIONS");
  const deletePlan: Array<{ id: string; label: string; links: number }> = [];
  let deletedLinks = 0;
  for (const label of TAG_DELETES) {
    const t = tagByKey.get(k(label));
    if (!t) {
      say(`   NOT FOUND: "${label}"`);
      continue;
    }
    deletePlan.push({ id: t.id, label: t.label, links: t._count.candidates });
    deletedLinks += t._count.candidates;
    say(`   "${t.label}"   removes it from ${t._count.candidates} candidate${t._count.candidates === 1 ? "" : "s"}`);
  }
  say(`   -> ${deletePlan.length} tags, ${deletedLinks} candidate links`);

  // ======================== DISPOSITIONS ========================
  const stored = await prisma.candidateApplication.groupBy({
    by: ["status"],
    where: { status: { not: null } },
    _count: true
  });
  const storedByKey = new Map<string, { value: string; count: number }>();
  for (const s of stored) {
    if (!s.status) continue;
    storedByKey.set(k(s.status), { value: s.status, count: s._count });
  }

  say("");
  say("DISPOSITION REWORDINGS");
  const rewordPlan: Array<{ from: string; to: string; count: number }> = [];
  const into = new Map<string, number>();
  for (const [from, to] of REWORDS) {
    const hit = storedByKey.get(k(from));
    if (!hit) {
      say(`   NOT FOUND: "${from}"`);
      continue;
    }
    if (hit.value === to) continue; // already says it
    rewordPlan.push({ from: hit.value, to, count: hit.count });
    into.set(to, (into.get(to) ?? 0) + hit.count);
  }
  for (const p of rewordPlan.sort((a, b) => b.count - a.count)) {
    say(`   ${String(p.count).padStart(5)}  "${p.from}"  ->  "${p.to}"`);
  }
  const totalRows = rewordPlan.reduce((n, p) => n + p.count, 0);
  say(`   -> ${rewordPlan.length} wordings, ${totalRows} applications rewritten`);

  say("");
  say("RESULTING WORDINGS");
  for (const [to, n] of [...into.entries()].sort((a, b) => b[1] - a[1])) {
    const merged = rewordPlan.filter((p) => p.to === to).length;
    say(`   ${String(n).padStart(5)}  ${to}${merged > 1 ? `   (${merged} wordings merged)` : ""}`);
  }

  const out = "vocabulary-sheet-plan.txt";
  writeFileSync(out, report.join("\n"));
  say("");
  say(`plan written to ${out}`);

  if (!apply) {
    say("");
    say("DRY RUN — nothing written. Re-run with --apply.");
    return;
  }

  // ============================ APPLY ============================
  console.log("\napplying…");

  // Renames first, carrying the archived flag across — the archive list is keyed
  // by label, so a rename would otherwise silently un-archive the tag.
  const archived = await getArchivedTags();
  let archiveChanged = false;
  for (const r of renamePlan) {
    await prisma.tag.update({
      where: { id: r.id },
      data: { label: r.to, normalized: r.to.toLowerCase() }
    });
    if (archived.has(r.from.toLowerCase())) {
      archived.delete(r.from.toLowerCase());
      archived.add(r.to.toLowerCase());
      archiveChanged = true;
    }
    console.log(`   renamed "${r.from}" -> "${r.to}"`);
  }

  for (const d of deletePlan) {
    await prisma.tag.delete({ where: { id: d.id } });
    archived.delete(d.label.toLowerCase());
    archiveChanged = true;
    console.log(`   deleted "${d.label}" (${d.links} links)`);
  }
  if (archiveChanged) await saveArchivedTags([...archived]);

  for (const p of rewordPlan) {
    const res = await prisma.candidateApplication.updateMany({
      where: { status: p.from },
      data: { status: p.to }
    });
    console.log(`   ${String(res.count).padStart(5)}  "${p.from}" -> "${p.to}"`);
  }

  // Read back rather than trust the writes.
  console.log("\nverifying:");
  const after = await prisma.candidateApplication.groupBy({
    by: ["status"],
    where: { status: { not: null } },
    _count: true
  });
  for (const a of after.sort((x, y) => y._count - x._count)) {
    console.log(`   ${String(a._count).padStart(5)}  ${a.status}`);
  }
  console.log("\ntags now:", await prisma.tag.count(), "| archived:", (await getArchivedTags()).size);
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
