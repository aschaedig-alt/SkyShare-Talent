import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { existsSync } from "fs";
import { join, dirname } from "path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client/client";
import { readCsvObjects } from "../lib/archive/import/csv";
import {
  scoreMatch,
  normalizedPersonName,
  type ExistingCandidate,
  type IncomingPerson,
} from "../lib/archive/duplicate-scoring";
import { normalizeEmail, normalizePhone, normalizeName } from "../lib/candidates/normalize";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

// data_records folder of the Jazz export. Override: tsx prisma/import-jazz.ts "<path>"
const DEFAULT_DIR =
  "C:\\Users\\Recruiter\\Downloads\\Jazz Stuff\\skyshare_export_20250616\\skyshare_export_20250616\\data_records";
// Flags that consume the following token as their value.
const VALUE_FLAGS = new Set(["--limit", "--undo"]);
function positionalArgs(): string[] {
  const out: string[] = [];
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) { i++; continue; }
    if (a.startsWith("--")) continue;
    out.push(a);
  }
  return out;
}
function flagValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] ?? null : null;
}

const DIR = positionalArgs()[0] || process.env.JAZZ_DIR || DEFAULT_DIR;
const EXPORT_ROOT = dirname(DIR);
const COMMIT = process.argv.includes("--commit");
const LIMIT = flagValue("--limit") ? parseInt(flagValue("--limit")!, 10) : null;
const UNDO = flagValue("--undo");
const SOURCE_LABEL = "Jazz export — 2025-06-16";

const HOURS_COLUMNS = [
  "Pilot Flight Hours",
  "Total Flight Hours",
  "Multi Engine Hours",
  "Turbine Hours",
  "Instrument Hours",
  "PIC Hours",
  "Jet Aircraft Hours",
];

function isDemo(email: string, first: string, last: string): boolean {
  return email.toLowerCase().endsWith("@jazzhr.com") || `${first} ${last}`.toLowerCase().includes("jazzhr");
}

function statusBucket(name: string): "HIRED" | "OFFER" | "INTERVIEWED" | "REJECTED" | "APPLIED" {
  const n = name.toLowerCase();
  if (n.includes("hired") && !n.includes("elsewhere")) return "HIRED";
  if (n.includes("offer")) return "OFFER";
  if (
    n.includes("not selected") || n.includes("not a fit") || n.includes("not qualified") ||
    n.includes("over qualified") || n.includes("disqualif") || n.includes("knockout") ||
    n.includes("declined") || n.includes("spam") || n.includes("hired elsewhere")
  )
    return "REJECTED";
  if (n.includes("interview")) return "INTERVIEWED";
  return "APPLIED";
}

function parseDate(s: string | undefined): Date | null {
  if (!s || !s.trim()) return null;
  const d = new Date(s.trim());
  return isNaN(d.getTime()) ? null : d;
}

function docType(name: string): string {
  const n = (name || "").toLowerCase();
  if (n.includes("resume") || n.includes("cv")) return "Resume";
  return "Other";
}

function pct(n: number, total: number) {
  return total === 0 ? "0%" : `${Math.round((n / total) * 100)}%`;
}

type Person = IncomingPerson & { prospectIds: string[]; hasHours: boolean };

