/**
 * Reconciles the stage on people we ALREADY HOLD against a Paycom "Hiring
 * Metrics" export.
 *
 *   npx tsx scripts/reconcile-paycom-stages.ts --file "C:/path/Hiring Metrics.csv"
 *   npx tsx scripts/reconcile-paycom-stages.ts --file "..." --apply
 *   npx tsx scripts/reconcile-paycom-stages.ts --file "..." --apply --limit 20
 *   npx tsx scripts/reconcile-paycom-stages.ts --undo
 *
 * WHY THIS EXISTS. Paycom is the system of record for disposition and cannot be
 * queried from here, so Journey's stage drifts. On 2026-09-11 nine of the
 * twenty-four people the Open Candidate Sweep listed as OPEN were already
 * terminal in Paycom — five of them rejected after an interview somebody sat
 * through. The importer does not fix this: it only sets a stage on people it
 * CREATES, and never updates anyone who already exists.
 *
 * MATCHED ON PAYCOM'S APPLICATION ID, not on name and not on email.
 *
 *   - Email would be better still, but he confirmed on 2026-09-11 that this
 *     report cannot be customised to add that column.
 *   - Name matching is what created the duplicate rows this is cleaning up after.
 *     Paycom itself spells one person several ways across their applications:
 *     "Wilde, Chris" and "Wilde, Christopher" are the same man, and the import
 *     made two people out of them.
 *   - The importer already stores Paycom's own Application ID on
 *     CandidateApplication.sourceApplicationId, so an export row joins to exactly
 *     one person or to nobody. There is no guessing left in the match.
 *
 * THE ONE RULE THAT MATTERS: NEVER MOVE ANYBODY BACKWARDS.
 *
 * Paycom's "In Hiring Process" derives to the stage "Applied", which is the
 * weakest live answer rather than a decision. Writing it would drag everyone
 * currently at Interviewing back to Applied and quietly destroy real progress —
 * the interviews are on the calendar, not in this file. So a proposal is only
 * ever made for a DECISION: a terminal stage, an offer, or a hire. Anything that
 * reads "still in process" is left exactly as it is.
 *
 * READ-ONLY BY DEFAULT. A plain run writes nothing and produces a review file.
 * --apply changes Candidate.stage and nothing else, recording the previous value
 * of every row it touches so --undo can put them all back.
 *
 * IT DOES NOT ARCHIVE ANYBODY, and that is deliberate. Moving somebody to
 * Rejected is a stage change; taking them out of the working list is a separate
 * decision that belongs to a person, not to this script.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { prisma } from "@/lib/prisma";
import { type Row, str, loadRows, applicationId, stageForPerson } from "@/lib/paycom/hiring-metrics";

const OUT_DIR = "scripts/paycom-stage-reconcile";
/** The record of what was APPLIED — tracked, and the only undo path. */
const UNDO_FILE = `${OUT_DIR}/undo.json`;
/** What an --apply did. Tracked, so the change is reviewable after the fact. */
const REVIEW_APPLIED = `${OUT_DIR}/review.md`;
/** What a dry run would do. Gitignored — looking must not dirty the tree. */
const REVIEW_DRY = `${OUT_DIR}/review-dryrun.md`;

/**
 * Stages that represent a DECISION and may therefore be written.
 *
 * "Applied" is deliberately absent — see the rule at the top. So is null.
 * "Saved For Later" IS here: Future Consideration and Evergreen Candidate are
 * deliberate parks, not an absence of news, and a person sitting at Screening
 * who Paycom has parked should say so.
 */
const WRITABLE = new Set(["Hired", "Offer", "Rejected", "Withdrew", "Knocked Out", "Saved For Later"]);

/** Stages nothing in this file may overwrite without a human looking first. */
const PROTECTED = new Set(["Hired"]);

/** Stages that mean the person is finished, for reporting. */
const TERMINAL = new Set(["Hired", "Rejected", "Withdrew", "Knocked Out"]);

