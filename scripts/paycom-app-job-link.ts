/**
 * Link the Paycom-imported applications to their jobs, where the title names ONE job.
 *
 *   npx tsx scripts/paycom-app-job-link.ts                     DRY RUN — writes the review file only
 *   npx tsx scripts/paycom-app-job-link.ts --apply --limit 50  link the first 50 (a small batch first)
 *   npx tsx scripts/paycom-app-job-link.ts --apply             link everything the review lists
 *   npx tsx scripts/paycom-app-job-link.ts --undo              unlink everything this script linked
 *   add --include-turned-down to also put REJECTED applicants on OPEN jobs (off by default)
 *
 *   npx tsx scripts/paycom-app-job-link.ts --combine                    DRY RUN of the combine case
 *   npx tsx scripts/paycom-app-job-link.ts --combine --apply --limit 10 combine a first few
 *   npx tsx scripts/paycom-app-job-link.ts --undo-combine               put every combine back
 *
 * THE COMBINE CASE (--combine, his instruction 2026-09-23: "combine all 183 for me,
 * with an undo record"). A person who already has a hand-made row on the very job
 * their Paycom title names is skipped by an ordinary run — linking would leave two
 * rows for one application. --combine folds the two into the imported row through
 * lib/candidates/combine-applications.ts, the same function the profile page's
 * combine answer calls, so the bulk run and the button cannot disagree about what
 * survives. Each one is written to that person's activity log, and the whole row
 * that disappears goes into combine-undo.json first.
 *
 * WHY. The Sep 10 2026 hiring-metrics import left 8,304 applications with a
 * Paycom posting title and no job (see lib/jobs/paycom-title-match.ts). Feedback
 * cmtynseh3 (Sep 12): "it should do a better job autolinking the correct jobs."
 * The profile page now links one application at a time; this is the bulk version.
 *
 * WHAT IT WILL AND WILL NOT DO
 *   - Links ONLY where the matcher is confident: the title, with the ad copy
 *     removed, is the title of exactly one job. Fleet-seat and similar-title
 *     matches are a person's call and are left for the profile page.
 *   - Skips any application whose candidate already has a row for that job made
 *     in the app — linking would make a second row for one application, and
 *     combining the two is a per-person decision the profile page asks about.
 *   - Changes one column, CandidateApplication.jobId, from null to a job id.
 *     Nothing is created or deleted. --undo puts every row it changed back to null.
 *
 * OPEN JOBS ONLY GET PEOPLE WHO WERE NOT TURNED DOWN, unless --include-turned-down
 * is passed. The first dry run (2026-09-22) showed why: linking everything would
 * have put 911 past rejections onto the applicant lists of seven jobs being
 * worked right now, 351 of them on the open G450 & GV Captain job alone. A retired
 * job is history, so everything that belongs there goes there.
 *
 * READ THE REVIEW FILE FIRST (scripts/paycom-app-job-link/review.md). Linking
 * puts these people on each job's applicant list — for an OPEN job, that is the
 * list somebody is screening from today. The review says, per job, how many
 * would be added and how many of them were rejected, so that is visible before
 * anything moves.
 *
 * Shared, live database: dry run first, a small --limit batch, check it on a
 * profile, then the rest. The undo record is appended as it goes, so an
 * interrupted run is still reversible.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { confidentJobForTitle, suggestJobsForTitle, type MatchableJob } from "../lib/jobs/paycom-title-match";
import { combineIntoImported, isCombineRefusal, undoCombine, type CombineUndo } from "../lib/candidates/combine-applications";
import { logActivity } from "../lib/activity/logger";

const OUT_DIR = path.join("scripts", "paycom-app-job-link");
const REVIEW = path.join(OUT_DIR, "review.md");
const UNDO = path.join(OUT_DIR, "undo.json");
const COMBINE_UNDO = path.join(OUT_DIR, "combine-undo.json");

type UndoRecord = { linkedAt: string; rows: Array<{ applicationId: string; jobId: string }> };

/**
 * Paycom title -> the EXACT job title it means, answered by a person.
 *
 * The matcher deliberately refuses these: a renamed role (SkyOps Flight
 * Coordinator is the Flight Coordinator job), a posting carrying its bonus or
 * base in the title, a typo, or a name that drops a qualifier the job keeps
 * ("Home-Based"). Guessing at any of those is how somebody lands on the wrong
 * job's applicant list, so they wait for an answer instead — these are his, on
 * 2026-09-22, when he was shown the list and said link them.
 *
 * A mapping is only used when the title on the right matches EXACTLY ONE job
 * that has not been merged away. If it matches none or several, the row is
 * reported and left alone rather than linked to a guess — the whole point of
 * this map is that a person chose the target.
 */