async function buildContext() {
  const candidates = readCsvObjects(join(DIR, "candidates.csv"));
  const applications = readCsvObjects(join(DIR, "candidate_applications.csv"));
  const jobs = readCsvObjects(join(DIR, "jobs.csv"));
  const notes = readCsvObjects(join(DIR, "candidate_notes_and_comments.csv"));
  const interviews = readCsvObjects(join(DIR, "candidate_interviews.csv"));
  const documents = readCsvObjects(join(DIR, "candidate_documents.csv"));
  const workflow = readCsvObjects(join(DIR, "workflow_steps.csv"));

  const statusName = new Map<string, string>();
  for (const w of workflow) statusName.set(w.prospect_status_id, w.prospect_status_name);

  // Per-prospect lookups
  const candidateRow = new Map<string, Record<string, string>>();
  for (const c of candidates) candidateRow.set(c.prospect_id, c);
  const appsBy = groupBy(applications, "prospect_id");
  const interviewsBy = groupBy(interviews, "prospect_id");
  const notesBy = groupBy(notes, "prospect_id");
  const docsBy = groupBy(documents, "prospect_id");

  // Existing system candidates (dedupe targets)
  const existing: ExistingCandidate[] = await prisma.candidate.findMany({
    where: { origin: { not: "JAZZ" }, scanExcludedReason: { not: "TEST" } },
    select: { id: true, displayName: true, normalizedEmail: true, normalizedPhone: true, normalizedName: true },
  });

  // Pass A: collapse rows into unique people (email > phone > name)
  const byKey = new Map<string, Person>();
  let demoSkipped = 0;
  for (const c of candidates) {
    const first = c.prospect_first_name ?? "";
    const last = c.prospect_last_name ?? "";
    const email = c.prospect_email ?? "";
    const phone = c.prospect_phone ?? "";
    if (isDemo(email, first, last)) {
      demoSkipped++;
      continue;
    }
    const person: IncomingPerson = { firstName: first || null, lastName: last || null, email: email || null, phone: phone || null };
    const nEmail = normalizeEmail(email);
    const nPhone = normalizePhone(phone);
    const nName = normalizedPersonName(person);
    const key = nEmail ? `e:${nEmail}` : nPhone ? `p:${nPhone}` : nName ? `n:${nName}` : `id:${c.prospect_id}`;
    const hasHours = HOURS_COLUMNS.some((col) => {
      const v = parseFloat(c[col] ?? "");
      return Number.isFinite(v) && v > 0;
    });
    const found = byKey.get(key);
    if (found) {
      found.prospectIds.push(c.prospect_id);
      found.hasHours = found.hasHours || hasHours;
    } else {
      byKey.set(key, { ...person, prospectIds: [c.prospect_id], hasHours });
    }
  }
  const people = [...byKey.values()];

  return { candidates, applications, jobs, notes, interviews, documents, statusName, candidateRow, appsBy, interviewsBy, notesBy, docsBy, existing, people, demoSkipped };
}

function groupBy(rows: Record<string, string>[], key: string) {
  const m = new Map<string, Record<string, string>[]>();
  for (const r of rows) {
    const k = r[key];
    if (!k) continue;
    (m.get(k) ?? m.set(k, []).get(k)!).push(r);
  }
  return m;
}

