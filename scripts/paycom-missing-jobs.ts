/**
 * Create the jobs that only ever existed in Paycom, and put their applicants on them.
 *
 * WHY THIS EXISTS. 8,304 imported Paycom applications arrived carrying a job
 * TITLE and nothing else. scripts/paycom-app-job-link.ts attached the ones whose
 * title names a job on file; what is left includes roles this app has simply
 * never had a Job row for — 897 general pilot applications, a marketing VP, a
 * research analyst. He asked for those rows to exist ("yes create the job
 * records", 2026-09-22) so the people who applied for them stop being filed
 * under a title with nothing behind it.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. Every title here was checked against the
 * jobs already on file first, and anything that might be a variant of one is
 * LEFT OUT — the CJ / CE-525 / Single-Pilot Jet titles especially, because a job
 * called "CJ Captain (Part 91, Georgia)" already exists and inventing a second
 * one is how this repo got four "Gulfstream G200 First Officer" rows. Those wait
 * for a person to say which job they mean. The list below is hand-written for
 * that reason: it is not a rule, it is an answer.
 *
 * Jobs are created RETIRED, not open: these are historical postings, and an open
 * one would show up as something to recruit for. openedDate is the earliest real
 * application date for that title rather than today, so the record is not a lie.
 * Every derived field is computed by the SAME helpers the app's own New job
 * route uses, so nothing downstream can tell these apart from a hand-made row.
 *
 *   npx tsx scripts/paycom-missing-jobs.ts            what it would create and link
 *   npx tsx scripts/paycom-missing-jobs.ts --apply    do it (writes UNDO.json first)
 *   npx tsx scripts/paycom-missing-jobs.ts --undo     unlink those rows and delete the jobs
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { detectSeat, extractAircraftTypes, isPilotTitle } from "../lib/imports/job-import";

const OUT_DIR = path.join("scripts", "paycom-missing-jobs");
const UNDO = path.join(OUT_DIR, "undo.json");

const normalizeTitle = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * The Paycom titles that get a job, with the department to file it under.
 *
 * Verbatim titles, including "(No Active Openings)" and the bonus text: renaming
 * them here would break the link back to what Paycom actually posted, which is
 * the one thing these rows are evidence of.
 */
const CREATE: Array<{ title: string; department: string | null; city: string | null; state: string | null }> = [
  { title: "(No Active Openings) General Pilot Application", department: "Flight Operations", city: "Salt Lake City", state: "UT" },
  { title: "Aircraft Market Research Analyst", department: "Sales", city: "Salt Lake City", state: "UT" },
  { title: "VP of Marketing", department: "Marketing", city: "Salt Lake City", state: "UT" },
  { title: "SkyOps Coordinator", department: "SkyOps", city: "Salt Lake City", state: "UT" },
  { title: "Social Media Manager (on-site)", department: "Marketing", city: "Salt Lake City", state: "UT" },
  {
    title: "Afternoon Shift Lead Aircraft Maintenance Technician (AMT) OGD - $5k sign on bonus!",
    department: "Maintenance",
    city: "Ogden",
    state: "UT"
  },
  { title: "Facilities & Maintenance Manager (Aviation)", department: "Maintenance", city: "Salt Lake City", state: "UT" },
  { title: "Senior Gulfstream Technician", department: "Maintenance", city: "Salt Lake City", state: "UT" },

  // --- Second batch, 2026-09-22: his answers to the full list of 55 titles. ---
  //
  // NO CITY OR STATE on any of these, deliberately. The first batch above was
  // given Salt Lake City because those are head-office roles; he then said he
  // could not answer the location questions without the data, and the import
  // kept only the title — Candidate has no city column and originalFieldsJson is
  // empty on these rows, so nothing here knows where the posting was. A guessed
  // base would read as fact on the job page. They are editable there.
  { title: "PC-12 Captain & CE-525 First Officer", department: "Flight Operations", city: null, state: null },
  { title: "Citation 560XLS+ First Officer", department: "Flight Operations", city: null, state: null },
  // "PC-12 NG Captain" (82 rows) is the SAME seat and he answered "create" to
  // both; it is linked to this one through the ALIASES map in
  // scripts/paycom-app-job-link.ts rather than created a second time, because a
  // pair of jobs for one seat is exactly the duplicate this repo keeps paying
  // for. Flagged to him; one line to split them if he disagrees.
  { title: "Pilatus PC-12 NG Captain", department: "Flight Operations", city: null, state: null },
  { title: "Citation CE-525 (M2) Captain", department: "Flight Operations", city: null, state: null },
  { title: "FBO Manager", department: "FBO", city: null, state: null },
  { title: "Outbound Appointment Setter", department: "Sales", city: null, state: null },
  { title: "Director of Fractional Sales", department: "Sales", city: null, state: null },
  { title: "Charter Sales Executive", department: "Sales", city: null, state: null },
  { title: "OpenJet Sales Advisor", department: "Sales", city: null, state: null },
  { title: "Sales Support Manager", department: "Sales", city: null, state: null },
  { title: "Sr. Graphic Designer", department: "Marketing", city: null, state: null },
  { title: "SVR FBO & Government Affairs Manager", department: "FBO", city: null, state: null },

  // --- Third batch, 2026-09-23. Two titles were held back the day before because
  // he had answered "create" without being shown what already existed. Shown it,
  // he chose differently for each:
  //   "Single-Pilot Jet Captain | Part 91 | Georgia" -> LINKED to the existing
  //     "CJ Captain (Part 91, Georgia)", which was created mid-posting (ALIASES in
  //     scripts/paycom-app-job-link.ts), so it is NOT created here;
  //   "PC-12 SIC (PDP) Evergreen" -> created as its own job, even though the old
  //     "Evergreen PDP" job was once merged into PC-12 First Officer. His call.
  { title: "PC-12 SIC (PDP) Evergreen", department: "Flight Operations", city: null, state: null }
];

