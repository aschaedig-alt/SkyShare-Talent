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

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string })
});

const OUT_DIR = join(process.cwd(), "scripts", "hired-application-backfill");
const CSV = join(OUT_DIR, "REVIEW.csv");
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

    // Someone who already has an application needs no job proposed — only a close-out.
    if (hasApp) {
      const app = c.applications[0];
      return {
        action: "close-out",
        candidateId: c.id,
        name: c.displayName,
        position,
        department: h?.department ?? "",
        jobId: app.jobId,
        jobTitle: app.job?.title ?? "",
        jobStatus: "",
        confidence: "existing",
        note: `application currently reads "${app.status}"`
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
}

async function runApply() {
  if (!existsSync(CSV)) { console.log(`No ${CSV} — run without --apply first.`); return; }
  const text = readFileSync(CSV, "utf8").trim().split("\n");
  const header = text[0].split(",");
  const idx = (k: string) => header.indexOf(k);
  const parsed = text.slice(1).map((l) => {
    // Deliberately simple: the only quoted column is note, which we do not read.
    const parts = l.split(",");
    return {
      action: parts[idx("action")],
      name: parts[idx("name")],
      jobId: parts[idx("jobId")],
      candidateId: parts[idx("candidateId")]
    };
  });
  const usable = parsed.filter((r) => r.candidateId && (r.action === "close-out" || r.jobId));
  console.log(`${parsed.length} rows in the file, ${usable.length} actionable (a create row needs a jobId).`);

  const undoRows: { candidateId: string; applicationId: string | null; previousStatus: string | null }[] = [];
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  for (const r of usable) {
    if (r.action === "close-out") {
      const app = await prisma.candidateApplication.findFirst({
        where: { candidateId: r.candidateId }, select: { id: true, status: true }
      });
      if (!app) continue;
      undoRows.push({ candidateId: r.candidateId, applicationId: app.id, previousStatus: app.status });
    } else {
      undoRows.push({ candidateId: r.candidateId, applicationId: null, previousStatus: null });
    }
  }
  writeFileSync(UNDO, JSON.stringify({ writtenAt: new Date().toISOString(), rows: undoRows }, null, 2));
  console.log(`undo record written first: ${UNDO}`);

  let created = 0, closed = 0;
  for (const r of usable) {
    if (r.action === "close-out") {
      const app = await prisma.candidateApplication.findFirst({ where: { candidateId: r.candidateId }, select: { id: true } });
      if (!app) continue;
      await prisma.candidateApplication.update({ where: { id: app.id }, data: { status: "Hired" } });
      closed++;
    } else {
      await prisma.candidateApplication.create({
        data: {
          candidateId: r.candidateId, jobId: r.jobId, status: "Hired", stage: "Hired",
          source: "Hired backfill", appliedAt: new Date()
        }
      });
      created++;
    }
  }
  console.log(`created ${created} applications, closed out ${closed}.`);
}

async function runUndo() {
  if (!existsSync(UNDO)) { console.log(`No undo record at ${UNDO}.`); return; }
  const rec = JSON.parse(readFileSync(UNDO, "utf8")) as {
    rows: { candidateId: string; applicationId: string | null; previousStatus: string | null }[];
  };
  let restored = 0, removed = 0;
  for (const r of rec.rows) {
    if (r.applicationId) {
      await prisma.candidateApplication.update({
        where: { id: r.applicationId }, data: { status: r.previousStatus ?? "New" }
      });
      restored++;
    } else {
      const del = await prisma.candidateApplication.deleteMany({
        where: { candidateId: r.candidateId, source: "Hired backfill" }
      });
      removed += del.count;
    }
  }
  console.log(`restored ${restored} statuses, removed ${removed} backfilled applications.`);
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