// ---------------------------------------------------------------------------
//  COMMIT — writes the import. Reversible via the single HistoricalSource /
//  ImportBatch this creates. Honors --limit N for a small validation batch.
// ---------------------------------------------------------------------------
async function commit() {
  const ctx = await buildContext();
  const targetPeople = LIMIT ? ctx.people.slice(0, LIMIT) : ctx.people;

  console.log(`\n================ JAZZ IMPORT — COMMIT ${LIMIT ? `(first ${LIMIT})` : "(full)"} ================`);
  console.log(`Source: ${DIR}\n`);

  const source = await prisma.historicalSource.create({
    data: { system: "JAZZ", label: SOURCE_LABEL, rootPath: DIR },
  });
  const batch = await prisma.importBatch.create({
    data: { sourceType: "JAZZ_FOLDER", sourceFilename: DIR, status: "RUNNING" },
  });

  // 1) Jobs — import all so applications can link
  const jobIdMap = new Map<string, string>();
  for (const j of ctx.jobs) {
    const created = await prisma.job.create({
      data: {
        title: j.job_title || "Untitled (Jazz)",
        normalizedTitle: normalizeName(j.job_title),
        recruiter: j.job_recruiter || null,
        city: j.job_city || null,
        state: j.job_state || null,
        postal: j.job_postal || null,
        department: j.job_department || null,
        openedDate: parseDate(j.job_open),
        filledDate: parseDate(j.job_filled),
        jobReqId: j.job_req_id || null,
        rawJobDescriptionHtml: j.job_description || null,
        rawMinimumRequirements: j["Minimum Requirements"] || null,
        rawPayScale: j["Pay Scale"] || null,
        status: j.job_filled ? "RETIRED" : "OPEN",
        source: "JAZZ",
        sourceJobId: j.job_id,
        importedAt: new Date(),
      },
    });
    jobIdMap.set(j.job_id, created.id);
  }

  let created = 0;
  let merged = 0;
  let apps = 0;
  let ivs = 0;
  let files = 0;
  let metrics = 0;
  let events = 0;
  let errors = 0;

  const importPerson = async (person: Person) => {
    try {
      const head = ctx.candidateRow.get(person.prospectIds[0])!;
      const match = scoreMatch(person, ctx.existing);
      const displayName = [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || "Unnamed (Jazz)";

      let candidateId: string;
      if (match.decision !== "CREATE" && match.matchedId) {
        candidateId = match.matchedId;
        merged++;
        await prisma.candidate.update({
          where: { id: candidateId },
          data: {
            historicalSourceId: source.id,
            jazzCandidateNumber: head.prospect_id,
            sourceHistoryJson: JSON.stringify({ mergedFromJazz: person.prospectIds, score: match.score, at: new Date().toISOString() }),
          },
        });
      } else {
        const appliedAt = parseDate(head.prospect_date_applied);
        const c = await prisma.candidate.create({
          data: {
            displayName,
            firstName: person.firstName,
            lastName: person.lastName,
            normalizedName: normalizeName(displayName),
            primaryEmail: person.email,
            normalizedEmail: normalizeEmail(person.email),
            primaryPhone: person.phone,
            normalizedPhone: normalizePhone(person.phone),
            source: head.prospect_source || "JazzHR",
            origin: "JAZZ",
            jazzCandidateNumber: head.prospect_id,
            historicalSourceId: source.id,
            status: "ARCHIVED",
            archivedAt: new Date(),
            createdAt: appliedAt ?? undefined,
          },
        });
        candidateId = c.id;
        created++;
      }

      // Aviation hours → CandidateMetric (confirmed, from structured columns)
      for (const col of HOURS_COLUMNS) {
        const v = parseFloat(head[col] ?? "");
        if (Number.isFinite(v) && v > 0) {
          await prisma.candidateMetric.upsert({
            where: { candidateId_key: { candidateId, key: col } },
            create: { candidateId, key: col, label: col, valueNumber: v, unit: "hours", status: "CONFIRMED", sourceSnippet: "Jazz structured field" },
            update: {},
          });
          metrics++;
        }
      }

      for (const pid of person.prospectIds) {
        // Applications
        for (const a of ctx.appsBy.get(pid) ?? []) {
          const sName = ctx.statusName.get(a.prospect_status_id) ?? null;
          const bucket = sName ? statusBucket(sName) : "APPLIED";
          const appliedAt = parseDate(ctx.candidateRow.get(pid)?.prospect_date_applied);
          await prisma.candidateApplication.create({
            data: {
              candidateId,
              jobId: a.job_id ? jobIdMap.get(a.job_id) ?? null : null,
              status: sName,
              disposition: bucket,
              rejectionReason: bucket === "REJECTED" ? sName : null,
              appliedAt,
              origin: "JAZZ",
              jazzApplicationNumber: a.application_id,
              historicalSourceId: source.id,
              source: "JAZZ",
            },
          });
          apps++;
          if (appliedAt) {
            await prisma.timelineEvent.create({ data: { candidateId, type: "APPLIED", title: sName ? `Applied — ${sName}` : "Applied", occurredAt: appliedAt, origin: "JAZZ", sourceType: "Application", sourceId: a.application_id } });
            events++;
          }
        }

        // Interviews — group question rows into one Interview per session
        const sessions = new Map<string, Record<string, string>[]>();
        for (const r of ctx.interviewsBy.get(pid) ?? []) {
          const k = `${r.interviewed_at}|${r.interview_name}|${r.interviewer}`;
          (sessions.get(k) ?? sessions.set(k, []).get(k)!).push(r);
        }
        for (const rows of sessions.values()) {
          const first = rows[0];
          const when = parseDate(first.interviewed_at);
          if (!when) continue;
          const qa = rows
            .filter((r) => r.question)
            .map((r) => ({ q: r.question, rating: r.response_rating || null }));
          await prisma.interview.create({
            data: {
              candidateId,
              title: first.interview_name || "Interview",
              interviewType: "OTHER",
              startDateTime: when,
              interviewer: first.interviewer || null,
              notes: first.interview_notes || (first.decision_text ?? null),
              status: "COMPLETED",
              source: "JAZZ",
              scorecards: qa.length
                ? { create: [{ interviewer: first.interviewer || "Jazz", recommendation: first.decision || null, itemsJson: JSON.stringify(qa), comments: first.decision_text || null }] }
                : undefined,
            },
          });
          ivs++;
          await prisma.timelineEvent.create({ data: { candidateId, type: "INTERVIEWED", title: first.interview_name || "Interviewed", detail: first.interviewer || null, occurredAt: when, origin: "JAZZ", sourceType: "Interview" } });
          events++;
        }

        // Notes
        for (const n of ctx.notesBy.get(pid) ?? []) {
          if (!n.comment_contents) continue;
          await prisma.candidateNote.create({ data: { candidateId, body: n.comment_contents, source: "JAZZ", sourceRef: n.User || null } });
        }

        // Documents / resumes — store the original path, never move the file
        for (const d of ctx.docsBy.get(pid) ?? []) {
          if (d.deleted_at || !d.converted_document_name) continue;
          const onDisk = join(EXPORT_ROOT, d.directory ?? "", d.converted_document_name);
          await prisma.candidateFile.create({
            data: {
              candidateId,
              originalFilename: d.original_document_name || d.converted_document_name,
              displayFilename: d.original_document_name || d.converted_document_name,
              storageKey: null,
              documentType: docType(d.original_document_name),
              source: "JAZZ",
              metadataJson: JSON.stringify({ storageProvider: "jazz-export-local", originalPath: onDisk, directory: d.directory, exists: existsSync(onDisk) }),
            },
          });
          files++;
        }
      }

      await prisma.importRow.create({ data: { importBatchId: batch.id, rawJson: JSON.stringify({ prospectIds: person.prospectIds, decision: match.decision }), status: "DONE", candidateId } });
    } catch (e) {
      errors++;
      await prisma.importRow.create({ data: { importBatchId: batch.id, rawJson: JSON.stringify({ prospectIds: person.prospectIds }), status: "ERROR", errorJson: JSON.stringify({ message: String(e) }) } });
    }
  };

  // Process people in bounded-concurrency batches — ~CONCURRENCY connections in
  // flight at once. Keeps the proven per-person logic but cuts wall-clock ~8x.
  const CONCURRENCY = 8;
  for (let i = 0; i < targetPeople.length; i += CONCURRENCY) {
    await Promise.all(targetPeople.slice(i, i + CONCURRENCY).map(importPerson));
    if (i > 0 && i % 240 === 0) console.log(`  ...processed ${i}/${targetPeople.length}`);
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "COMPLETED", completedAt: new Date(), rowCount: targetPeople.length, importedCount: created + merged, errorCount: errors, summaryJson: JSON.stringify({ created, merged, apps, ivs, files, metrics, events, errors, jobs: jobIdMap.size }) },
  });

  console.log(`HistoricalSource: ${source.id}`);
  console.log(`ImportBatch:      ${batch.id}\n`);
  console.log(`Candidates created ... ${created}`);
  console.log(`Merged into existing . ${merged}`);
  console.log(`Jobs ................. ${jobIdMap.size}`);
  console.log(`Applications ......... ${apps}`);
  console.log(`Interviews ........... ${ivs}`);
  console.log(`Files ................ ${files}`);
  console.log(`Metrics (hours) ...... ${metrics}`);
  console.log(`Timeline events ...... ${events}`);
  console.log(`Errors ............... ${errors}`);
  console.log(`\nTo undo this import:  tsx prisma/import-jazz.ts --undo ${source.id}\n`);
  await prisma.$disconnect();
}

