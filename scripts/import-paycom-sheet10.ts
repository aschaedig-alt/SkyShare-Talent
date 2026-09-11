/**
 * Imports the Paycom "Hiring Metrics" export — every applicant in Paycom with
 * their applications, application status and disposition reason.
 *
 *   npx tsx scripts/import-paycom-sheet10.ts               # dry run + review file
 *   npx tsx scripts/import-paycom-sheet10.ts --apply       # do it
 *   npx tsx scripts/import-paycom-sheet10.ts --apply --limit 50   # small batch first
 *   npx tsx scripts/import-paycom-sheet10.ts --undo        # remove exactly what it added
 *
 * WHAT IT DOES, and the three decisions behind it (his, asked 2026-09-10):
 *
 *  1. SPLIT BY STATUS. A person whose applications are all closed is created
 *     ARCHIVED — findable by search, out of the working list, exactly like the
 *     JazzHR import. Somebody still in process, offered, or actually HIRED lands
 *     in the working list. Without this the list goes from 501 people to over
 *     5,500, nearly all of them long-closed.
 *  2. INCOMPLETE APPLICATIONS ARE STILL PEOPLE. The ones who started an
 *     application and never finished are created too, in the archive, so a
 *     repeat applicant is recognised later instead of looking brand new.
 *  3. NAME MATCHING ONLY WHERE IT IS UNAMBIGUOUS. This export carries NO EMAIL
 *     ADDRESS, so matching is on name alone. Where exactly one person we hold
 *     has that name, the applications attach to them. Where two do, the person
 *     is SKIPPED and listed for a human — attaching one person's history to
 *     somebody else's record is not a mistake you can see afterwards.
 *
 * REVERSIBLE. Every row it creates is written to a manifest next to the review
 * file, and --undo deletes exactly those ids and nothing else. Every created
 * candidate also carries the tag below, as a second handle that survives losing
 * the manifest.
 *
 * IDEMPOTENT on applications: Paycom's own Application ID is stored as
 * sourceApplicationId, and a row whose id we already hold is skipped. Running
 * twice does not double anybody's history.
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { toHouseWording, stageForWording } from "@/lib/candidates/disposition-vocabulary";

const CSV = "C:/Users/Recruiter/Downloads/Hiring Metrics - Sheet10.csv";
// NOT an underscore-prefixed scratch directory, deliberately. This holds the ONLY
// file-based undo path for a 13,833-row live write, and every session's handoff
// carries a "do NOT stage scripts/_*" list — a manifest filed under that naming
// reads as scratch and gets skipped, or deleted. Same reason the Aug 28
// reconciliation undo records were moved out of scripts/_reconcile_output/.
// Tracked and committed on his instruction, 2026-09-11.
const OUT_DIR = "scripts/paycom-sheet10-import";
const REVIEW = `${OUT_DIR}/review.md`;
const MANIFEST = `${OUT_DIR}/manifest.json`;

/** The handle on everything this created, independent of the manifest file. */
const IMPORT_TAG = "System Imported";
/** Written to Candidate.source so a profile says where the record came from. */
const SOURCE = "Paycom hiring metrics import";

/**
 * The application statuses that put a person in the WORKING LIST rather than
 * the archive.
 *
 * HIRED IS ONE OF THEM, and it was not at first. "In process" was my wording
 * for the split, and taken literally it filed 48 people who were actually hired
 * into the archive — the one group in this file who definitely still matter,
 * since they became employees and the Hired tile is part of the working list.
 *
 * "Declined Offer" is deliberately NOT here: they were offered a job and did
 * not take it, which is finished.
 */
const LIVE_STATUS = new Set(["In Hiring Process", "Offered", "Hired"]);

type Row = Record<string, string>;

type Manifest = {
  createdAt: string;
  candidateIds: string[];
  applicationIds: string[];
  tagId: string | null;
};

// ---------------------------------------------------------------------------
// Names. The export writes "Last, First" and sometimes worse.
// ---------------------------------------------------------------------------

/**
 * Cells do not all arrive as strings. The sheet parser hands back a number
 * for a numeric-looking cell however it is configured, and one of those reached
 * .trim() and stopped the run — so every raw cell goes through here first.
 */
function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

