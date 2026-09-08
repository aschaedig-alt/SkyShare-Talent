/**
 * Give every HIRED candidate an application on the right job, and close it out.
 *
 * WHY. 63 live candidates sit on stage "Hired". 47 have no application at all and
 * 13 have one still reading "New", so the Hired tile — which counts application
 * outcomes — shows a fraction of the people actually hired. 62 of the 63 have a
 * NewHire row, so the stage is right and it is the application record that was
 * never completed.
 *
 * THIS SCRIPT WRITES NOTHING BY DEFAULT. It emits a REVIEW FILE for a person to
 * correct, because the matching cannot be trusted on its own: a NewHire position
 * reads "560XL Captain" where the job is titled "Citation 560XL Captain", so only
 * 6 of 47 match by title and the rest need inference. Attaching the wrong job to
 * somebody's permanent record is worse than leaving it empty, so the proposal is
 * reviewed before it is applied.
 *
 * HOW A MATCH IS PROPOSED, widest confidence first:
 *   exact     the normalised job title equals the normalised position
 *   aircraft  same canonical aircraft type AND same seat (Captain / First Officer),
 *             read through lib/candidates/aircraft-types.ts so "560XL",
 *             "Citation 560XL" and "CE-560XL" are one thing
 *   tokens    every significant word of the position appears in the job title
 *   none      nothing proposed — the row is left for a person to fill in
 * A MERGED job is never proposed; it resolves to its surviving job first, because
 * attaching somebody to a row that has been merged away buries them.
 *
 * USAGE
 *   npx tsx scripts/hired-application-backfill.ts
 *       Writes scripts/hired-application-backfill/REVIEW.csv and REVIEW.md.
 *       Reads only. Correct the jobTitle column in the CSV by hand.
 *   npx tsx scripts/hired-application-backfill.ts --apply
 *       Reads the CORRECTED csv back and applies only rows with a jobId.
 *       Writes an UNDO.json first. Not run yet.
 *   npx tsx scripts/hired-application-backfill.ts --undo
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/client/client";
import { normalizeAircraftType } from "../lib/candidates/aircraft-types";
import { detectSeat, extractAircraftTypes, isPilotTitle } from "../lib/imports/job-import";

// A LOCAL COPY, and worth saying why rather than looking like an oversight.
// normalizeTitle is private to lib/imports/job-import.ts, and app/api/recruiting-jobs
// already keeps its own identical copy for the same reason. Exporting it would
// change a shared file for the sake of a script, so this is the third copy - kept
// character-for-character identical to both, because a job created here has to
// carry the same normalizedTitle the importer would give it or the duplicate
// detection stops seeing it.
const normalizeTitle = (value: string) => value.toLowerCase().replace(/s+/g, " ").trim();

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string })
});

const OUT_DIR = join(process.cwd(), "scripts", "hired-application-backfill");
const CSV = join(OUT_DIR, "REVIEW.csv");
const DECISIONS = join(OUT_DIR, "DECISIONS.csv");
const MD = join(OUT_DIR, "REVIEW.md");
const UNDO = join(OUT_DIR, "UNDO.json");

const apply = process.argv.includes("--apply");
const undo = process.argv.includes("--undo");

const norm = (v: string | null | undefined) =>
  (v ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Captain or First Officer, however it is spelled. Null when the role has no seat. */
function seatOf(text: string): "PIC" | "SIC" | null {
  const t = " " + norm(text) + " ";
  if (/ (captain|pic|cpt) /.test(t)) return "PIC";
  if (/ (first officer|fo|sic|co pilot|copilot) /.test(t)) return "SIC";
  return null;
}

/** The canonical aircraft designator named anywhere in a title, if any. */
function aircraftOf(text: string): string | null {
  // Longest run of words first: "g450 gv" should beat a bare "g450".
  const words = norm(text).split(" ").filter(Boolean);
  for (let len = Math.min(3, words.length); len >= 1; len--) {
    for (let i = 0; i + len <= words.length; i++) {
      const m = normalizeAircraftType(words.slice(i, i + len).join(" "));
      if (m.kind === "type") return m.type;
    }
  }
  return null;
}