type UndoRecord = {
  appliedAt: string;
  sourceFile: string;
  changes: Array<{ candidateId: string; displayName: string; from: string | null; to: string }>;
};

type Proposal = {
  candidateId: string;
  displayName: string;
  from: string | null;
  to: string;
  apps: number;
  /** The disposition and date that drove it, for the review file. */
  why: string;
  /** A likely duplicate of this person, if one exists — see findTwin. */
  twin?: { displayName: string; stage: string | null; id: string };
};

/**
 * Short forms that are the same person. Only the ones this roster actually
 * throws up — a general nickname database would match things nobody meant.
 */
const NICKNAMES: Array<[string, string]> = [
  ["mike", "michael"], ["rob", "robert"], ["bob", "robert"], ["bill", "william"],
  ["dick", "richard"], ["rick", "richard"], ["jim", "james"], ["joe", "joseph"],
  ["tom", "thomas"], ["dan", "daniel"], ["dave", "david"], ["steve", "steven"],
  ["chris", "christopher"], ["ken", "kenneth"], ["matt", "matthew"], ["greg", "gregory"],
  ["tim", "timothy"], ["tony", "anthony"], ["nick", "nicholas"], ["alex", "alexander"],
  ["ben", "benjamin"], ["sam", "samuel"], ["andy", "andrew"], ["jeff", "jeffrey"],
  ["ron", "ronald"], ["gus", "augustus"], ["ed", "edward"], ["pat", "patrick"]
];

function tokens(name: string): string[] {
  return str(name).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
}

/** Are these two first names plausibly the same person? */
function sameFirstName(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) return true;
  return NICKNAMES.some(([s, l]) => (a === s && b === l) || (b === s && a === l));
}

/**
 * The other candidate row that is probably the same human.
 *
 * THIS IS THE LIMIT OF THE WHOLE SCRIPT, so it is reported rather than hidden.
 * Matching on Application ID lands a proposal on whichever record HOLDS that
 * application — and for the ten people the 2026-09-10 import duplicated, the
 * applications all sit on the NEW row while the one recruiters actually look at
 * has none. So the stage gets corrected on the copy nobody reads.
 *
 * Same surname, plus a first name that is equal, a prefix, or a known short form.
 * Also catches a name that is a subset of the other: "(Scott) Gregory Tinsley"
 * against "Gregory Tinsley".
 */
function findTwin(
  target: { id: string; displayName: string },
  all: Array<{ id: string; displayName: string; stage: string | null }>
): { displayName: string; stage: string | null; id: string } | undefined {
  const t = tokens(target.displayName);
  if (t.length < 2) return undefined;
  const surname = t[t.length - 1];
  const tSet = new Set(t);
  for (const c of all) {
    if (c.id === target.id) continue;
    const o = tokens(c.displayName);
    if (o.length < 2 || o[o.length - 1] !== surname) continue;
    const oSet = new Set(o);
    const subset = [...tSet].every((x) => oSet.has(x)) || [...oSet].every((x) => tSet.has(x));
    if (subset || sameFirstName(t[0], o[0])) {
      return { displayName: c.displayName, stage: c.stage, id: c.id };
    }
  }
  return undefined;
}

function fmtDate(r: Row): string {
  const d = str(r["Disposition Date"]).trim();
  return d || str(r["Application Date"]).trim() || "no date";
}

/** The row that best explains the derived stage, for a human reading the review. */
function drivingRow(rows: Row[]): Row {
  const live = rows.find((r) => r["Application Status"] === "Hired")
    ?? rows.find((r) => r["Application Status"] === "Offered")
    ?? rows.find((r) => r["Application Status"] === "In Hiring Process");
  if (live) return live;
  return [...rows].sort((a, b) => {
    const da = new Date(str(a["Disposition Date"])).getTime() || 0;
    const db = new Date(str(b["Disposition Date"])).getTime() || 0;
    return db - da;
  })[0];
}