function flipName(raw: unknown): string {
  const s = str(raw).trim();
  if (!s.includes(",")) return s;
  const [last, ...rest] = s.split(",");
  const first = rest.join(",").trim();
  if (!first || !last.trim()) return s;
  return `${first} ${last.trim()}`.replace(/\s+/g, " ").trim();
}

function normalize(name: string): string {
  return str(name).toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

/**
 * Fix a name that is entirely SHOUTING or entirely lowercase.
 *
 * 463 names in this export are all caps and 42 all lowercase, out of 6,015.
 * Left alone they reach the candidate list looking like broken data, and they
 * are the version people will see forever, since this import is where these
 * records come from.
 *
 * ONLY touches names that are entirely one case. A mixed-case name is left
 * exactly as typed, because that is where the real spellings live — McDonald,
 * O'Brien, van der Berg, DeAngelo — and a title-caser applied to those does
 * more damage than the shouting it fixes.
 */
function fixCasing(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  if (letters.length < 3) return name;
  const allOneCase = name === name.toUpperCase() || name === name.toLowerCase();
  if (!allOneCase) return name;

  return name
    .split(/(\s+)/)
    .map((word) => {
      if (/^\s+$/.test(word) || !word) return word;
      const bare = word.replace(/\./g, "").toUpperCase();
      // A suffix or a credential stays upright.
      if (SUFFIXES.has(bare)) return word.toUpperCase();
      // Capitalise after a hyphen or an apostrophe too: Marie-Claire, O'Brien.
      return word
        .toLowerCase()
        .replace(/(^|[-'’])([a-z])/g, (_m, sep: string, ch: string) => sep + ch.toUpperCase())
        // Mc and Mac names carry a second capital.
        .replace(/^(Mc)([a-z])/, (_m, mc: string, ch: string) => mc + ch.toUpperCase());
    })
    .join("");
}

/**
 * Split a display name into first and last for the columns that want them.
 * Deliberately simple: last word is the surname, the rest is the given name.
 * A middle name or a suffix therefore lands in firstName, which is wrong in a
 * small way and harmless — displayName is what the app shows.
 */
function splitName(display: string): { firstName: string | null; lastName: string | null } {
  const parts = display.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: null, lastName: null };
  if (parts.length === 1) return { firstName: parts[0], lastName: null };

  // A SUFFIX IS NOT A SURNAME. Taking the last word made "Joseph Aaron JR" into
  // firstName "Joseph Aaron", lastName "JR", which sorts and searches as a
  // person called JR. Skip back over any trailing suffixes to find the real one.
  let end = parts.length - 1;
  while (end > 0 && SUFFIXES.has(parts[end].replace(/\./g, "").toUpperCase())) end -= 1;
  const lastName = parts[end];
  const firstName = parts.slice(0, end).join(" ") || null;
  return { firstName: firstName ?? lastName, lastName: firstName ? lastName : null };
}

const SUFFIXES = new Set([
  "JR", "SR", "II", "III", "IV", "V", "VI",
  // Credentials people put in the name field. Same problem: not a surname.
  "MD", "PHD", "MBA", "MS", "MPP", "AAE", "ESQ", "CPA", "RN", "DO"
]);

/**
 * A name we refuse to turn into a person record.
 *
 * Deliberately NARROW. A bracketed nickname ("Mary (Kathy) Heron") is a real
 * person and is kept; what is rejected is a row where the name field clearly
 * holds something that is not a name at all. Ten rows in this file, listed in
 * the review so they are a decision rather than a silent drop.
 */
function unusableName(display: string): string | null {
  const s = display.trim();
  if (!s) return "empty";
  if (/@/.test(s)) return "an email address, not a name";
  if (/\d{3,}/.test(s)) return "contains a long number";
  if (/\b(she\/her|he\/him|they\/them)\b/i.test(s)) return "pronouns in the name field";
  if (s.replace(/[^a-zA-Z]/g, "").length < 4) return "almost no letters";
  const singles = s.split(/\s+/).filter((w) => w.replace(/[^a-zA-Z]/g, "").length === 1).length;
  if (singles >= 3) return "spaced-out single letters";
  return null;
}

// ---------------------------------------------------------------------------
// Dates and titles
// ---------------------------------------------------------------------------

/**
 * Excel serial day number -> Date.
 *
 * Day 1 is 1900-01-01, and the numbering carries Excel's own 1900 leap-year
 * bug, which is why the epoch here is 1899-12-30 rather than 1899-12-31.
 */
function fromExcelSerial(n: number): Date | null {
  // Above ~80000 is the year 2119 and beyond; anything up there is not a date
  // from a recruiting export, it is a number that got into a date column.
  if (!Number.isFinite(n) || n <= 0 || n > 80000) return null;
  return new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 86400000);
}

/**
 * A date cell -> Date, or null.
 *
 * THE DATE COLUMNS DO NOT ARRIVE AS TEXT. The sheet reader turns "April 7,
 * 2025" into the Excel serial 45754, and the first version of this function
 * coerced that to the string "45754" and handed it to new Date(), which read it
 * as THE YEAR 45754. Every one of the 8,800 applications was written roughly
 * forty-three thousand years into the future, and the candidates page threw
 * "RangeError: Invalid time value" trying to render one.
 *
 * The string coercion that caused it was added to stop a crash — and that crash
 * was this same bug announcing itself. Worth remembering: a defensive String()
 * around a value you have not identified converts a loud failure into a quiet
 * wrong answer.
 *
 * A bare numeric STRING is treated as a serial too, for the same reason.
 */
function parseDate(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw === "number") return fromExcelSerial(raw);
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * "FILLED - Customer Service Rep" -> "Customer Service Rep".
 *
 * These prefixes describe the REQUISITION, not the person. Stamping one on an
 * applicant is a claim about them that is not true, and it has caused this exact
 * problem before: 15 people were nearly moved into onboarding carrying a
 * position that read "FILLED - ...".
 *
 * THREE OF THEM, not one. Stripping only FILLED left 1,617 CLOSED and 200 OLD
 * titles intact, which the first 25-person batch caught on a real row reading
 * "CLOSED - Pilatus PC-12 Captain". Counted over the whole export: FILLED 4,238,
 * CLOSED 1,617, OLD 200, and 2,765 rows with no prefix at all.
 *
 * Anchored and all-caps only, so a genuine title containing one of these words
 * is untouched.
 */
const REQ_STATE_PREFIX = /^(FILLED|CLOSED|OLD)\s*-\s*/;

function cleanTitle(raw: unknown): string | null {
  let s = str(raw).trim();
  // Looped, because a title can carry more than one ("OLD - FILLED - ...").
  while (REQ_STATE_PREFIX.test(s)) s = s.replace(REQ_STATE_PREFIX, "").trim();
  return s || null;
}

/** "535 (External)" -> "535". */
function reqId(raw: unknown): string | null {
  const s = str(raw).replace(/\s*\(.*\)\s*$/, "").trim();
  return s || null;
}

// ---------------------------------------------------------------------------

/**
 * Split one CSV line, honouring quotes and doubled quotes inside them.
 *
 * Hand-written on purpose — see loadRows below for why there is no library here.
 */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

/**
 * Read the export.
 *
 * A .csv IS READ AS TEXT, WITH NO SPREADSHEET LIBRARY, and that is the whole
 * point of this function. The first version handed the CSV to xlsx because it
 * was already a dependency, and xlsx type-guesses: it decided "April 7, 2025"
 * was a date and converted it to the Excel serial 45754. Every one of the 8,800
 * applications was then written about 43,000 years into the future. The file
 * was never wrong — all 8,820 of its date cells are proper text, and a plain
 * read returns them untouched.
 *
 * These exports come out of GOOGLE SHEETS, saved to whatever format is needed,
 * so a real workbook is possible too and xlsx is right for that — a .xlsx holds
 * genuine serial numbers and needs a reader that understands them. The rule is
 * about matching the reader to the file, not about avoiding the library.
 *
 * cellDates asks xlsx for real Date objects rather than serials, so the
 * workbook path does not reintroduce the same conversion.
 */
async function loadRows(): Promise<Row[]> {
  if (/\.csv$/i.test(CSV)) {
    const lines = readFileSync(CSV, "utf8").split(/\r?\n/);
    const header = splitCsvLine(lines[0]).map((h) => h.trim());
    const rows: Row[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      if (!lines[i].trim()) continue;
      const fields = splitCsvLine(lines[i]);
      const row: Row = {};
      header.forEach((h, j) => {
        row[h] = fields[j] ?? "";
      });
      rows.push(row);
    }
    return rows;
  }

  const wb = XLSX.read(readFileSync(CSV), { cellDates: true });
  return XLSX.utils.sheet_to_json<Row>(wb.Sheets[wb.SheetNames[0]], { defval: "" });
}

async function undo() {
  let manifest: Manifest;
  try {
    manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
  } catch {
    console.error(`No manifest at ${MANIFEST}. Nothing to undo from.`);
    process.exit(1);
  }
  console.log(`Manifest written ${manifest.createdAt}`);
  console.log(`  candidates to delete:  ${manifest.candidateIds.length}`);
  console.log(`  applications to delete: ${manifest.applicationIds.length}`);

  // Applications first. Deleting a candidate cascades to its applications, but
  // the ones attached to people we ALREADY had must go individually — those
  // candidates are not ours to delete.
  const apps = await prisma.candidateApplication.deleteMany({
    where: { id: { in: manifest.applicationIds } }
  });
  const cands = await prisma.candidate.deleteMany({ where: { id: { in: manifest.candidateIds } } });
  console.log(`Deleted ${apps.count} applications and ${cands.count} candidates.`);
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.argv.includes("--undo")) return undo();

  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg > -1 ? Number(process.argv[limitArg + 1]) : Infinity;

  const rows = await loadRows();
  console.log(`Read ${rows.length} rows from the export.`);

  // Everything we already hold, by normalized name.
  const existing = await prisma.candidate.findMany({
    where: { status: { not: "MERGED" } },
    select: { id: true, displayName: true, archivedAt: true }
  });
  const byName = new Map<string, typeof existing>();
  for (const c of existing) {
    const k = normalize(c.displayName);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k)!.push(c);
  }

  // Applications we already hold, so a re-run adds nothing twice.
  const heldApps = new Set(
    (
      await prisma.candidateApplication.findMany({
        where: { sourceApplicationId: { not: null } },
        select: { sourceApplicationId: true }
      })
    ).map((a) => a.sourceApplicationId as string)
  );

  // Jobs we can actually link to, by Paycom requisition id.
  const jobs = await prisma.job.findMany({
    where: { paycomReqId: { not: null } },
    select: { id: true, paycomReqId: true }
  });
  const jobByReq = new Map(jobs.map((j) => [j.paycomReqId as string, j.id]));

  // Group the file by person.
  const people = new Map<string, { display: string; rows: Row[] }>();
  for (const r of rows) {
    const display = fixCasing(flipName(r["Legal Name"] || r["Preferred Name"]));
    const key = normalize(display);
    if (!key) continue;
    if (!people.has(key)) people.set(key, { display, rows: [] });
    people.get(key)!.rows.push(r);
  }

  const plan = {
    createPeople: [] as Array<{ display: string; archived: boolean; stage: string | null; apps: number }>,
    attachTo: [] as Array<{ display: string; candidateId: string; apps: number }>,
    skippedAmbiguous: [] as Array<{ display: string; matches: number }>,
    skippedUnusable: [] as Array<{ display: string; why: string }>,
    appsAlreadyHeld: 0,
    appsToCreate: 0
  };

  type NewPerson = { key: string; display: string; archived: boolean; stage: string | null; rows: Row[] };
  const toCreate: NewPerson[] = [];
  type Attach = { candidateId: string; rows: Row[] };
  const toAttach: Attach[] = [];

  for (const [key, v] of people) {
    const hits = byName.get(key) ?? [];

    // Which of this person's rows are actually new to us?
    const newRows = v.rows.filter((r) => {
      const id = String(r["Application ID"] ?? "").trim();
      if (!id) return false;
      if (heldApps.has(id)) {
        plan.appsAlreadyHeld += 1;
        return false;
      }
      return true;
    });

    if (hits.length > 1) {
      plan.skippedAmbiguous.push({ display: v.display, matches: hits.length });
      continue;
    }

    if (hits.length === 1) {
      if (newRows.length) {
        toAttach.push({ candidateId: hits[0].id, rows: newRows });
        plan.attachTo.push({ display: v.display, candidateId: hits[0].id, apps: newRows.length });
        plan.appsToCreate += newRows.length;
      }
      continue;
    }

    const why = unusableName(v.display);
    if (why) {
      plan.skippedUnusable.push({ display: v.display, why });
      continue;
    }

    // Somebody with an application still in process belongs in the working
    // list; everybody else goes to the archive.
    const open = v.rows.some((r) => LIVE_STATUS.has(r["Application Status"]));
    const stage = stageForPerson(v.rows);
    toCreate.push({ key, display: v.display, archived: !open, stage, rows: newRows });
    plan.createPeople.push({ display: v.display, archived: !open, stage, apps: newRows.length });
    plan.appsToCreate += newRows.length;
  }

  // ---- the review file --------------------------------------------------
  mkdirSync(OUT_DIR, { recursive: true });
  const archivedCount = plan.createPeople.filter((p) => p.archived).length;
  const liveCount = plan.createPeople.length - archivedCount;

  const lines: string[] = [];
  lines.push("# Paycom Sheet10 import — review");
  lines.push("");
  lines.push(`Source file: ${CSV}`);
  lines.push(`Rows in the file: ${rows.length}`);
  lines.push("");
  lines.push("## What would happen");
  lines.push("");
  lines.push("| | count |");
  lines.push("|---|---|");
  lines.push(`| People created, into the WORKING LIST (an application still in process) | ${liveCount} |`);
  lines.push(`| People created, into the ARCHIVE (everything closed) | ${archivedCount} |`);
  lines.push(`| People already here, applications attached to them | ${plan.attachTo.length} |`);
  lines.push(`| Applications created | ${plan.appsToCreate} |`);
  lines.push(`| Applications skipped, already held | ${plan.appsAlreadyHeld} |`);
  lines.push(`| SKIPPED, two people share the name | ${plan.skippedAmbiguous.length} |`);
  lines.push(`| SKIPPED, the name field is not a name | ${plan.skippedUnusable.length} |`);
  lines.push("");
  lines.push(`Every created candidate is tagged **${IMPORT_TAG}**.`);
  lines.push("");

  lines.push("## Skipped — two people share this name, sort by hand");
  lines.push("");
  if (!plan.skippedAmbiguous.length) lines.push("_none_");
  for (const s of plan.skippedAmbiguous) lines.push(`- ${s.display} (matches ${s.matches} existing people)`);
  lines.push("");

  lines.push("## Skipped — the name field does not hold a name");
  lines.push("");
  if (!plan.skippedUnusable.length) lines.push("_none_");
  for (const s of plan.skippedUnusable) lines.push(`- \`${s.display}\` — ${s.why}`);
  lines.push("");

  lines.push("## Going into the WORKING LIST (first 200)");
  lines.push("");
  for (const p of plan.createPeople.filter((x) => !x.archived).slice(0, 200)) {
    lines.push(`- ${p.display} — stage ${p.stage ?? "(none)"}, ${p.apps} application(s)`);
  }
  lines.push("");

  lines.push("## Applications attaching to people you already have (first 200)");
  lines.push("");
  for (const a of plan.attachTo.slice(0, 200)) lines.push(`- ${a.display} — ${a.apps} application(s)`);
  lines.push("");

  writeFileSync(REVIEW, lines.join("\n"), "utf8");

  console.log("");
  console.log(`  create into the working list: ${liveCount}`);
  console.log(`  create into the archive:      ${archivedCount}`);
  console.log(`  attach to existing people:    ${plan.attachTo.length}`);
  console.log(`  applications to create:       ${plan.appsToCreate}`);
  console.log(`  applications already held:    ${plan.appsAlreadyHeld}`);
  console.log(`  skipped, shared name:         ${plan.skippedAmbiguous.length}`);
  console.log(`  skipped, unusable name:       ${plan.skippedUnusable.length}`);
  console.log("");
  console.log(`Review file: ${REVIEW}`);

  if (!apply) {
    console.log("");
    console.log("DRY RUN — nothing written. Re-run with --apply once the review reads right.");
    return;
  }

  // ---- write ------------------------------------------------------------
  const tag = await prisma.tag.upsert({
    where: { normalized: IMPORT_TAG.toLowerCase() },
    update: {},
    create: { label: IMPORT_TAG, normalized: IMPORT_TAG.toLowerCase(), color: "slate" }
  });

  // MERGED WITH ANY EXISTING MANIFEST, not overwritten. This is meant to be run
  // as a small batch and then the rest, and a fresh manifest on the second run
  // would leave the first batch with nothing to undo it — the rows would still
  // be there, no longer listed, and invisible to --undo. Re-running is otherwise
  // safe: people created by the first pass are found by name on the second, and
  // their applications are already held so they are skipped.
  const previous: Manifest | null = (() => {
    try {
      return JSON.parse(readFileSync(MANIFEST, "utf8")) as Manifest;
    } catch {
      return null;
    }
  })();
  const manifest: Manifest = {
    createdAt: previous?.createdAt ?? new Date().toISOString(),
    candidateIds: [...(previous?.candidateIds ?? [])],
    applicationIds: [...(previous?.applicationIds ?? [])],
    tagId: tag.id
  };
  if (previous) {
    console.log(
      `Existing manifest found — keeping its ${previous.candidateIds.length} candidates and ${previous.applicationIds.length} applications, and adding to it.`
    );
  }

  const now = new Date();
  let done = 0;

  for (const p of toCreate) {
    if (done >= limit) break;
    const { firstName, lastName } = splitName(p.display);
    const candidate = await prisma.candidate.create({
      data: {
        displayName: p.display,
        firstName,
        lastName,
        normalizedName: normalize(p.display),
        origin: "PAYCOM",
        source: SOURCE,
        status: "ACTIVE",
        stage: p.stage,
        archivedAt: p.archived ? now : null,
        candidateTags: { create: [{ tagId: tag.id, source: "IMPORT" }] }
      },
      select: { id: true }
    });
    manifest.candidateIds.push(candidate.id);
    const made = await writeApplications(candidate.id, p.rows, jobByReq);
    manifest.applicationIds.push(...made);
    done += 1;
    if (done % 250 === 0) {
      console.log(`  created ${done} people...`);
      writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
    }
  }

  let attached = 0;
  for (const a of toAttach) {
    if (attached >= limit) break;
    const made = await writeApplications(a.candidateId, a.rows, jobByReq);
    manifest.applicationIds.push(...made);
    attached += 1;
    if (attached % 250 === 0) console.log(`  attached to ${attached} existing people...`);
  }

  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2), "utf8");
  console.log("");
  console.log(`WROTE ${manifest.candidateIds.length} candidates and ${manifest.applicationIds.length} applications.`);
  console.log(`Manifest: ${MANIFEST}  (npx tsx scripts/import-paycom-sheet10.ts --undo)`);
}