const STOP = new Set(["the", "a", "of", "and", "home", "based", "slc", "ut", "utah"]);

type JobRow = { id: string; title: string; status: string; mergedIntoJobId: string | null };

async function buildProposals() {
  const jobs = await prisma.job.findMany({
    select: { id: true, title: true, status: true, mergedIntoJobId: true }
  });
  const byId = new Map(jobs.map((j) => [j.id, j]));
  /** Follow a merge chain to the surviving job. */
  const survivor = (j: JobRow): JobRow => {
    const seen = new Set<string>();
    let cur = j;
    while (cur.mergedIntoJobId && !seen.has(cur.id)) {
      seen.add(cur.id);
      const next = byId.get(cur.mergedIntoJobId);
      if (!next) break;
      cur = next;
    }
    return cur;
  };
  const live = jobs.filter((j) => j.status !== "MERGED");

  const cands = await prisma.candidate.findMany({
    where: { archivedAt: null, status: { not: "MERGED" }, stage: "Hired" },
    select: {
      id: true,
      displayName: true,
      applications: { select: { id: true, status: true, jobId: true, job: { select: { title: true } } } }
    },
    orderBy: { displayName: "asc" }
  });
  const hires = await prisma.newHire.findMany({
    where: { candidateId: { in: cands.map((c) => c.id) } },
    select: { candidateId: true, position: true, department: true }
  });
  const hireBy = new Map(hires.map((h) => [h.candidateId, h]));

  return cands.map((c) => {
    const h = hireBy.get(c.id);
    const position = h?.position ?? "";
    const hasApp = c.applications.length > 0;

    // Someone who already has an application needs no job proposed — but it does
    // need saying WHICH application, and that is not "the most recent".
    //
    // THE DATE IS THE WRONG ANSWER AND THE LIVE DATA PROVES IT. Bryan Weber and
    // Gavin Craner were each hired as a Maintenance APPRENTICE while their newest
    // application is the Technician role; Jerry Harrington was hired as a G200
    // Captain and none of his three applications is a G200 job at all; Nicholas
    // Lembo has two applications filed the same day. Closing out by recency would
    // have written the wrong job onto at least three people and coin-flipped a
    // fourth.
    //
    // So the application is chosen by matching its JOB to the position the person
    // was actually hired into, using the same ladder as everything else here. When
    // nothing matches, or more than one does, NOTHING IS TOUCHED and the row says
    // why — an unclosed application is a small untidiness, the wrong job on
    // somebody's record is not.
    if (hasApp) {
      const pick = (() => {
        const apps = c.applications;
        const exactA = apps.filter((a) => norm(a.job?.title) === norm(position));
        if (exactA.length === 1) return { app: exactA[0], how: "job title equals the position" };
        const air = aircraftOf(position);
        const seat = seatOf(position);
        if (air) {
          const hit = apps.filter((a) => aircraftOf(a.job?.title ?? "") === air && seatOf(a.job?.title ?? "") === seat);
          if (hit.length === 1) return { app: hit[0], how: `matched on ${air}${seat ? " " + seat : ""}` };
        }
        const want = norm(position).split(" ").filter((w) => w && !STOP.has(w));
        const tok = apps.filter((a) => {
          const t = norm(a.job?.title);
          return want.length > 0 && want.every((w) => t.includes(w));
        });
        if (tok.length === 1) return { app: tok[0], how: "every word of the position is in the job title" };
        return null;
      })();

      if (!pick) {
        return {
          action: "skip",
          candidateId: c.id,
          name: c.displayName,
          position,
          department: h?.department ?? "",
          jobId: "",
          jobTitle: "",
          jobStatus: "",
          confidence: "unmatched-existing",
          note: `${c.applications.length} application(s), none clearly for "${position}": ` +
            c.applications.map((a) => `${a.job?.title ?? "?"} = ${a.status ?? "null"}`).join(" | ")
        };
      }

      return {
        action: "close-out",
        candidateId: c.id,
        name: c.displayName,
        position,
        department: h?.department ?? "",
        jobId: pick.app.jobId,
        jobTitle: pick.app.job?.title ?? "",
        jobStatus: "",
        confidence: "existing",
        applicationId: pick.app.id,
        note: `${pick.how}; currently reads "${pick.app.status ?? "null"}"`
      };
    }

    const exact = live.filter((j) => norm(j.title) === norm(position));
    if (exact.length === 1) {
      const j = survivor(exact[0]);
      return {
        action: "create", candidateId: c.id, name: c.displayName, position,
        department: h?.department ?? "", jobId: j.id, jobTitle: j.title,
        jobStatus: j.status, confidence: "exact", note: "job title equals the position"
      };
    }

    const air = aircraftOf(position);
    const seat = seatOf(position);
    if (air) {
      const hits = live.filter((j) => aircraftOf(j.title) === air && seatOf(j.title) === seat);
      if (hits.length === 1) {
        const j = survivor(hits[0]);
        return {
          action: "create", candidateId: c.id, name: c.displayName, position,
          department: h?.department ?? "", jobId: j.id, jobTitle: j.title,
          jobStatus: j.status, confidence: "aircraft",
          note: `${air}${seat ? " " + seat : ""} — CHECK THIS`
        };
      }
      if (hits.length > 1) {
        return {
          action: "create", candidateId: c.id, name: c.displayName, position,
          department: h?.department ?? "", jobId: "", jobTitle: "", jobStatus: "",
          confidence: "ambiguous",
          note: `${air}${seat ? " " + seat : ""} matches ${hits.length} jobs: ${hits.map((x) => x.title).join(" | ")}`
        };
      }
    }

    const want = norm(position).split(" ").filter((w) => w && !STOP.has(w));
    const tok = live.filter((j) => {
      const t = norm(j.title);
      return want.length > 0 && want.every((w) => t.includes(w));
    });
    if (tok.length === 1) {
      const j = survivor(tok[0]);
      return {
        action: "create", candidateId: c.id, name: c.displayName, position,
        department: h?.department ?? "", jobId: j.id, jobTitle: j.title,
        jobStatus: j.status, confidence: "tokens", note: "every word of the position is in the title — CHECK THIS"
      };
    }

    return {
      action: "create", candidateId: c.id, name: c.displayName, position,
      department: h?.department ?? "", jobId: "", jobTitle: "", jobStatus: "",
      confidence: "none",
      note: tok.length > 1 ? `${tok.length} loose matches, none decisive` : "nothing proposed — fill in a job"
    };
  });
}