// ---------------------------------------------------------------------------
//  UNDO — reverses an import by its HistoricalSource id. Deletes Jazz-origin
//  candidates (children cascade), Jazz-origin applications added to merged
//  profiles, the Jazz jobs, and the source/batch rows. Merged profiles' own
//  data is never touched.
// ---------------------------------------------------------------------------
async function undo(sourceId: string) {
  console.log(`\n================ JAZZ IMPORT — UNDO ${sourceId} ================\n`);

  // 1) Applications added to MERGED (non-Jazz) candidates — remove just those.
  const apps = await prisma.candidateApplication.deleteMany({
    where: { historicalSourceId: sourceId, candidate: { origin: { not: "JAZZ" } } },
  });

  // 2) Revert merged candidates' Jazz back-links.
  const reverted = await prisma.candidate.updateMany({
    where: { historicalSourceId: sourceId, origin: { not: "JAZZ" } },
    data: { historicalSourceId: null, jazzCandidateNumber: null, sourceHistoryJson: null },
  });

  // 3) Delete Jazz-origin candidates created by this import (children cascade).
  const cands = await prisma.candidate.deleteMany({ where: { origin: "JAZZ", historicalSourceId: sourceId } });

  // 4) Delete the Jazz jobs (only Jazz-sourced rows).
  const jobs = await prisma.job.deleteMany({ where: { source: "JAZZ" } });

  // 5) Remove the batch + source markers.
  await prisma.importRow.deleteMany({ where: { importBatch: { sourceType: "JAZZ_FOLDER" } } });
  await prisma.importBatch.deleteMany({ where: { sourceType: "JAZZ_FOLDER" } });
  await prisma.historicalSource.delete({ where: { id: sourceId } }).catch(() => {});

  console.log(`Deleted Jazz candidates .......... ${cands.count}`);
  console.log(`Reverted merged candidates ....... ${reverted.count}`);
  console.log(`Removed merged-profile apps ...... ${apps.count}`);
  console.log(`Deleted Jazz jobs ................ ${jobs.count}`);
  console.log(`\nUNDO COMPLETE.\n`);
  await prisma.$disconnect();
}

