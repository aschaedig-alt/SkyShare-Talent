// Load how applicants found SkyShare - Paycom's applicant Source Report - onto the
// applications we already hold, and seed the reviewable list of tidy source names.
//
// His export of 2026-09-29 ("paycom source report.xlsx", sheet "Source Report"):
// one row per APPLICATION, 9,030 of them, Feb 2025 on. Each carries Traffic Source
// (where Paycom saw them arrive from), Referral Source (what they picked for "how
// did you hear about us") and Referral Name. His words: "if someone lists more than
// one source we need to note all of them. sometimes there can be more than one at
// different times" - so every application keeps its own, and a person's sources are
// all of their applications' together, never one picked for them.
//
// Matched on Paycom's Application ID = CandidateApplication.sourceApplicationId,
// which every Paycom-imported application carries - the key the stage reconcile
// uses. A row with no matching application is listed, not created: those are
// applications newer than the last Hiring Metrics import, and re-running this after
// that import picks them up.
//
// Stored EXACTLY as Paycom had them. The tidy name comes from SourceAlias (see
// lib/sources/normalize.ts): SEED below is the first pass, and a spelling that
// already has a row is never overwritten - Reports > Sources is where a person
// corrects one, and that correction must survive a re-run.
//
//   npx tsx prisma/import-paycom-sources.ts ["<path to the .xlsx>"]            dry run
//   npx tsx prisma/import-paycom-sources.ts ["<path>"] --apply [--limit N]     loads; writes an undo record
//   npx tsx prisma/import-paycom-sources.ts --undo <undo file>                 puts back exactly what it changed

import fs from "node:fs";
import path from "node:path";
import XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { sourceKey } from "@/lib/sources/normalize";

const DEFAULT_FILE = "C:/Users/Recruiter/Downloads/paycom source report.xlsx";
const UNDO_DIR = path.join(process.cwd(), "scripts", "paycom-sources");
const BY = "import-paycom-sources";

// First-pass tidy names, by raw spelling (keyed through sourceKey on load). Every
// spelling seen in the Paycom report (Traffic and Referral Source) and in the
// JazzHR-era candidates' source, as of 2026-09-29, plus his own example "bizjet".
const SEED: Array<[string, string]> = [
  // Job boards and sites
  ["Indeed", "Indeed"], ["Indeed - Organic", "Indeed"], ["Indeed - Sponsored", "Indeed"],
  ["BizJetJobs", "BizJetJobs"], ["bizjet", "BizJetJobs"], ["JobTarget via BizJetJobs", "BizJetJobs"],
  ["Climbto350", "ClimbTo350"],
  ["JSfirm", "JSfirm"], ["JobTarget via JSFirm", "JSfirm"],
  ["LinkedIn", "LinkedIn"],
  ["ZipRecruiter", "ZipRecruiter"], ["ZipRecruiter Organic", "ZipRecruiter"],
  ["Pilotsglobal", "PilotsGlobal"], ["Pilotcareercenter", "Pilot Career Center"], ["Flighthired", "FlightHired"],
  ["Pilotpool", "PilotPool"], ["Mypilotinterview", "MyPilotInterview"], ["Pilotassessments", "PilotAssessments"],
  ["Flightleveljobs", "FlightLevelJobs"], ["Flightess.mykajabi", "Flightess"], ["Forums.propilotworld", "ProPilotWorld"],
  ["Inmyjet", "InMyJet"], ["JobTarget", "JobTarget"], ["Adzuna", "Adzuna"], ["Jooble", "Jooble"], ["Glassdoor", "Glassdoor"],
  ["Jobleads", "JobLeads"], ["Jobright.ai", "Jobright"], ["Builtin", "Built In"], ["Remotive", "Remotive"],
  ["Postjobfree", "PostJobFree"], ["Hiring.cafe", "Hiring Cafe"], ["Us.bebee", "beBee"], ["Us.trabajo.org", "Trabajo.org"],
  ["Talent.com IA", "Talent.com"], ["myjobhelper", "MyJobHelper"], ["KSL", "KSL"], ["Urlwatch", "urlwatch"],
  ["Google", "Google"], ["google_jobs_apply", "Google"],
  // Social
  ["Facebook", "Facebook"], ["L.instagram", "Instagram"], ["Snapchat", "Snapchat"],
  // SkyShare's own pages
  ["Skyshare", "SkyShare website"], ["SkyShare Website", "SkyShare website"], ["Career Page", "SkyShare website"],
  ["Careers Page", "SkyShare website"], ["Our Career Page", "SkyShare website"],
  ["Paycomonline.net", "Paycom job page"], ["JazzHR", "JazzHR"],
  // People
  ["Employee Referral", "Employee referral"], ["Customer Referral", "Customer referral"], ["Customer Provided", "Customer referral"],
  ["Managed Client Referral", "Customer referral"], ["Referral", "Referral"], ["External Referral", "Referral"],
  ["Outside Referral", "Referral"], ["Rehire", "Rehire"], ["Former Employee", "Rehire"], ["Current Employee", "Current employee"],
  ["Walk-in", "Walk-in"], ["Client Added", "Added by SkyShare"],
  // Other
  ["Email", "Email link"], ["Mail.google", "Email link"], ["Mail.yahoo", "Email link"],
  ["NBAA", "NBAA"], ["Breeze Lift Program", "Breeze Lift Program"], ["FCI", "FCI"], ["Other", "Other"], ["ca", "Unknown"]
];

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim() || null;