function csvCell(v: string) {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function review() {
  const rows = await buildProposals();
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const header = ["action", "name", "position", "department", "confidence", "jobId", "jobTitle", "jobStatus", "note", "candidateId"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(header.map((k) => csvCell(String((r as Record<string, unknown>)[k] ?? ""))).join(","));
  }
  writeFileSync(CSV, lines.join("\n") + "\n");

  const tally = new Map<string, number>();
  for (const r of rows) tally.set(r.confidence, (tally.get(r.confidence) ?? 0) + 1);

  const md: string[] = [];
  md.push("# Hired candidates — proposed applications\n");
  md.push("Nothing has been written. Correct the `jobId` / `jobTitle` columns in REVIEW.csv, then run with `--apply`.\n");
  md.push("| confidence | rows | what it means |");
  md.push("|---|---|---|");
  md.push(`| existing | ${tally.get("existing") ?? 0} | already has an application; only needs closing out |`);
  md.push(`| exact | ${tally.get("exact") ?? 0} | the job title equals the position — safe |`);
  md.push(`| aircraft | ${tally.get("aircraft") ?? 0} | same aircraft and seat — **check these** |`);
  md.push(`| tokens | ${tally.get("tokens") ?? 0} | every word of the position appears in the title — **check these** |`);
  md.push(`| ambiguous | ${tally.get("ambiguous") ?? 0} | several jobs fit; nothing proposed |`);
  md.push(`| none | ${tally.get("none") ?? 0} | nothing proposed |`);
  md.push("");
  for (const group of ["exact", "aircraft", "tokens", "ambiguous", "none", "existing"]) {
    const g = rows.filter((r) => r.confidence === group);
    if (!g.length) continue;
    md.push(`\n## ${group} — ${g.length}\n`);
    md.push("| name | position | proposed job | job status | note |");
    md.push("|---|---|---|---|---|");
    for (const r of g) md.push(`| ${r.name} | ${r.position} | ${r.jobTitle || "—"} | ${r.jobStatus || "—"} | ${r.note} |`);
  }
  writeFileSync(MD, md.join("\n") + "\n");

  console.log(`WROTE (nothing was changed in the database):`);
  console.log(`  ${CSV}`);
  console.log(`  ${MD}`);
  console.log();
  for (const [k, v] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(11)} ${v}`);
  }
  console.log(`  ${"TOTAL".padEnd(11)} ${rows.length}`);

  writeDecisions(rows);
}

/**
 * The SHORT file, and the one actually worth filling in.
 *
 * REVIEW.csv has one row per person, which is the wrong shape for the work: the
 * 18 ambiguous rows are four distinct positions, because there are five PC-12
 * Captain jobs and twelve people hired into one of them. Answering "which PC-12
 * Captain job is the real one" once settles twelve people, so the decisions file
 * has ONE ROW PER POSITION and names how many people ride on it.
 *
 * Fill in `chooseJobTitle` — paste one of the options verbatim, or type any other
 * job title, or write SKIP to leave those people alone. --apply resolves the title
 * against the live job list and fans it out.
 */
function writeDecisions(rows: Awaited<ReturnType<typeof buildProposals>>) {
  const needed = rows.filter((r) => r.confidence === "ambiguous" || r.confidence === "none");
  const byPosition = new Map<string, { people: string[]; note: string; confidence: string }>();
  for (const r of needed) {
    const e = byPosition.get(r.position) ?? { people: [], note: r.note, confidence: r.confidence };
    e.people.push(r.name);
    byPosition.set(r.position, e);
  }

  const header = ["position", "peopleCount", "people", "options", "chooseJobTitle"];
  const lines = [header.join(",")];
  const sorted = [...byPosition.entries()].sort((a, b) => b[1].people.length - a[1].people.length);
  for (const [position, e] of sorted) {
    // The options list is already in the note for an ambiguous row; pull it out so
    // the column holds only the titles, ready to copy one into the next column.
    const opts = e.confidence === "ambiguous" ? (e.note.split(" jobs: ")[1] ?? "") : "";
    lines.push(
      [position, String(e.people.length), e.people.join("; "), opts, ""].map(csvCell).join(",")
    );
  }
  // NEVER CLOBBER A FILLED-IN FILE. This overwrote his answers once already, and
  // only got them back because the copy he sent was still in Downloads. A review
  // run regenerates proposals, but DECISIONS.csv is the ONE file a person edits by
  // hand, so if it already carries any answer the fresh proposal goes beside it
  // under a different name and the answered file is left exactly as it is.
  const existingText = existsSync(DECISIONS) ? readFileSync(DECISIONS, "utf8") : "";
  const hasAnswers = existingText
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .some((l) => (l.split(",").pop() ?? "").trim().length > 0);
  const target = hasAnswers ? DECISIONS.replace(/[.]csv$/, ".regenerated.csv") : DECISIONS;
  writeFileSync(target, lines.join("\n") + "\n");
  if (hasAnswers) {
    console.log("\n  DECISIONS.csv already has answers in it and was LEFT ALONE.");
    console.log("  the fresh proposal went to " + target + " instead.");
  }
  console.log(`\n  and the SHORT one, which is the file to fill in:`);
  console.log(`  ${DECISIONS}   ${sorted.length} decisions covering ${needed.length} people`);
}

/** Split one CSV line, honouring double quotes. */
function csvSplit(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/**
 * Apply.
 *
 * REBUILDS THE PROPOSALS FROM THE LIVE DATABASE rather than reading REVIEW.csv
 * back. The review file is a report; the database is the truth, and it has moved
 * once already while this was being written. DECISIONS.csv is then overlaid on top
 * — it is the only file anybody edits, and it holds one row per POSITION, so
 * answering "which PC-12 Captain job" once reaches all twelve people.
 *
 * A decision of SKIP, or an empty choice, leaves those people alone.
 */
async function runApply() {
  if (!existsSync(DECISIONS)) {
    console.log(`No ${DECISIONS} — run without --apply first, then fill it in.`);
    return;
  }

  const jobs = await prisma.job.findMany({ select: { id: true, title: true, status: true } });
  const jobByTitle = new Map(jobs.filter((j) => j.status !== "MERGED").map((j) => [norm(j.title), j]));

  const chosen = new Map<string, { id: string; title: string }>();
  const skipped: string[] = [];
  const unresolved: { position: string; title: string }[] = [];
  const lines = readFileSync(DECISIONS, "utf8").trim().split(/\r?\n/);
  const head = csvSplit(lines[0]);
  const iPos = head.indexOf("position");
  const iChoice = head.indexOf("chooseJobTitle");
  for (const line of lines.slice(1)) {
    const cells = csvSplit(line);
    const position = (cells[iPos] ?? "").trim();
    const choice = (cells[iChoice] ?? "").trim();
    if (!position || !choice) continue;
    if (/^skip$/i.test(choice)) { skipped.push(position); continue; }
    const job = jobByTitle.get(norm(choice));
    if (!job) { unresolved.push({ position, title: choice }); continue; }
    chosen.set(position, { id: job.id, title: job.title });
  }

  console.log(`decisions read: ${chosen.size} resolved, ${skipped.length} skipped, ${unresolved.length} needing a new job`);

  // A TITLE WITH NO JOB IS CREATED, not refused — asked for directly on 2026-09-08:
  // "can we create a position for those missing that i added the job title to?".
  // Seven of the thirteen roles have never had a posted req (Legacy 650 Captain,
  // Phenom 100, Maintenance Planner, Base Manager and so on), so refusing would
  // leave eight already-hired people with no application for want of a row.
  //
  // CREATED AS RETIRED, deliberately. Every job these people resolve to is RETIRED,
  // and these are historical records of somebody already hired, not vacancies —
  // creating them OPEN would put seven phantom openings on the jobs board.
  //
  // The derived fields are filled exactly as app/api/recruiting-jobs does it, using
  // the same helpers, so nothing downstream can tell a backfilled role from one
  // created in the app.
  const createdJobs: { id: string; title: string }[] = [];
  for (const u of unresolved) {
    const title = u.title;
    const pilot = isPilotTitle(title);
    const aircraft = extractAircraftTypes(title);
    const job = await prisma.job.create({
      data: {
        title,
        normalizedTitle: normalizeTitle(title),
        status: "RETIRED",
        source: "Hired backfill",
        openedDate: null,
        isPilotRole: pilot,
        isPilotLeadershipRole: /\b(chief pilot|assistant chief pilot)\b/i.test(title),
        pilotSeat: pilot ? detectSeat(title) : null,
        aircraftTypesJson: aircraft.length ? JSON.stringify(aircraft) : null,
        roleCategory: pilot ? "Pilot" : null
      },
      select: { id: true, title: true }
    });
    createdJobs.push(job);
    chosen.set(u.position, { id: job.id, title: job.title });
    console.log(`  CREATED job "${job.title}" [RETIRED] for ${u.position}`);
  }

  const rows = await buildProposals();
  const work = rows
    .map((r) => {
      if (r.action === "close-out") return r;
      if (r.jobId) return r;
      const pick = chosen.get(r.position);
      return pick ? { ...r, jobId: pick.id, jobTitle: pick.title } : r;
    })
    .filter((r) => r.action !== "skip")
    .filter((r) => r.action === "close-out" || r.jobId);

  const creates = work.filter((r) => r.action === "create");
  const closes = work.filter((r) => r.action === "close-out");
  console.log(`\nabout to create ${creates.length} applications and close out ${closes.length}.`);
  console.log(`leaving alone: ${rows.length - work.length} (skipped or still undecided)`);

  // Undo record BEFORE anything is written, so a crash mid-run is still reversible.
  const undoRows = closes.map((r) => ({
    candidateId: r.candidateId,
    applicationId: r.jobId ? null : null,
    previousStatus: null as string | null
  }));
  // The proposal already decided WHICH application, by job rather than by date.
  // Re-looking it up here by candidate would throw that away and reintroduce the
  // recency bug the proposal exists to avoid.
  const withPrev: { candidateId: string; applicationId: string | null; previousStatus: string | null }[] = [];
  for (const r of closes) {
    const id = (r as { applicationId?: string }).applicationId;
    if (!id) continue;
    const app = await prisma.candidateApplication.findUnique({ where: { id }, select: { id: true, status: true } });
    if (app) withPrev.push({ candidateId: r.candidateId, applicationId: app.id, previousStatus: app.status });
  }
  void undoRows;
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(
    UNDO,
    JSON.stringify(
      {
        writtenAt: new Date().toISOString(),
        closed: withPrev,
        createdFor: creates.map((c) => c.candidateId),
        createdJobIds: createdJobs.map((j) => j.id)
      },
      null,
      2
    )
  );
  console.log(`undo record written first: ${UNDO}`);

  let created = 0;
  for (const r of creates) {
    await prisma.candidateApplication.create({
      data: {
        candidateId: r.candidateId,
        jobId: r.jobId,
        status: "Hired",
        stage: "Hired",
        source: "Hired backfill",
        appliedAt: new Date()
      }
    });
    created++;
  }
  let closed = 0;
  for (const r of withPrev) {
    await prisma.candidateApplication.update({ where: { id: r.applicationId as string }, data: { status: "Hired" } });
    closed++;
  }
  console.log(`created ${created}, closed out ${closed}.`);

  const check = await prisma.candidateApplication.count({ where: { source: "Hired backfill" } });
  console.log(`read back: ${check} applications now carry source "Hired backfill".`);
}

async function runUndo() {
  if (!existsSync(UNDO)) { console.log(`No undo record at ${UNDO}.`); return; }
  const rec = JSON.parse(readFileSync(UNDO, "utf8")) as {
    closed: { applicationId: string | null; previousStatus: string | null }[];
    createdFor: string[];
    createdJobIds?: string[];
  };
  let restored = 0;
  for (const r of rec.closed ?? []) {
    if (!r.applicationId) continue;
    await prisma.candidateApplication.update({
      where: { id: r.applicationId },
      data: { status: r.previousStatus ?? "New" }
    });
    restored++;
  }
  // Removed by SOURCE as well as by candidate, so an application somebody created
  // by hand in the meantime is never swept up.
  const del = await prisma.candidateApplication.deleteMany({
    where: { candidateId: { in: rec.createdFor ?? [] }, source: "Hired backfill" }
  });

  // Jobs created by the backfill go too — but ONLY if nothing else has attached
  // itself to them since. A job somebody has started using is no longer ours to
  // delete, and leaving an unused RETIRED row behind is harmless.
  let removedJobs = 0;
  const kept: string[] = [];
  for (const id of rec.createdJobIds ?? []) {
    const n = await prisma.candidateApplication.count({ where: { jobId: id } });
    if (n > 0) { kept.push(id); continue; }
    await prisma.job.delete({ where: { id } });
    removedJobs++;
  }
  console.log(`restored ${restored} statuses, removed ${del.count} backfilled applications, deleted ${removedJobs} backfilled jobs.`);
  if (kept.length) console.log(`  kept ${kept.length} created job(s) that other applications now point at.`);
}

async function main() {
  if (undo) await runUndo();
  else if (apply) await runApply();
  else await review();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