// ---------------------------------------------------------------------------
//  DRY RUN — simulates the import and reports, writing nothing.
// ---------------------------------------------------------------------------
async function dryRun() {
  const ctx = await buildContext();
  const collapsedRows = ctx.candidates.length - ctx.demoSkipped - ctx.people.length;

  let create = 0, autoMerge = 0, review = 0, peopleWithHours = 0;
  const sampleCreate: string[] = [];
  const sampleMatch: string[] = [];
  for (const p of ctx.people) {
    if (p.hasHours) peopleWithHours++;
    const r = scoreMatch(p, ctx.existing);
    const name = [p.firstName, p.lastName].filter(Boolean).join(" ") || "(no name)";
    if (r.decision === "AUTO_MERGE") { autoMerge++; if (sampleMatch.length < 6) sampleMatch.push(`  MERGE [${r.score}] ${name} → "${r.matchedName}" (${r.reasons.join(", ")})`); }
    else if (r.decision === "REVIEW") { review++; if (sampleMatch.length < 6) sampleMatch.push(`  REVIEW[${r.score}] ${name} ~ "${r.matchedName}" (${r.reasons.join(", ")})`); }
    else { create++; if (sampleCreate.length < 6) sampleCreate.push(`  CREATE ${name} <${p.email ?? "—"}>  (${p.prospectIds.length} app(s))`); }
  }

  const buckets: Record<string, number> = { APPLIED: 0, INTERVIEWED: 0, OFFER: 0, REJECTED: 0, HIRED: 0 };
  let appsWithJob = 0;
  for (const a of ctx.applications) {
    if (a.job_id) appsWithJob++;
    const sName = ctx.statusName.get(a.prospect_status_id);
    buckets[sName ? statusBucket(sName) : "APPLIED"]++;
  }
  const interviewProspects = new Set(ctx.interviews.map((i) => i.prospect_id));
  let docsResolvable = 0, docsMissing = 0, docsDeleted = 0;
  for (const d of ctx.documents) {
    if (d.deleted_at) { docsDeleted++; continue; }
    const path = join(EXPORT_ROOT, d.directory ?? "", d.converted_document_name ?? "");
    if (d.converted_document_name && existsSync(path)) docsResolvable++; else docsMissing++;
  }

  console.log("\n================ JAZZ IMPORT — DRY RUN (no writes) ================");
  console.log(`Source: ${DIR}\n`);
  console.log("CANDIDATES");
  console.log(`  Rows .............................. ${ctx.candidates.length}`);
  console.log(`  Demo skipped / dup-collapsed ...... ${ctx.demoSkipped} / ${collapsedRows}`);
  console.log(`  => Unique people .................. ${ctx.people.length}  (${peopleWithHours} with pilot hours)`);
  console.log(`     New / merge / review ........... ${create} / ${autoMerge} / ${review}`);
  console.log("\nAPPLICATIONS");
  console.log(`  Rows / job-linked ................. ${ctx.applications.length} / ${appsWithJob} (${pct(appsWithJob, ctx.applications.length)})`);
  for (const [k, v] of Object.entries(buckets)) console.log(`    ${k.padEnd(12)} ${v}  (${pct(v, ctx.applications.length)})`);
  console.log("\nJOBS / INTERVIEWS / NOTES / DOCS");
  console.log(`  Jobs / interviews / people-w-iv ... ${ctx.jobs.length} / ${ctx.interviews.length} / ${interviewProspects.size}`);
  console.log(`  Docs resolvable / missing / del ... ${docsResolvable} / ${docsMissing} / ${docsDeleted}`);
  console.log("\nSAMPLE — new:");
  sampleCreate.forEach((s) => console.log(s));
  console.log("\nSAMPLE — matches:");
  sampleMatch.forEach((s) => console.log(s));
  console.log("\nDRY RUN COMPLETE — nothing written.\n");
  await prisma.$disconnect();
}

async function main() {
  if (UNDO) await undo(UNDO);
  else if (COMMIT) await commit();
  else await dryRun();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