type Values = { trafficSource: string | null; referralSource: string | null; referralName: string | null };
/** What a load changed, compactly: each distinct before-value with the Paycom
    Application IDs that held it (a first load is one group - all three empty). */
type UndoRecord = { loadedAt: string; file: string; restore: Array<{ before: Values; paycomIds: string[] }>; aliasIds: string[] };

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const undoIdx = args.indexOf("--undo");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

  if (undoIdx >= 0) {
    const file = args[undoIdx + 1];
    if (!file) throw new Error("--undo needs the undo file a load wrote");
    const rec = JSON.parse(fs.readFileSync(file, "utf8")) as UndoRecord;
    let restored = 0;
    for (const g of rec.restore) {
      for (let i = 0; i < g.paycomIds.length; i += 500) {
        const res = await prisma.candidateApplication.updateMany({ where: { sourceApplicationId: { in: g.paycomIds.slice(i, i + 500) } }, data: g.before });
        restored += res.count;
      }
    }
    const removed = await prisma.sourceAlias.deleteMany({ where: { id: { in: rec.aliasIds }, updatedBy: BY } });
    console.log(`undo: restored ${restored} applications; removed ${removed.count} of the ${rec.aliasIds.length} seeded source names (a name a person has since edited is kept)`);
    return;
  }

  const file = args.find((a) => /\.xlsx$/i.test(a)) ?? DEFAULT_FILE;
  const wb = XLSX.readFile(file);
  const sheet = wb.Sheets["Source Report"] ?? wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: false });
  for (const col of ["Application ID", "Traffic Source", "Referral Source", "Referral Name"]) {
    if (!(col in (rows[0] ?? {}))) throw new Error(`"${col}" column not found - is this Paycom's applicant Source Report?`);
  }

  const held = await prisma.candidateApplication.findMany({
    where: { sourceApplicationId: { not: null } },
    select: { id: true, sourceApplicationId: true, trafficSource: true, referralSource: true, referralName: true }
  });
  const byAppId = new Map(held.map((a) => [a.sourceApplicationId as string, a]));

  type Change = { id: string; paycomId: string; before: Values; after: Values };
  const changes: Change[] = [];
  const unmatched: Array<{ id: string; date: string; hired: string }> = [];
  let same = 0;
  for (const r of rows) {
    const appId = clean(r["Application ID"]);
    if (!appId) continue;
    const a = byAppId.get(appId);
    if (!a) { unmatched.push({ id: appId, date: String(clean(r["Application Date"]) ?? "").slice(0, 10), hired: String(clean(r["Hired"]) ?? "") }); continue; }
    const after = { trafficSource: clean(r["Traffic Source"]), referralSource: clean(r["Referral Source"]), referralName: clean(r["Referral Name"]) };
    const before = { trafficSource: a.trafficSource, referralSource: a.referralSource, referralName: a.referralName };
    if (before.trafficSource === after.trafficSource && before.referralSource === after.referralSource && before.referralName === after.referralName) { same++; continue; }
    changes.push({ id: a.id, paycomId: appId, before, after });
  }

  // Seed names: every seed spelling, keyed; skip a key that already has a row.
  const existing = new Map((await prisma.sourceAlias.findMany({ select: { key: true, canonical: true } })).map((s) => [s.key, s.canonical]));
  const seedByKey = new Map<string, string>();
  for (const [raw, canonical] of SEED) { const k = sourceKey(raw); if (k && !seedByKey.has(k)) seedByKey.set(k, canonical); }
  const newAliases = [...seedByKey].filter(([k]) => !existing.has(k));
  // Every spelling in this file, and whether it will have a tidy name.
  const spellings = new Map<string, { raw: Set<string>; n: number }>();
  for (const r of rows) for (const col of ["Traffic Source", "Referral Source"]) {
    const raw = clean(r[col]); const k = sourceKey(raw);
    if (!raw || !k) continue;
    const s = spellings.get(k) ?? { raw: new Set<string>(), n: 0 }; s.raw.add(raw); s.n++; spellings.set(k, s);
  }
  const unnamed = [...spellings].filter(([k]) => !existing.has(k) && !seedByKey.has(k));

  console.log(`# Paycom sources - ${apply ? "APPLY" : "DRY RUN"} ${new Date().toISOString().slice(0, 16)}Z`);
  console.log(`file: ${file} | ${rows.length} rows`);
  console.log(`matched an application we hold: ${rows.length - unmatched.length} | already identical: ${same} | to write: ${changes.length}${Number.isFinite(limit) ? ` (this run: first ${Math.min(limit, changes.length)})` : ""}`);
  const byYear = new Map<string, number>(); for (const u of unmatched) { const y = u.date.slice(6, 10) || "?"; byYear.set(y, (byYear.get(y) ?? 0) + 1); }
  console.log(`no application in the app yet (newer than the last Hiring Metrics import): ${unmatched.length} - by year ${[...byYear].map(([y, n]) => `${y}: ${n}`).join(", ")}; of them hired: ${unmatched.filter((u) => /^yes$/i.test(u.hired)).length}`);
  console.log(`with a Traffic Source: ${changes.filter((c) => c.after.trafficSource).length + 0} | Referral Source: ${changes.filter((c) => c.after.referralSource).length} | Referral Name: ${changes.filter((c) => c.after.referralName).length}  (of the rows to write)`);
  console.log(`source names: ${existing.size} already exist, ${newAliases.length} to seed; spellings in this file with NO name after seeding: ${unnamed.length ? unnamed.map(([, s]) => `${[...s.raw].join("/")} (${s.n})`).join(", ") : "none"}`);
  console.log(`\nspelling -> tidy name, for everything in this file (count = rows naming it, Traffic and Referral together):`);
  for (const [k, s] of [...spellings].sort((a, b) => b[1].n - a[1].n)) console.log(`   ${String(s.n).padStart(5)}  ${[...s.raw].join(" / ")}  ->  ${existing.get(k) ?? seedByKey.get(k) ?? "(UNMAPPED)"}${existing.has(k) ? "" : " [seed]"}`);

  if (!apply) { console.log(`\nDry run - nothing written. Load with --apply (try --limit 50 first).`); return; }

  const todo = changes.slice(0, Number.isFinite(limit) ? limit : changes.length);
  // Group identical values so one statement writes many applications.
  const groups = new Map<string, { after: Change["after"]; ids: string[] }>();
  for (const c of todo) { const g = JSON.stringify(c.after); const e = groups.get(g) ?? { after: c.after, ids: [] }; e.ids.push(c.id); groups.set(g, e); }
  const ops = [...groups.values()];
  for (let i = 0; i < ops.length; i += 50) {
    await prisma.$transaction(ops.slice(i, i + 50).map((g) => prisma.candidateApplication.updateMany({ where: { id: { in: g.ids } }, data: g.after })));
  }
  const aliasIds: string[] = [];
  for (const [key, canonical] of newAliases) {
    const row = await prisma.sourceAlias.create({ data: { key, canonical, updatedBy: BY }, select: { id: true } });
    aliasIds.push(row.id);
  }
  fs.mkdirSync(UNDO_DIR, { recursive: true });
  const undoFile = path.join(UNDO_DIR, `undo-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  const restore = new Map<string, UndoRecord["restore"][number]>();
  for (const c of todo) { const k = JSON.stringify(c.before); const g = restore.get(k) ?? { before: c.before, paycomIds: [] }; g.paycomIds.push(c.paycomId); restore.set(k, g); }
  const record: UndoRecord = { loadedAt: new Date().toISOString(), file, restore: [...restore.values()], aliasIds };
  fs.writeFileSync(undoFile, JSON.stringify(record));
  console.log(`\nWROTE sources on ${todo.length} applications (${ops.length} statements) and seeded ${aliasIds.length} source names.`);
  console.log(`Undo: npx tsx prisma/import-paycom-sources.ts --undo ${path.relative(process.cwd(), undoFile)}`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