const ALIASES: Record<string, string> = {
  "SkyOps Flight Coordinator": "Flight Coordinator",
  "Gulfstream G450 & GV First Officer": "Gulfstream G450 & GV First Officer (Home-Based)",
  "G450 & GV First Officer (Home-Based) $15k Sign-on bonus!": "Gulfstream G450 & GV First Officer (Home-Based)",
  "Gulfstream G450 & GV Captain": "Gulfstream G450 & GV Captain (Home-Based)",
  "Fleet Aircraft Maintenance Technician (AMT) SLC - $5k sign on bonus!": "Aircraft Maintenance Technician",
  "Fleet Aircraft Maintenance Technician (AMT) SLC": "Aircraft Maintenance Technician",
  "Aircraft Detailing & Presentation Specialis": "Aircraft Detailing & Presentation Specialist",
  "Pilatus PC-12 First Officer": "PC-12 First Officer",

  // --- His answers to the full list of 55 titles, 2026-09-22. ---
  // He went through every one; these are the ones he said to link, and where he
  // said a title means a DIFFERENT job than it reads like, that is his call and
  // not something to "correct" later: a CJ / CE-525 posting can be the CJ3+
  // seat, and the Customer Service postings are the part-time role.
  "Customer Service Rep": "Customer Service Representative | Part-Time",
  "Customer Service Representative (Aviation)": "Customer Service Representative | Part-Time",
  "Customer Service Representative (Aviation) Part-Time": "Customer Service Representative | Part-Time",
  "FBO Customer Service & Front Office Manager (Aviation)": "Customer Service Supervisor",
  "CE-525 (CJ2) Captain": "CJ2 Captain",
  "Citation CE-525 Captain": "CJ2 Captain",
  "Citation CE-525 First Officer": "Citation CJ2 First Officer",
  "CE-525 First Officer": "Citation CJ2 First Officer",
  "Pilot CJ2 SIC": "Citation CJ2 First Officer",
  "Citation CJ Captain CE-525 ($140k-$160k) Utah": "CJ3+ Captain",
  "Single-Pilot Jet Captain | Part 91 | SLC, UT ($160k - $180k)": "CJ3+ Captain",
  "CE-525 Captain | Utah | $140K-$160K + up to $20K Sign-On Bonus!": "CJ3+ Captain",
  "Aircraft Maintenance Technician (AMT) $5,000 sign-on bonus!": "Aircraft Maintenance Technician",
  "Gulfstream G450 & GV Captain (Home-Based)": "Gulfstream G450 & GV Captain (Home-Based)",
  "Gulfstream G450 & GV Captain (Home Based)": "Gulfstream G450 & GV Captain (Home-Based)",
  "Gulfstream G450 & GV First Officer (Home-Based)": "Gulfstream G450 & GV First Officer (Home-Based)",
  "Pilatus PC-12 Captain": "Pilatus PC-12 Captain",
  "Gulfstream G200 First Officer": "Gulfstream G200 First Officer",
  "Gulfstream G200 Captain (Plus a $20k sign-on bonus!)": "Gulfstream G200 Captain",
  "Citation 560XL Captain": "Citation 560XL Captain",
  "Citation 560XLS+ Captain": "Citation 560XLS+ Captain",
  "Challenger 350 First Officer ($130k) - UT": "Challenger 350 First Officer",
  "Phenom 100 First Officer - SLC": "Phenom 100 First Officer",
  "Phenom 100 Captain ($150k-$160k) SLC": "Phenom 100 Captain",
  "Legacy 650 Co-Captain": "Legacy 650 Captain",
  "Legacy 650 Lead Captain": "Legacy 650 Captain",
  "G450 Lead Cabin Attendant": "Lead Corporate Cabin Attendant",
  "Aircraft Maintenance Apprentice": "Aircraft Maintenance Apprentice",
  "Senior Gulfstream Technician (AMT)": "Senior Gulfstream Technician",
  "Sr. Staff Accountant": "Sr. Staff Accountant",
  "Base Support": "Ogden Base Support",
  // He answered "create this job" for BOTH of these, and they are one seat. The
  // job is created once under the fuller title (scripts/paycom-missing-jobs.ts)
  // and the short form points at it. He confirmed "keep one job" on 2026-09-23.
  "PC-12 NG Captain": "Pilatus PC-12 NG Captain",

  // --- His answers of 2026-09-23, given with the application dates in front of him. ---
  // The Georgia posting ran Jul 20 - Sep 2; the Georgia CJ job was created in the
  // app on Aug 28, mid-posting, so it is the job these people applied for.
  "Single-Pilot Jet Captain | Part 91 | Georgia ($160k - $180k)": "CJ Captain (Part 91, Georgia)",
  // Both fall in the gap between CJ2 Captain's applicants (to Feb 8) and CJ3+
  // Captain's (from Apr 8); he put both on CJ3+.
  "Pilot CJ PIC": "CJ3+ Captain",
  "Citation CE-525 CJ Captain": "CJ3+ Captain",
  // "Make all of the Line Service Technician jobs one job" - scripts/paycom-lst-merge.ts
  // folded | DVO into | OGD and renamed it, with the bases as its location, so
  // every technician posting goes to the one job whatever base it was for.
  "Line Service Technician (Aviation)": "Line Service Technician",
  "Line Service Technician": "Line Service Technician",
  "Line Service Technician - Part Time": "Line Service Technician"
};