type Undo = { at: string; jobIds: string[]; applicationIds: string[] };

async function undo() {
  if (!existsSync(UNDO)) throw new Error("No UNDO.json — nothing was applied from here.");
  const saved = JSON.parse(readFileSync(UNDO, "utf8")) as Undo[];
  let unlinked = 0;
  let deleted = 0;
  for (const record of saved) {
    for (const id of record.applicationIds) {
      const res = await prisma.candidateApplication.updateMany({
        where: { id, jobId: { in: record.jobIds } },
        data: { jobId: null }
      });
      unlinked += res.count;
    }
    for (const jobId of record.jobIds) {
      // Never delete a job that has picked up anything since — an application
      // somebody linked by hand, an offer, a requirement. Leave it and say so.
      const left = await prisma.candidateApplication.count({ where: { jobId } });
      if (left > 0) {
        console.log(`KEPT job ${jobId}: ${left} applications still point at it.`);
        continue;
      }
      await prisma.job.delete({ where: { id: jobId } });
      deleted += 1;
    }
  }
  console.log(`Unlinked ${unlinked} applications and deleted ${deleted} jobs.`);
  writeFileSync(UNDO, JSON.stringify([], null, 2));
}

async function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (process.argv.includes("--undo")) return undo();
  const apply = process.argv.includes("--apply");

  const existing = await prisma.job.findMany({
    where: { status: { not: "MERGED" } },
    select: { id: true, title: true, normalizedTitle: true }
  });
  const byNormal = new Map(existing.map((j) => [j.normalizedTitle ?? normalizeTitle(j.title), j]));

  const record: Undo = { at: new Date().toISOString(), jobIds: [], applicationIds: [] };
  let wouldCreate = 0;
  let wouldLink = 0;

  for (const spec of CREATE) {
    const rows = await prisma.candidateApplication.findMany({
      where: { jobId: null, historicalJobTitle: spec.title, sourceApplicationId: { not: null } },
      select: { id: true, appliedAt: true }
    });
    const clash = byNormal.get(normalizeTitle(spec.title));
    if (clash) {
      console.log(`SKIP  "${spec.title}" — a job called "${clash.title}" already exists. ${rows.length} rows left alone.`);
      continue;
    }
    if (!rows.length) {
      console.log(`SKIP  "${spec.title}" — no unlinked applications carry that title any more.`);
      continue;
    }

    const dates = rows.map((r) => r.appliedAt).filter((d): d is Date => Boolean(d));
    const openedDate = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : new Date();
    const pilot = isPilotTitle(spec.title);
    const aircraft = extractAircraftTypes(spec.title);
    wouldCreate += 1;
    wouldLink += rows.length;
    console.log(
      `${apply ? "CREATE" : "would create"}  ${spec.title}\n        ${rows.length} applications | ${pilot ? "pilot" : "support"} | opened ${openedDate.toISOString().slice(0, 10)} | RETIRED`
    );
    if (!apply) continue;

    const job = await prisma.job.create({
      data: {
        title: spec.title,
        normalizedTitle: normalizeTitle(spec.title),
        department: spec.department,
        city: spec.city,
        state: spec.state,
        status: "RETIRED",
        // Says where the row came from, the way the app's own New job button does.
        source: "Created from Paycom applications",
        openedDate,
        isPilotRole: pilot,
        isPilotLeadershipRole: /\b(chief pilot|assistant chief pilot)\b/i.test(spec.title),
        pilotSeat: pilot ? detectSeat(spec.title) : null,
        aircraftTypesJson: aircraft.length ? JSON.stringify(aircraft) : null,
        roleCategory: pilot ? "Pilot" : spec.department,
        baseLocation: [spec.city, spec.state].filter(Boolean).join(", ") || null
      },
      select: { id: true }
    });
    record.jobIds.push(job.id);
    for (const r of rows) {
      const res = await prisma.candidateApplication.updateMany({ where: { id: r.id, jobId: null }, data: { jobId: job.id } });
      if (res.count) record.applicationIds.push(r.id);
    }
    // Written as it goes, so an interrupted run is still fully reversible.
    writeFileSync(UNDO, JSON.stringify([...(existsSync(UNDO) ? (JSON.parse(readFileSync(UNDO, "utf8")) as Undo[]) : []).filter((r) => r.at !== record.at), record], null, 2));
  }

  if (!apply) {
    console.log(`\nDRY RUN — would create ${wouldCreate} jobs and link ${wouldLink} applications. Pass --apply.`);
    return;
  }
  console.log(`\nAPPLIED — created ${record.jobIds.length} jobs, linked ${record.applicationIds.length} applications. Undo: npx tsx scripts/paycom-missing-jobs.ts --undo`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