async function undo() {
  let rec: UndoRecord;
  try {
    rec = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as UndoRecord;
  } catch {
    console.log(`No undo record at ${UNDO_FILE} — nothing to undo.`);
    return;
  }
  console.log(`Undo record from ${rec.appliedAt}, source ${rec.sourceFile}`);
  console.log(`  stages to put back: ${rec.changes.length}`);
  let done = 0;
  for (const c of rec.changes) {
    // Only reverts rows that still hold the value this script wrote. Somebody
    // who has since been moved by hand is LEFT ALONE — undoing a human's later
    // decision would be worse than leaving this script's change in place.
    const res = await prisma.candidate.updateMany({
      where: { id: c.candidateId, stage: c.to },
      data: { stage: c.from }
    });
    if (res.count) done += 1;
    else console.log(`  skipped ${c.displayName} — no longer reads "${c.to}", left as is`);
  }
  console.log(`Reverted ${done} of ${rec.changes.length}.`);
  await prisma.$disconnect();
}

async function main() {
  if (process.argv.includes("--undo")) return undo();

  const apply = process.argv.includes("--apply");
  const fileArg = process.argv.indexOf("--file");
  const file = fileArg > -1 ? process.argv[fileArg + 1] : "";
  if (!file) {
    console.error('Pass the export: --file "C:/Users/Recruiter/Downloads/Hiring Metrics - SheetNN.csv"');
    process.exit(1);
  }
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const rows = loadRows(file);
  console.log(`Read ${rows.length} rows from ${file}.`);

  const ids = [...new Set(rows.map(applicationId).filter(Boolean))];
  console.log(`Distinct Application IDs in the file: ${ids.length}`);

  // THE JOIN. Application ID -> the candidate who holds that application.
  const held = await prisma.candidateApplication.findMany({
    where: { sourceApplicationId: { in: ids } },
    select: { sourceApplicationId: true, candidateId: true }
  });
  const appToCandidate = new Map<string, string>();
  for (const a of held) {
    if (a.sourceApplicationId) appToCandidate.set(a.sourceApplicationId, a.candidateId);
  }
  console.log(`Of those, already held: ${appToCandidate.size}`);

  // Group the export by the person it resolves to.
  const byCandidate = new Map<string, Row[]>();
  const unmatched: Row[] = [];
  for (const r of rows) {
    const id = applicationId(r);
    const cid = id ? appToCandidate.get(id) : undefined;
    if (!cid) {
      unmatched.push(r);
      continue;
    }
    if (!byCandidate.has(cid)) byCandidate.set(cid, []);
    byCandidate.get(cid)!.push(r);
  }

  const cands = await prisma.candidate.findMany({
    where: { id: { in: [...byCandidate.keys()] } },
    select: { id: true, displayName: true, stage: true, status: true, archivedAt: true }
  });
  const candById = new Map(cands.map((c) => [c.id, c]));

  const proposals: Proposal[] = [];
  const parked: Proposal[] = [];
  const conflicts: Array<Proposal & { reason: string }> = [];
  let agreed = 0;
  let stillInProcess = 0;

  for (const [cid, r] of byCandidate) {
    const cand = candById.get(cid);
    if (!cand) continue;
    const to = stageForPerson(r);
    if (!to || !WRITABLE.has(to)) {
      stillInProcess += 1;
      continue;
    }
    if (to === cand.stage) {
      agreed += 1;
      continue;
    }
    const p: Proposal = {
      candidateId: cid,
      displayName: cand.displayName,
      from: cand.stage,
      to,
      apps: r.length,
      why: `${str(drivingRow(r).Disposition) || str(drivingRow(r)["Application Status"])} — ${fmtDate(drivingRow(r))}`
    };
    if (cand.stage && PROTECTED.has(cand.stage)) {
      conflicts.push({ ...p, reason: `already ${cand.stage}; this file would overwrite it` });
      continue;
    }
    if (cand.stage && TERMINAL.has(cand.stage)) {
      conflicts.push({ ...p, reason: `already terminal as ${cand.stage}, Paycom says ${to}` });
      continue;
    }
    if (to === "Saved For Later") parked.push(p);
    else proposals.push(p);
  }

  // Does this proposal land on a duplicate rather than the record people read?
  // Checked against every candidate we hold, not just the ones in this file.
  const allNames = await prisma.candidate.findMany({
    where: { status: { not: "MERGED" } },
    select: { id: true, displayName: true, stage: true }
  });
  for (const p of [...proposals, ...parked]) {
    p.twin = findTwin({ id: p.candidateId, displayName: p.displayName }, allNames);
  }
  const dupNames = [...proposals, ...parked].filter((p) => p.twin);

  // ---- the review file ----------------------------------------------------
  mkdirSync(OUT_DIR, { recursive: true });
  const L: string[] = [];
  L.push("# Paycom stage reconciliation — review");
  L.push("");
  L.push(`Source file: ${file}`);
  L.push(`Rows: ${rows.length} · distinct Application IDs: ${ids.length} · already held: ${appToCandidate.size}`);
  L.push(`Matched on Paycom's Application ID. No name matching, no guessing.`);
  L.push("");
  L.push("## What would change");
  L.push("");
  L.push("| | count |");
  L.push("|---|---|");
  L.push(`| **Stage changes proposed** | **${proposals.length}** |`);
  L.push(`| Parked — Paycom says Saved For Later | ${parked.length} |`);
  L.push(`| Conflicts, NOT applied — need a person | ${conflicts.length} |`);
  L.push(`| Already agree, nothing to do | ${agreed} |`);
  L.push(`| Still in process in Paycom, left alone | ${stillInProcess} |`);
  L.push(`| Application IDs in the file we do not hold | ${unmatched.length} |`);
  L.push("");
  L.push(
    "Nobody is moved backwards: Paycom's \"In Hiring Process\" is treated as no news, " +
      "not as a demotion to Applied. Nobody is archived either — that is a separate decision."
  );
  L.push("");

  L.push("## Proposed stage changes");
  L.push("");
  if (!proposals.length) L.push("_none_");
  else {
    L.push("| Person | Journey now | Paycom says | Why | Apps |");
    L.push("|---|---|---|---|---|");
    for (const p of [...proposals].sort((a, b) => a.displayName.localeCompare(b.displayName))) {
      L.push(`| ${p.displayName} | ${p.from ?? "(none)"} | **${p.to}** | ${p.why} | ${p.apps} |`);
    }
  }
  L.push("");

  L.push("## Parked — Paycom has these at Saved For Later");
  L.push("");
  L.push("Not a rejection. Future Consideration and Evergreen Candidate both land here.");
  L.push("");
  if (!parked.length) L.push("_none_");
  else {
    L.push("| Person | Journey now | Why |");
    L.push("|---|---|---|");
    for (const p of [...parked].sort((a, b) => a.displayName.localeCompare(b.displayName))) {
      L.push(`| ${p.displayName} | ${p.from ?? "(none)"} | ${p.why} |`);
    }
  }
  L.push("");

  L.push("## Conflicts — NOT applied, decide these by hand");
  L.push("");
  if (!conflicts.length) L.push("_none_");
  else {
    for (const c of conflicts) {
      L.push(`- **${c.displayName}** — ${c.reason}. Driving row: ${c.why}`);
    }
  }
  L.push("");

  L.push("## READ THIS — proposals landing on a duplicate record");
  L.push("");
  L.push(
    "**This is the limit of the whole approach.** The match is on Application ID, which is exact, " +
      "so a proposal lands on whichever record HOLDS that application. For the people the " +
      "10 September import duplicated, every application sits on the NEW row while the record " +
      "recruiters actually open has none — so the stage below gets corrected on the copy nobody reads. " +
      "**Merging these pairs is what makes the fix stick.**"
  );
  L.push("");
  if (!dupNames.length) L.push("_none_");
  else {
    L.push("| Being updated | Change | Its likely twin | Twin's stage |");
    L.push("|---|---|---|---|");
    for (const d of [...dupNames].sort((a, b) => a.displayName.localeCompare(b.displayName))) {
      L.push(
        `| ${d.displayName} | ${d.from ?? "(none)"} → **${d.to}** | ${d.twin!.displayName} | ${d.twin!.stage ?? "(none)"} |`
      );
    }
  }
  L.push("");

  L.push("## Application IDs in the file we do not hold");
  L.push("");
  L.push(
    `${unmatched.length} row(s). These are applications this database has never seen, so there is ` +
      "no one to update. Run scripts/import-paycom-sheet10.ts to bring them in, then re-run this."
  );
  L.push("");

  const reviewPath = apply ? REVIEW_APPLIED : REVIEW_DRY;
  writeFileSync(reviewPath, L.join("\n"), "utf8");

  console.log("");
  console.log(`  stage changes proposed:     ${proposals.length}`);
  console.log(`  parked (Saved For Later):   ${parked.length}`);
  console.log(`  conflicts, NOT applied:     ${conflicts.length}`);
  console.log(`  already agree:              ${agreed}`);
  console.log(`  still in process, untouched:${stillInProcess}`);
  console.log(`  application ids not held:   ${unmatched.length}`);
  console.log(`  landing on a DUPLICATE row: ${dupNames.length}  <- these need a merge to stick`);
  console.log("");
  console.log(`Review file: ${reviewPath}`);

  if (!apply) {
    console.log("");
    console.log("DRY RUN — nothing written. Re-run with --apply once the review reads right.");
    await prisma.$disconnect();
    return;
  }

  // ---- write --------------------------------------------------------------
  //
  // MERGED WITH ANY EXISTING UNDO RECORD, not overwritten. This is meant to be
  // run as a small batch and then the rest — the working agreement asks for
  // exactly that — and a fresh record on the second run would strand the first
  // batch with no way back. Caught doing precisely this on 2026-09-11, after ten
  // rows were already applied. The importer's manifest merges for the same reason.
  const rec: UndoRecord = { appliedAt: new Date().toISOString(), sourceFile: file, changes: [] };
  try {
    const previous = JSON.parse(readFileSync(UNDO_FILE, "utf8")) as UndoRecord;
    if (previous?.changes?.length) {
      rec.changes.push(...previous.changes);
      console.log(`Existing undo record found — keeping its ${previous.changes.length} change(s) and adding to it.`);
    }
  } catch {
    // No previous record. Normal on a first run.
  }
  const alreadyDone = new Set(rec.changes.map((c) => c.candidateId));
  let done = 0;
  for (const p of [...proposals, ...parked]) {
    if (done >= limit) break;
    // Applied by an earlier batch. Skipped without spending the limit, so
    // "--limit 10" three times works through thirty people rather than
    // re-examining the same ten.
    if (alreadyDone.has(p.candidateId)) continue;
    // Guarded on the value we read, so a row somebody changed between the dry
    // run and now is skipped rather than silently overwritten.
    const res = await prisma.candidate.updateMany({
      where: { id: p.candidateId, stage: p.from },
      data: { stage: p.to }
    });
    if (!res.count) {
      console.log(`  skipped ${p.displayName} — stage moved since the dry run, left as is`);
      continue;
    }
    rec.changes.push({ candidateId: p.candidateId, displayName: p.displayName, from: p.from, to: p.to });
    done += 1;
  }
  writeFileSync(UNDO_FILE, JSON.stringify(rec, null, 2), "utf8");
  console.log(`Applied ${done} stage change(s). Undo record: ${UNDO_FILE}`);
  console.log("Revert everything this run did with: npx tsx scripts/reconcile-paycom-stages.ts --undo");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("ERR", e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