/** A value that may contain a pipe ("Praetor 600 First Officer | OGD, UT") inside a Markdown table cell. */
function cell(text: string): string {
  return text.replace(/\|/g, "\\|");
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function readUndo(): UndoRecord[] {
  if (!existsSync(UNDO)) return [];
  return JSON.parse(readFileSync(UNDO, "utf8")) as UndoRecord[];
}

async function undo() {
  const records = readUndo();
  const rows = records.flatMap((r) => r.rows);
  if (!rows.length) {
    console.log("Nothing recorded — nothing to undo.");
    return;
  }
  let reverted = 0;
  for (const row of rows) {
    // Only rows still pointing at the job this script set: anything changed since
    // by a person is theirs, and is left alone.
    const res = await prisma.candidateApplication.updateMany({
      where: { id: row.applicationId, jobId: row.jobId },
      data: { jobId: null }
    });
    reverted += res.count;
  }
  writeFileSync(UNDO, JSON.stringify([], null, 2));
  console.log(`Unlinked ${reverted} of ${rows.length} recorded rows (the rest had been changed since, and were left alone).`);
}

function readCombineUndo(): CombineUndo[] {
  if (!existsSync(COMBINE_UNDO)) return [];
  return JSON.parse(readFileSync(COMBINE_UNDO, "utf8")) as CombineUndo[];
}

async function undoCombines() {
  const records = readCombineUndo();
  if (!records.length) {
    console.log("No combines recorded — nothing to undo.");
    return;
  }
  let restored = 0;
  const notes: string[] = [];
  // Newest first, so a person combined twice unwinds in the order it was built.
  for (const r of [...records].reverse()) {
    const res = await undoCombine(r);
    if (res.restored) restored += 1;
    else if (res.note) notes.push(res.note);
  }
  writeFileSync(COMBINE_UNDO, JSON.stringify([], null, 2));
  console.log(`Split ${restored} of ${records.length} combines back into two rows.`);
  for (const n of notes) console.log(`  left alone: ${n}`);
}

async function main() {
  if (process.argv.includes("--undo")) return undo();
  if (process.argv.includes("--undo-combine")) return undoCombines();
  const apply = process.argv.includes("--apply");
  const combineMode = process.argv.includes("--combine");
  const includeTurnedDown = process.argv.includes("--include-turned-down");
  const limit = Number(argValue("--limit") ?? "0") || Infinity;

  const jobs: MatchableJob[] = await prisma.job.findMany({
    select: { id: true, title: true, status: true, mergedIntoJobId: true, city: true, state: true }
  });
  const jobById = new Map(jobs.map((j) => [j.id, j]));
  const apps = await prisma.candidateApplication.findMany({
    where: { jobId: null, origin: "PAYCOM", historicalJobTitle: { not: null }, sourceApplicationId: { not: null } },
    select: { id: true, candidateId: true, historicalJobTitle: true, status: true, stage: true, appliedAt: true, offerStatus: true }
  });
  // Hand-made rows (no Paycom id) per candidate, by job — the combine case.
  // Oldest first, matching the profile page's own choice when there are several.
  const handMade = await prisma.candidateApplication.findMany({
    where: { jobId: { not: null }, sourceApplicationId: null, origin: { not: "JAZZ" } },
    select: { id: true, candidateId: true, jobId: true, offerStatus: true },
    orderBy: { createdAt: "asc" }
  });
  const handMadeKey = new Set(handMade.map((h) => `${h.candidateId}:${h.jobId}`));
  const handMadeFirst = new Map<string, { id: string; offerStatus: string }>();
  for (const h of handMade) {
    const k = `${h.candidateId}:${h.jobId}`;
    if (!handMadeFirst.has(k)) handMadeFirst.set(k, { id: h.id, offerStatus: h.offerStatus });
  }
  type CombinePlan = { importedId: string; handMadeId: string; jobId: string; candidateId: string; title: string; bothOffers: boolean };
  const combinePlan: CombinePlan[] = [];
  const currentCounts = new Map(
    (await prisma.candidateApplication.groupBy({ by: ["jobId"], where: { jobId: { not: null } }, _count: { _all: true } })).map(
      (g) => [g.jobId as string, g._count._all]
    )
  );

  const byTitle = new Map<string, typeof apps>();
  for (const a of apps) {
    const t = a.historicalJobTitle as string;
    if (!byTitle.has(t)) byTitle.set(t, []);
    byTitle.get(t)!.push(a);
  }

  type Plan = { applicationId: string; jobId: string; title: string; status: string | null; stage: string | null; appliedAt: Date | null };
  const plan: Plan[] = [];
  const skippedCombine: Array<{ title: string; count: number }> = [];
  const titleLines: string[] = [];
  let heldFromOpen = 0;
  const turnedDown = (status: string | null, stage: string | null) =>
    /denied|reject|knocked|not selected|incomplete/i.test(`${status ?? ""} ${stage ?? ""}`);
  const unsure: string[] = [];

  const aliasMisses: string[] = [];
  /** The job an alias names, but only when it names exactly one live job. */
  const aliasTarget = (title: string): MatchableJob | null => {
    const wanted = ALIASES[title];
    if (!wanted) return null;
    const hits = jobs.filter((j) => !j.mergedIntoJobId && j.status !== "MERGED" && j.title.trim().toLowerCase() === wanted.trim().toLowerCase());
    if (hits.length === 1) return hits[0];
    aliasMisses.push(`| ${cell(title)} | ${cell(wanted)} | ${hits.length === 0 ? "no job by that name" : `${hits.length} jobs share that name`} |`);
    return null;
  };

  for (const [title, rows] of [...byTitle.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const alias = aliasTarget(title);
    const target = alias
      ? { jobId: alias.id, title: alias.title, status: alias.status, location: null, tier: "exact" as const, confident: true }
      : confidentJobForTitle(title, jobs);
    if (!target) {
      const options = suggestJobsForTitle(title, jobs).map((s) => `${s.title} (${s.status.toLowerCase()}, ${s.tier})`);
      unsure.push(`| ${rows.length} | ${cell(title)} | ${options.length ? cell(options.join("; ")) : "no job looks like it"} |`);
      continue;
    }
    let combine = 0;
    let held = 0;
    for (const r of rows) {
      if (handMadeKey.has(`${r.candidateId}:${target.jobId}`)) {
        combine += 1;
        const hm = handMadeFirst.get(`${r.candidateId}:${target.jobId}`)!;
        combinePlan.push({
          importedId: r.id,
          handMadeId: hm.id,
          jobId: target.jobId,
          candidateId: r.candidateId,
          title,
          bothOffers: (r.offerStatus ?? "NONE") !== "NONE" && hm.offerStatus !== "NONE"
        });
        continue;
      }
      if (target.status === "OPEN" && !includeTurnedDown && turnedDown(r.status, r.stage)) {
        heldFromOpen += 1;
        held += 1;
        continue;
      }
      plan.push({ applicationId: r.id, jobId: target.jobId, title, status: r.status, stage: r.stage, appliedAt: r.appliedAt });
    }
    if (combine) skippedCombine.push({ title, count: combine });
    // The number LINKED, after both skips — the title total alone overstated the
    // open jobs by exactly the turned-down rows that are held back.
    titleLines.push(
      `| ${rows.length - combine - held} of ${rows.length} | ${cell(title)} | ${cell(target.title)} | ${target.status === "OPEN" ? "**OPEN**" : target.status.toLowerCase()} |`
    );
  }

  // Per job: what it has now, and what linking would add — with how many of the
  // additions were turned down, which is what decides whether an OPEN job's list
  // gets noisier.
  const perJob = new Map<string, Plan[]>();
  for (const p of plan) {
    if (!perJob.has(p.jobId)) perJob.set(p.jobId, []);
    perJob.get(p.jobId)!.push(p);
  }
  const rejected = (p: Plan) => turnedDown(p.status, p.stage);
  const jobLines = [...perJob.entries()]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([jobId, rows]) => {
      const j = jobById.get(jobId)!;
      const years = [...new Set(rows.map((r) => r.appliedAt?.getUTCFullYear()).filter(Boolean))].sort().join(", ");
      return `| ${cell(j.title)} | ${j.status === "OPEN" ? "**OPEN**" : j.status.toLowerCase()} | ${currentCounts.get(jobId) ?? 0} | +${rows.length} | ${rows.filter(rejected).length} | ${years} |`;
    });

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const review = [
    `# Paycom applications -> jobs: review (${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC)`,
    ``,
    `Unlinked Paycom applications read: **${apps.length}**. Would link: **${plan.length}**, to **${perJob.size}** jobs.`,
    `Left for a person: **${apps.length - plan.length}** — titles with no single matching job, and ${skippedCombine.reduce((n, s) => n + s.count, 0)} rows whose person already has a hand-made row for the job (combine those on the profile).`,
    includeTurnedDown
      ? `Mode: --include-turned-down — rejected applicants ARE linked to open jobs.`
      : `Mode: default — ${heldFromOpen} turned-down applicants were NOT put on OPEN jobs (their titles still show on their own profiles). Pass --include-turned-down to link them too.`,
    ``,
    `## What each job would gain`,
    ``,
    `An OPEN job's applicant list is what somebody screens from today — check those rows first.`,
    ``,
    `| Job | Status | Rows now | Would add | ...of which turned down | Applied in |`,
    `|---|---|---|---|---|---|`,
    ...jobLines,
    ``,
    `## Title -> job`,
    ``,
    `| Linked | Paycom title | Job | Status |`,
    `|---|---|---|---|`,
    ...titleLines,
    ``,
    `## Not linked — a person's choice`,
    ``,
    `| Rows | Paycom title | What it might be |`,
    `|---|---|---|`,
    ...unsure,
    ``,
    // A mapping somebody wrote by hand that no longer finds its job is worth
    // shouting about: silence would read as "those rows had nothing to link to".
    ...(aliasMisses.length
      ? [
          `## Hand-written mappings that did NOT find their job`,
          ``,
          `| Paycom title | Was told to link to | What happened |`,
          `|---|---|---|`,
          ...aliasMisses,
          ``
        ]
      : [])
  ].join("\n");
  writeFileSync(REVIEW, review);
  console.log(`Review written: ${REVIEW}`);
  console.log(`Would link ${plan.length} of ${apps.length} to ${perJob.size} jobs.`);

  // ---- The combine case, run on its own so a link run and a combine run never mix.
  if (combineMode) {
    const blocked = combinePlan.filter((c) => c.bothOffers);
    const doable = combinePlan.filter((c) => !c.bothOffers);
    console.log(`\nCOMBINE: ${combinePlan.length} rows whose person already holds a hand-made row for the job.`);
    console.log(`  ${doable.length} can be combined; ${blocked.length} are refused because BOTH rows carry an offer.`);
    for (const b of blocked) console.log(`    refused: ${b.title} (application ${b.importedId})`);
    if (!apply) {
      console.log("DRY RUN — nothing combined. Pass --apply, with --limit for a first few.");
      return;
    }
    const records = readCombineUndo();
    const consumed = new Set<string>();
    let combined = 0;
    let linkedInstead = 0;
    const refused: string[] = [];
    for (const c of doable.slice(0, limit)) {
      // The same hand-made row can be the partner of two imported rows (one person,
      // one title, applied twice). The first combine uses it up; the second has
      // nothing left to fold in, so it is an ordinary link.
      if (consumed.has(c.handMadeId)) {
        const res = await prisma.candidateApplication.updateMany({ where: { id: c.importedId, jobId: null }, data: { jobId: c.jobId } });
        if (res.count) {
          linkedInstead += 1;
          const linkRecords = readUndo();
          linkRecords.push({ linkedAt: new Date().toISOString(), rows: [{ applicationId: c.importedId, jobId: c.jobId }] });
          writeFileSync(UNDO, JSON.stringify(linkRecords, null, 2));
        }
        continue;
      }
      const outcome = await combineIntoImported(c.importedId, c.handMadeId, c.jobId);
      if (isCombineRefusal(outcome)) {
        refused.push(`${c.title} (${c.importedId}): ${outcome.message}`);
        continue;
      }
      consumed.add(c.handMadeId);
      records.push(outcome.undo);
      // Written after every combine: an interrupted run must still be fully reversible.
      writeFileSync(COMBINE_UNDO, JSON.stringify(records, null, 2));
      combined += 1;
      await logActivity({
        activityType: "CANDIDATE_EDITED",
        description:
          `Combined the Paycom application "${c.title}" with the row made in the app for the same job` +
          `${outcome.tookOffer ? ", keeping its offer" : ""} (bulk run, 2026-09-23)`,
        entityType: "Candidate",
        entityId: c.candidateId,
        metadata: {
          applicationId: c.importedId,
          jobId: c.jobId,
          removedApplicationId: outcome.removed.id,
          removedSource: outcome.removed.source,
          removedStatus: outcome.removed.status,
          removedStage: outcome.removed.stage,
          removedAppliedAt: outcome.removed.appliedAt?.toISOString() ?? null,
          removedOfferStatus: outcome.removed.offerStatus,
          bulk: true
        }
      });
    }
    console.log(`COMBINED ${combined}; linked ${linkedInstead} instead (partner already used); refused ${refused.length}.`);
    for (const r of refused) console.log(`  refused: ${r}`);
    console.log(`Undo: npx tsx scripts/paycom-app-job-link.ts --undo-combine   (record: ${COMBINE_UNDO})`);
    return;
  }

  if (!apply) {
    console.log("DRY RUN — nothing written. Read the review, then --apply --limit 50 for a first batch.");
    return;
  }

  const batch = plan.slice(0, limit);
  const record: UndoRecord = { linkedAt: new Date().toISOString(), rows: [] };
  const records = readUndo();
  records.push(record);
  let linked = 0;
  for (const p of batch) {
    // Still unlinked? A person may have linked it by hand since the plan was made.
    const res = await prisma.candidateApplication.updateMany({ where: { id: p.applicationId, jobId: null }, data: { jobId: p.jobId } });
    if (res.count) {
      record.rows.push({ applicationId: p.applicationId, jobId: p.jobId });
      linked += 1;
      // Written as it goes, so an interrupted run is still fully reversible.
      if (linked % 100 === 0) writeFileSync(UNDO, JSON.stringify(records, null, 2));
    }
  }
  writeFileSync(UNDO, JSON.stringify(records, null, 2));
  console.log(`LINKED ${linked} of ${batch.length} planned in this batch. Undo: npx tsx scripts/paycom-app-job-link.ts --undo`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