/**
 * The stage the PERSON should carry, from their applications.
 *
 * An open application wins outright — somebody being interviewed for one job is
 * not "Rejected" because a different application closed. Otherwise the most
 * recently decided application speaks for them.
 */
function stageForPerson(rows: Row[]): string | null {
  // Most advanced first: being hired for one job outranks being interviewed for
  // another, which outranks any closed application.
  if (rows.some((r) => r["Application Status"] === "Hired")) return "Hired";
  if (rows.some((r) => r["Application Status"] === "Offered")) return "Offer";
  if (rows.some((r) => r["Application Status"] === "In Hiring Process")) return "Applied";
  const sorted = [...rows].sort((a, b) => {
    const da = parseDate(a["Disposition Date"])?.getTime() ?? 0;
    const db = parseDate(b["Disposition Date"])?.getTime() ?? 0;
    return db - da;
  });
  for (const r of sorted) {
    const stage = stageForWording(toHouseWording(r.Disposition) ?? r.Disposition);
    if (stage) return stage;
  }
  return null;
}

async function writeApplications(
  candidateId: string,
  rows: Row[],
  jobByReq: Map<string, string>
): Promise<string[]> {
  const ids: string[] = [];
  for (const r of rows) {
    const sourceApplicationId = String(r["Application ID"] ?? "").trim();
    if (!sourceApplicationId) continue;
    const house = toHouseWording(r.Disposition) ?? (r.Disposition || null);
    const req = reqId(r["Requisition ID"]);
    const app = await prisma.candidateApplication.create({
      data: {
        candidateId,
        sourceApplicationId,
        // Only linked where the requisition is one we actually hold. The rest
        // carry the title as text, which is how the Jazz historical
        // applications already work — inventing 118 job records to hang closed
        // applications on would be worse than a title string.
        jobId: req ? jobByReq.get(req) ?? null : null,
        historicalJobTitle: cleanTitle(r["Job Title"]),
        status: r["Application Status"] || null,
        disposition: house,
        stage: stageForWording(house ?? "") ?? null,
        appliedAt: parseDate(r["Application Date"]),
        decidedAt: parseDate(r["Disposition Date"]),
        origin: "PAYCOM",
        source: SOURCE
      },
      select: { id: true }
    });
    ids.push(app.id);
  }
  return ids;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
