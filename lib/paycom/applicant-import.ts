import { createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { PDFDocument } from "pdf-lib";
import { prisma } from "@/lib/prisma";
import { getFileStorageAdapter } from "@/lib/files/storage-adapter";
import { createCandidateStorageKey, isSupportedCandidateFile, sanitizeFilename } from "@/lib/files/candidate-file-storage";
import { extractFileText } from "@/lib/files/pdf-text";
import { searchFieldsForFile } from "@/lib/files/pdf-form";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import { isMergedAway, resolveMergedAway } from "@/lib/candidates/merged-guard";
import { confidentJobForTitle, suggestJobsForTitle, type MatchableJob } from "@/lib/jobs/paycom-title-match";
import { PAYCOM_TITLE_ALIASES } from "@/lib/jobs/paycom-title-aliases";
import { detectSeat, extractAircraftTypes, isPilotTitle } from "@/lib/imports/job-import";
import { mountainMidnight, parseResumeEntryName, splitBundle, type ParsedApplication } from "@/lib/paycom/applicant-bundle";

/**
 * The Paycom applicant upload: Paycom's two document zips in, candidates out.
 *
 * WHY. Paycom is where applications arrive and it will not integrate, so the app
 * falls behind: before this, the last bulk Paycom applicant import covered data
 * through about Dec 2025, and October 2026's 103 applications were in the app only
 * where somebody had typed them in. This makes catching up one upload.
 *
 * THREE STEPS, and only the last two write anything:
 *   preview  read the uploads, split the bundles (lib/paycom/applicant-bundle.ts),
 *            work out for every application who it is and which job. Nothing is
 *            written except the batch's own summary.
 *   apply    the applications the person ticked, in small chunks so no request runs
 *            long. Each one becomes an ImportRow holding exactly what it changed.
 *   undo     reverses a batch from those rows.
 *
 * RE-UPLOADING IS SAFE. An application whose Paycom Application ID is already on a
 * CandidateApplication (sourceApplicationId — the same column the Sep 2026 hiring
 * metrics import filled) is skipped. So the export's date range never has to be
 * exact: "the last 7 days" every few days overlaps harmlessly.
 *
 * WHO IT IS — email, then phone, then name, the same order as document intake.
 * Email or phone naming ONE person is a match. A name alone is never acted on by
 * itself: "John Davis" and "James Webster" are common enough that an old record of
 * the same name is as likely somebody else, so a name-only match is shown as a
 * decision with the existing person offered. A merged-away record is followed to
 * the record it was merged into.
 *
 * WHICH JOB — his own title answers first (lib/jobs/paycom-title-aliases.ts), then
 * the title matcher's confident tier (lib/jobs/paycom-title-match.ts). Otherwise a
 * job is created under the posting's title, his answer on 2026-10-25: "if it
 * matches an existing use it, otherwise create the job automatically". A matched job
 * that is not OPEN is reopened — also his answer that day, for jobs retired here
 * that Paycom is still taking applications for — except when Paycom itself labels
 * the posting "CLOSED - ...": that application is history and the job stays shut.
 */

export const SOURCE_TYPE = "PAYCOM_APPLICANTS";
const SOURCE = "Paycom applicant upload";
const CREATED_JOB_SOURCE = "Created from Paycom applications";

// ---------------------------------------------------------------- reading the uploads

export type UploadedFile = { name: string; bytes: Uint8Array };

export type ResumeEntry = { applicationId: string; entryName: string; originalName: string; bytes: Uint8Array };

export type ReadExport = {
  bundles: Array<{ name: string; bytes: Uint8Array }>;
  applications: ParsedApplication[];
  resumes: Map<string, ResumeEntry>;
  problems: string[];
};

function entriesOf(file: UploadedFile): Array<{ name: string; bytes: Uint8Array }> {
  if (!/\.zip$/i.test(file.name)) return [file];
  const unzipped = unzipSync(file.bytes);
  return Object.entries(unzipped)
    .filter(([name, bytes]) => !name.endsWith("/") && !name.startsWith("__MACOSX/") && bytes.length > 0)
    .map(([name, bytes]) => ({ name: name.split("/").pop() ?? name, bytes }));
}

async function pageTexts(bytes: Uint8Array): Promise<string[]> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // unpdf takes ownership of the buffer it is given, so hand it a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: false });
  return Array.isArray(text) ? text : [text];
}

/**
 * Sort the uploads into bundles and resumes. Either zip, the PDFs out of them, or
 * both zips at once all work: a "(<digits>)-" name is a resume, any other PDF is
 * read as a bundle (and reported if it holds no applications).
 */
export async function readExport(files: UploadedFile[], opts: { withText?: boolean } = { withText: true }): Promise<ReadExport> {
  const bundles: ReadExport["bundles"] = [];
  const resumes = new Map<string, ResumeEntry>();
  const problems: string[] = [];

  for (const file of files) {
    let entries: Array<{ name: string; bytes: Uint8Array }>;
    try {
      entries = entriesOf(file);
    } catch {
      problems.push(`${file.name} could not be opened as a zip.`);
      continue;
    }
    for (const entry of entries) {
      const resume = parseResumeEntryName(entry.name);
      if (resume) {
        if (resumes.has(resume.applicationId)) {
          problems.push(`Two resumes carry Application ID ${resume.applicationId}; kept ${resumes.get(resume.applicationId)?.entryName}.`);
        } else {
          resumes.set(resume.applicationId, { ...resume, entryName: entry.name, bytes: entry.bytes });
        }
      } else if (/\.pdf$/i.test(entry.name)) {
        bundles.push(entry);
      } else {
        problems.push(`${entry.name} is not a PDF and was ignored.`);
      }
    }
  }
  bundles.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  const applications: ParsedApplication[] = [];
  if (opts.withText !== false) {
    const seen = new Set<string>();
    for (const [index, bundle] of bundles.entries()) {
      const split = splitBundle(await pageTexts(bundle.bytes), index);
      for (const p of split.problems) problems.push(`${bundle.name}: ${p.message}`);
      for (const app of split.applications) {
        if (seen.has(app.applicationId)) {
          problems.push(`${bundle.name}: Application ID ${app.applicationId} appears twice; the second copy was skipped.`);
          continue;
        }
        seen.add(app.applicationId);
        applications.push(app);
      }
    }
  }
  return { bundles, applications, resumes, problems };
}

// ---------------------------------------------------------------- who is it

export type CandidateHit = {
  id: string;
  displayName: string;
  status: string;
  archived: boolean;
  /** Archived because they are a current employee — linked, never reactivated. */
  employed: boolean;
  /** The record the match landed on had been merged into this one. */
  viaMergedName: string | null;
};

export type CandidateMatch =
  | { kind: "existing"; by: "email" | "phone"; hit: CandidateHit }
  | { kind: "decide"; by: "email" | "phone" | "name"; options: CandidateHit[] }
  | { kind: "new" };

async function toLiveHits(rows: Array<{ id: string; displayName: string; status: string; mergeHistoryJson: string | null }>): Promise<CandidateHit[]> {
  const out = new Map<string, CandidateHit>();
  for (const row of rows) {
    let id = row.id;
    let viaMergedName: string | null = null;
    if (isMergedAway(row)) {
      const resolved = await resolveMergedAway(row);
      if (!resolved.merged || !resolved.keeper) continue; // a tombstone with no live keeper is not a person to attach to
      id = resolved.keeper.id;
      viaMergedName = row.displayName;
    }
    if (out.has(id)) continue;
    const live = await prisma.candidate.findUnique({
      where: { id },
      select: { id: true, displayName: true, status: true, archivedAt: true }
    });
    if (!live) continue;
    const employed = live.archivedAt
      ? Boolean(
          await prisma.newHire.findFirst({
            where: { candidateId: id, stage: { in: ["ACTIVE", "POST_ONBOARD"] }, NOT: { employmentStatus: "TERMINATED" } },
            select: { id: true }
          })
        )
      : false;
    out.set(id, { id, displayName: live.displayName, status: live.status, archived: Boolean(live.archivedAt), employed, viaMergedName });
  }
  return [...out.values()];
}

const CANDIDATE_SELECT = { id: true, displayName: true, status: true, mergeHistoryJson: true } as const;

export async function matchCandidate(app: Pick<ParsedApplication, "email" | "phone" | "firstName" | "lastName" | "displayName">): Promise<CandidateMatch> {
  const email = normalizeEmail(app.email);
  if (email) {
    const contactIds = (await prisma.candidateContact.findMany({ where: { normalized: email }, select: { candidateId: true } })).map((c) => c.candidateId);
    const rows = await prisma.candidate.findMany({
      where: { OR: [{ normalizedEmail: email }, { id: { in: contactIds } }] },
      select: CANDIDATE_SELECT
    });
    const hits = await toLiveHits(rows);
    if (hits.length === 1) return { kind: "existing", by: "email", hit: hits[0] };
    if (hits.length > 1) return { kind: "decide", by: "email", options: hits };
  }

  const phone = normalizePhone(app.phone);
  if (phone) {
    const contactIds = (await prisma.candidateContact.findMany({ where: { normalized: phone }, select: { candidateId: true } })).map((c) => c.candidateId);
    const rows = await prisma.candidate.findMany({
      where: { OR: [{ normalizedPhone: phone }, { id: { in: contactIds } }] },
      select: CANDIDATE_SELECT
    });
    const hits = await toLiveHits(rows);
    if (hits.length === 1) return { kind: "existing", by: "phone", hit: hits[0] };
    if (hits.length > 1) return { kind: "decide", by: "phone", options: hits };
  }

  const name = normalizeName(app.displayName);
  const nameRows = await prisma.candidate.findMany({
    where: {
      OR: [
        ...(name ? [{ normalizedName: name }] : []),
        ...(app.firstName && app.lastName
          ? [{ firstName: { equals: app.firstName, mode: "insensitive" as const }, lastName: { equals: app.lastName, mode: "insensitive" as const } }]
          : [])
      ]
    },
    select: CANDIDATE_SELECT,
    take: 10
  });
  const nameHits = nameRows.length ? await toLiveHits(nameRows) : [];
  if (nameHits.length) return { kind: "decide", by: "name", options: nameHits };
  return { kind: "new" };
}

// ---------------------------------------------------------------- which job

/** Paycom prefixes a closed posting's title with "CLOSED - ". */
function splitClosed(title: string): { closed: boolean; title: string } {
  const m = title.match(/^\s*closed\s*-\s*(.+)$/i);
  return m ? { closed: true, title: m[1].trim() } : { closed: false, title: title.trim() };
}

/**
 * The title a NEW job is given: the posting's own words, minus the ad copy. Pay in
 * particular stays off — no pay amount is stored in this app (Paycom owns comp).
 */
export function jobTitleForNewJob(paycomTitle: string): string {
  return splitClosed(paycomTitle)
    .title.replace(/\([^)]*(?:\$|\d+k\b)[^)]*\)/gi, " ")
    .replace(/\(?\+?\s*(?:plus\s+(?:a\s+)?)?(?:up\s+to\s+)?\$\s?[\d,.]+\s*k?\s*sign[\s-]*on\s+bonus!?\)?/gi, " ")
    .replace(/\$\s?[\d,.]+\s*k?(?:\s*-\s*\$?\s?[\d,.]+\s*k?)?/gi, " ")
    .replace(/\s*[|-]\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type JobResolution = {
  paycomTitle: string;
  closedPosting: boolean;
  match: { jobId: string; title: string; status: string; via: "your answer" | "same title" } | null;
  /** Shown when there is no match, so a near-miss is visible before a job is created. */
  suggestions: Array<{ jobId: string; title: string; status: string }>;
  newJobTitle: string;
};

export async function loadMatchableJobs(): Promise<MatchableJob[]> {
  return prisma.job.findMany({ select: { id: true, title: true, status: true, mergedIntoJobId: true, city: true, state: true } });
}

export function resolveJob(paycomTitle: string, jobs: MatchableJob[]): JobResolution {
  const { closed, title } = splitClosed(paycomTitle);
  const live = jobs.filter((j) => !j.mergedIntoJobId && j.status !== "MERGED");
  const alias = PAYCOM_TITLE_ALIASES[paycomTitle] ?? PAYCOM_TITLE_ALIASES[title];
  let match: JobResolution["match"] = null;
  if (alias) {
    const hits = live.filter((j) => j.title.trim().toLowerCase() === alias.trim().toLowerCase());
    if (hits.length === 1) match = { jobId: hits[0].id, title: hits[0].title, status: hits[0].status, via: "your answer" };
  }
  if (!match) {
    const confident = confidentJobForTitle(title, jobs);
    if (confident) match = { jobId: confident.jobId, title: confident.title, status: confident.status, via: "same title" };
  }
  return {
    paycomTitle,
    closedPosting: closed,
    match,
    suggestions: match ? [] : suggestJobsForTitle(title, jobs, 3).map((s) => ({ jobId: s.jobId, title: s.title, status: s.status })),
    newJobTitle: jobTitleForNewJob(paycomTitle)
  };
}

// ---------------------------------------------------------------- preview

export type PreviewRow = {
  applicationId: string;
  displayName: string;
  paycomName: string;
  email: string | null;
  phone: string | null;
  appliedOn: string | null;
  jobTitle: string;
  referral: string | null;
  pages: number;
  resumeName: string | null;
  alreadyImported: boolean;
  candidate: CandidateMatch;
};

export type Preview = {
  rows: PreviewRow[];
  jobs: Array<JobResolution & { count: number }>;
  problems: string[];
  resumesWithoutApplication: string[];
};

export async function buildPreview(read: ReadExport): Promise<Preview> {
  const ids = read.applications.map((a) => a.applicationId);
  const done = new Set(
    (
      await prisma.candidateApplication.findMany({ where: { sourceApplicationId: { in: ids } }, select: { sourceApplicationId: true } })
    ).map((a) => a.sourceApplicationId)
  );

  const rows: PreviewRow[] = [];
  for (const app of read.applications) {
    const resume = read.resumes.get(app.applicationId);
    rows.push({
      applicationId: app.applicationId,
      displayName: app.displayName,
      paycomName: app.paycomName,
      email: app.email,
      phone: app.phone,
      appliedOn: app.appliedOn,
      jobTitle: app.jobTitle,
      referral: [app.referralSource, app.referralName].filter(Boolean).join(" — ") || null,
      pages: app.endPage - app.startPage + 1,
      resumeName: resume?.originalName ?? null,
      alreadyImported: done.has(app.applicationId),
      candidate: done.has(app.applicationId) ? { kind: "new" } : await matchCandidate(app)
    });
  }

  const jobs = await loadMatchableJobs();
  const titles = new Map<string, number>();
  for (const r of rows) if (!r.alreadyImported) titles.set(r.jobTitle, (titles.get(r.jobTitle) ?? 0) + 1);
  const resolutions = [...titles.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([title, count]) => ({ ...resolveJob(title, jobs), count }));

  const appIds = new Set(ids);
  return {
    rows,
    jobs: resolutions,
    problems: read.problems,
    resumesWithoutApplication: [...read.resumes.values()].filter((r) => !appIds.has(r.applicationId)).map((r) => r.entryName)
  };
}

// ---------------------------------------------------------------- apply

/** What the person decided on the preview screen. */
export type ApplyChoices = {
  /** applicationId -> an existing candidate id, or "new". Required for a "decide" row. */
  candidates: Record<string, string>;
  /** Paycom title -> an existing job id, or "new". Absent = the automatic answer. */
  jobs: Record<string, string>;
  /** Job ids the person UNticked "reopen" for. */
  keepClosed: string[];
};

/** Everything one application changed — the ImportRow keeps it, and undo reads it back. */
export type RowUndo = {
  candidateId: string;
  candidateCreated: boolean;
  filled: Record<string, null>;
  contactIds: string[];
  reactivated: { archivedAt: string | null; status: string } | null;
  jobId: string;
  jobCreated: boolean;
  jobReopenedFrom: string | null;
  applicationId: string;
  applicationCreated: boolean;
  applicationPrior: Record<string, unknown> | null;
  fileIds: string[];
};

export type ApplyOutcome =
  | { applicationId: string; result: "imported"; candidateId: string; candidateName: string; jobTitle: string; notes: string[] }
  | { applicationId: string; result: "skipped" | "error"; reason: string };

type ApplyContext = {
  batchId: string;
  read: ReadExport;
  choices: ApplyChoices;
  pdfCache: Map<number, PDFDocument>;
  userEmail: string | null;
};

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function bundlePdf(ctx: ApplyContext, index: number): Promise<PDFDocument> {
  let doc = ctx.pdfCache.get(index);
  if (!doc) {
    doc = await PDFDocument.load(ctx.read.bundles[index].bytes);
    ctx.pdfCache.set(index, doc);
  }
  return doc;
}

async function applicationPdf(ctx: ApplyContext, app: ParsedApplication): Promise<Uint8Array> {
  const src = await bundlePdf(ctx, app.bundleIndex);
  const out = await PDFDocument.create();
  const pages = await out.copyPages(src, Array.from({ length: app.endPage - app.startPage + 1 }, (_, i) => app.startPage + i));
  pages.forEach((p) => out.addPage(p));
  return out.save();
}

async function chooseCandidate(ctx: ApplyContext, app: ParsedApplication): Promise<{ hit: CandidateHit | null } | { refuse: string }> {
  const choice = ctx.choices.candidates[app.applicationId];
  if (choice && choice !== "new") {
    const row = await prisma.candidate.findUnique({ where: { id: choice }, select: CANDIDATE_SELECT });
    const hits = row ? await toLiveHits([row]) : [];
    return hits.length ? { hit: hits[0] } : { refuse: "The person chosen for this application no longer exists." };
  }
  const match = await matchCandidate(app);
  if (match.kind === "existing") return { hit: match.hit };
  if (match.kind === "new") return { hit: null };
  // A "decide" row: only an explicit "new" goes ahead without a person. (A sibling
  // created earlier in this same upload — the second of David Linn's three
  // applications — has already been found above by email, before this point.)
  if (choice === "new") return { hit: null };
  return { refuse: `Needs a decision: ${match.by} matches ${match.options.map((o) => o.displayName).join(", ")}.` };
}

async function chooseJob(ctx: ApplyContext, app: ParsedApplication, notes: string[]) {
  const jobs = await loadMatchableJobs();
  const resolution = resolveJob(app.jobTitle, jobs);
  const choice = ctx.choices.jobs[app.jobTitle];
  const marker = `${SOURCE_TYPE}:${ctx.batchId}`;

  let target: { id: string; title: string; status: string } | null = null;
  if (choice && choice !== "new") {
    const j = await prisma.job.findUnique({ where: { id: choice }, select: { id: true, title: true, status: true, mergedIntoJobId: true } });
    if (!j) throw new Error("The job chosen for this title no longer exists.");
    target = j;
  } else if (!choice && resolution.match) {
    target = { id: resolution.match.jobId, title: resolution.match.title, status: resolution.match.status };
  }

  if (!target) {
    // "new": created ONCE per upload — a later row (or a later chunk) with the same
    // title finds the job this upload already made rather than making a second.
    const made = await prisma.job.findFirst({ where: { sourceFilename: marker, title: resolution.newJobTitle }, select: { id: true, title: true, status: true } });
    if (made) return { job: made, created: false, reopenedFrom: null };
    const pilot = isPilotTitle(resolution.newJobTitle);
    const aircraft = extractAircraftTypes(resolution.newJobTitle);
    const job = await prisma.job.create({
      data: {
        title: resolution.newJobTitle,
        normalizedTitle: resolution.newJobTitle.toLowerCase().replace(/\s+/g, " ").trim(),
        status: resolution.closedPosting ? "RETIRED" : "OPEN",
        source: CREATED_JOB_SOURCE,
        sourceFilename: marker,
        importedAt: new Date(),
        openedDate: app.appliedOn ? mountainMidnight(app.appliedOn) : new Date(),
        isPilotRole: pilot,
        isPilotLeadershipRole: /\b(chief pilot|assistant chief pilot)\b/i.test(resolution.newJobTitle),
        pilotSeat: pilot ? detectSeat(resolution.newJobTitle) : null,
        aircraftTypesJson: aircraft.length ? JSON.stringify(aircraft) : null,
        roleCategory: pilot ? "Pilot" : null,
        originalFieldsJson: JSON.stringify({ paycomTitle: app.jobTitle })
      },
      select: { id: true, title: true, status: true }
    });
    notes.push(`Created job "${job.title}"${resolution.closedPosting ? " (retired — Paycom marks the posting closed)" : ""}.`);
    return { job, created: true, reopenedFrom: null };
  }

  let reopenedFrom: string | null = null;
  const reopen = target.status !== "OPEN" && target.status !== "MERGED" && !resolution.closedPosting && !ctx.choices.keepClosed.includes(target.id);
  if (reopen) {
    // updateMany with the old status in the WHERE: two chunks racing cannot both
    // record themselves as the one that reopened it.
    const res = await prisma.job.updateMany({ where: { id: target.id, status: target.status }, data: { status: "OPEN" } });
    if (res.count === 1) {
      reopenedFrom = target.status;
      notes.push(`Reopened "${target.title}" (was ${target.status.toLowerCase()}).`);
    }
  }
  return { job: target, created: false, reopenedFrom };
}

async function fileDocument(
  ctx: ApplyContext,
  input: { candidateId: string; bytes: Uint8Array; displayFilename: string; originalFilename: string; documentType: string; app: ParsedApplication }
): Promise<string> {
  const storage = getFileStorageAdapter();
  const filename = sanitizeFilename(input.displayFilename);
  const storageKey = createCandidateStorageKey(input.candidateId, filename);
  const buffer = Buffer.from(input.bytes);
  await storage.write({
    storageKey,
    bytes: buffer,
    contentType: "application/pdf",
    metadata: { candidateId: input.candidateId, source: "paycom-applicant-upload", paycomApplicationId: input.app.applicationId }
  });
  const extractedText = await extractFileText(buffer, "application/pdf", filename);
  const searchFields = await searchFieldsForFile(buffer, "application/pdf", filename);
  const created = await prisma.candidateFile.create({
    data: {
      candidateId: input.candidateId,
      originalFilename: sanitizeFilename(input.originalFilename),
      displayFilename: filename,
      storageKey,
      mimeType: "application/pdf",
      sizeBytes: buffer.byteLength,
      source: "paycom-applicant-upload",
      documentType: input.documentType,
      extractedText: extractedText || null,
      textExtractedAt: extractedText ? new Date() : null,
      ...searchFields,
      metadataJson: JSON.stringify({
        linkedBy: "paycom-applicant-upload",
        linkedAt: new Date().toISOString(),
        importBatchId: ctx.batchId,
        paycomApplicationId: input.app.applicationId,
        sha256: sha256(input.bytes),
        storageProvider: storage.provider
      })
    },
    select: { id: true }
  });
  return created.id;
}

/** A filename the person does not already have on their profile. */
async function freeName(candidateId: string, wanted: string, alternative: string): Promise<string> {
  const taken = await prisma.candidateFile.findFirst({ where: { candidateId, displayFilename: wanted, archivedAt: null }, select: { id: true } });
  return taken ? alternative : wanted;
}

async function applyOne(ctx: ApplyContext, app: ParsedApplication): Promise<ApplyOutcome> {
  const id = app.applicationId;
  if (await prisma.candidateApplication.findFirst({ where: { sourceApplicationId: id }, select: { id: true } })) {
    return { applicationId: id, result: "skipped", reason: "Already in the app." };
  }
  const chosen = await chooseCandidate(ctx, app);
  if ("refuse" in chosen) return { applicationId: id, result: "skipped", reason: chosen.refuse };

  const notes: string[] = [];
  const undo: RowUndo = {
    candidateId: "",
    candidateCreated: false,
    filled: {},
    contactIds: [],
    reactivated: null,
    jobId: "",
    jobCreated: false,
    jobReopenedFrom: null,
    applicationId: "",
    applicationCreated: false,
    applicationPrior: null,
    fileIds: []
  };
  const email = app.email?.trim() ?? null;
  const nEmail = normalizeEmail(email);
  const nPhone = normalizePhone(app.phone);

  // The ImportRow is written FIRST and updated as each piece lands, so a request
  // that dies halfway still leaves a record undo can read.
  const importRow = await prisma.importRow.create({
    data: { importBatchId: ctx.batchId, rawJson: JSON.stringify({ application: app, undo }), status: "RUNNING" },
    select: { id: true }
  });
  const save = (status: string, extra: { candidateId?: string; jobId?: string; warning?: string } = {}) =>
    prisma.importRow.update({
      where: { id: importRow.id },
      data: {
        rawJson: JSON.stringify({ application: app, undo }),
        status,
        ...(extra.candidateId ? { candidateId: extra.candidateId } : {}),
        ...(extra.jobId ? { jobId: extra.jobId } : {}),
        ...(extra.warning ? { warningJson: JSON.stringify({ notes: [extra.warning] }) } : {})
      }
    });

  try {
    // ---- the person
    let candidate: { id: string; displayName: string };
    if (chosen.hit) {
      candidate = { id: chosen.hit.id, displayName: chosen.hit.displayName };
      undo.candidateId = candidate.id;
      if (chosen.hit.viaMergedName) notes.push(`${chosen.hit.viaMergedName} had been merged into ${chosen.hit.displayName}.`);
      const current = await prisma.candidate.findUniqueOrThrow({
        where: { id: candidate.id },
        select: { firstName: true, lastName: true, primaryEmail: true, normalizedEmail: true, primaryPhone: true, normalizedPhone: true, archivedAt: true, status: true }
      });
      // Fill BLANKS only — never overwrite what somebody entered.
      const fill: Record<string, string> = {};
      if (!current.firstName && app.firstName) fill.firstName = app.firstName;
      if (!current.lastName && app.lastName) fill.lastName = app.lastName;
      if (!current.primaryEmail && email) fill.primaryEmail = email;
      if (!current.normalizedEmail && nEmail) fill.normalizedEmail = nEmail;
      if (!current.primaryPhone && app.phone) fill.primaryPhone = app.phone;
      if (!current.normalizedPhone && nPhone) fill.normalizedPhone = nPhone;
      if (Object.keys(fill).length) {
        await prisma.candidate.update({ where: { id: candidate.id }, data: fill });
        for (const key of Object.keys(fill)) undo.filled[key] = null;
      }
      if (current.archivedAt) {
        if (chosen.hit.employed) {
          notes.push(`${candidate.displayName} is a current employee, so the profile was left archived.`);
        } else {
          await prisma.candidate.update({ where: { id: candidate.id }, data: { archivedAt: null, status: "ACTIVE" } });
          undo.reactivated = { archivedAt: current.archivedAt.toISOString(), status: current.status };
          notes.push(`Brought ${candidate.displayName} back from archived.`);
        }
      }
    } else {
      const created = await prisma.candidate.create({
        data: {
          firstName: app.firstName,
          lastName: app.lastName,
          displayName: app.displayName,
          normalizedName: normalizeName(app.displayName),
          primaryEmail: email,
          normalizedEmail: nEmail,
          primaryPhone: app.phone,
          normalizedPhone: nPhone,
          status: "ACTIVE",
          stage: "Applied",
          source: SOURCE,
          origin: "PAYCOM"
        },
        select: { id: true, displayName: true }
      });
      candidate = created;
      undo.candidateId = created.id;
      undo.candidateCreated = true;
    }
    await save("RUNNING", { candidateId: candidate.id });

    // Contact rows, so a later email or phone lookup finds them however the
    // candidate's primary fields read.
    for (const [type, value, normalized] of [
      ["EMAIL", email, nEmail],
      ["PHONE", app.phone, nPhone]
    ] as const) {
      if (!value || !normalized) continue;
      const exists = await prisma.candidateContact.findFirst({ where: { candidateId: candidate.id, normalized }, select: { id: true } });
      if (exists) continue;
      const contact = await prisma.candidateContact.create({
        data: { candidateId: candidate.id, type, value, normalized, isPrimary: undo.candidateCreated, source: SOURCE },
        select: { id: true }
      });
      undo.contactIds.push(contact.id);
    }

    // ---- the job
    const { job, created: jobCreated, reopenedFrom } = await chooseJob(ctx, app, notes);
    undo.jobId = job.id;
    undo.jobCreated = jobCreated;
    undo.jobReopenedFrom = reopenedFrom;
    await save("RUNNING", { jobId: job.id });

    // ---- the application. A row somebody made by hand for this person and job
    // (typed in, or from the Adobe Sign pilot application) IS this application:
    // it is given the Paycom id instead of a second row being made beside it.
    const appliedAt = app.appliedOn ? mountainMidnight(app.appliedOn) : null;
    const handMade = await prisma.candidateApplication.findFirst({
      where: { candidateId: candidate.id, jobId: job.id, sourceApplicationId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, appliedAt: true, historicalJobTitle: true, referralSource: true, referralName: true }
    });
    if (handMade) {
      const data: Record<string, unknown> = { sourceApplicationId: id };
      const prior: Record<string, unknown> = { sourceApplicationId: null };
      const fillBlank = (field: string, current: unknown, value: unknown) => {
        if (current || !value) return;
        data[field] = value;
        prior[field] = null;
      };
      fillBlank("appliedAt", handMade.appliedAt, appliedAt);
      fillBlank("historicalJobTitle", handMade.historicalJobTitle, app.jobTitle);
      fillBlank("referralSource", handMade.referralSource, app.referralSource);
      fillBlank("referralName", handMade.referralName, app.referralName);
      await prisma.candidateApplication.update({ where: { id: handMade.id }, data });
      undo.applicationId = handMade.id;
      undo.applicationPrior = prior;
      notes.push("Matched the application already entered by hand for this job.");
    } else {
      const created = await prisma.candidateApplication.create({
        data: {
          candidateId: candidate.id,
          jobId: job.id,
          sourceApplicationId: id,
          status: "New",
          stage: "Applied",
          source: SOURCE,
          origin: "PAYCOM",
          appliedAt,
          historicalJobTitle: app.jobTitle,
          referralSource: app.referralSource,
          referralName: app.referralName
        },
        select: { id: true }
      });
      undo.applicationId = created.id;
      undo.applicationCreated = true;
    }
    await save("RUNNING");

    // ---- the two documents
    const appBytes = await applicationPdf(ctx, app);
    const appName = await freeName(
      candidate.id,
      `${candidate.displayName} Paycom Application.pdf`,
      `${candidate.displayName} Paycom Application - ${jobTitleForNewJob(app.jobTitle)}.pdf`
    );
    undo.fileIds.push(
      await fileDocument(ctx, {
        candidateId: candidate.id,
        bytes: appBytes,
        displayFilename: appName,
        originalFilename: `Paycom Application ${id}.pdf`,
        documentType: "Paycom Application",
        app
      })
    );
    await save("RUNNING");

    const resume = ctx.read.resumes.get(id);
    if (!resume) {
      notes.push("No resume in the upload for this application.");
    } else if (!isSupportedCandidateFile(resume.entryName)) {
      notes.push(`Resume "${resume.originalName}" is a file type the app does not store.`);
    } else {
      const hash = sha256(resume.bytes);
      const same = await prisma.candidateFile.findFirst({
        where: { candidateId: candidate.id, archivedAt: null, metadataJson: { contains: hash } },
        select: { id: true }
      });
      if (same) {
        notes.push("Same resume as one already on the profile — not added twice.");
      } else {
        const resumeName = await freeName(
          candidate.id,
          `${candidate.displayName} Resume.pdf`,
          `${candidate.displayName} Resume ${app.appliedOn ?? id}.pdf`
        );
        undo.fileIds.push(
          await fileDocument(ctx, {
            candidateId: candidate.id,
            bytes: resume.bytes,
            displayFilename: resumeName,
            originalFilename: resume.originalName,
            documentType: "Resume",
            app
          })
        );
      }
    }

    await save("IMPORTED", notes.length ? { warning: notes.join(" ") } : {});
    return { applicationId: id, result: "imported", candidateId: candidate.id, candidateName: candidate.displayName, jobTitle: job.title, notes };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.importRow.update({
      where: { id: importRow.id },
      data: { rawJson: JSON.stringify({ application: app, undo }), status: "ERROR", errorJson: JSON.stringify({ message }) }
    });
    return { applicationId: id, result: "error", reason: message };
  }
}

export async function applyApplications(input: {
  batchId: string;
  read: ReadExport;
  applicationIds: string[];
  choices: ApplyChoices;
  userEmail: string | null;
}): Promise<ApplyOutcome[]> {
  const ctx: ApplyContext = { batchId: input.batchId, read: input.read, choices: input.choices, pdfCache: new Map(), userEmail: input.userEmail };
  const byId = new Map(input.read.applications.map((a) => [a.applicationId, a]));
  const outcomes: ApplyOutcome[] = [];
  // One at a time, in order: the second of somebody's applications must see the
  // candidate the first one created.
  for (const id of input.applicationIds) {
    const app = byId.get(id);
    if (!app) {
      outcomes.push({ applicationId: id, result: "error", reason: "Not in this upload." });
      continue;
    }
    outcomes.push(await applyOne(ctx, app));
  }
  return outcomes;
}

// ---------------------------------------------------------------- undo

export type UndoReport = { undone: number; keptBecauseWorked: string[]; notes: string[] };

/**
 * Put a batch back. Reverse order, row by row, from what each ImportRow recorded.
 *
 * It refuses to throw away work done SINCE the import: an application whose status
 * is no longer "New", or that has an interview, is left exactly where it is and
 * named in the report — undo is for a mistaken upload, not for erasing a screening
 * somebody has started. A person this upload created is deleted only when nothing
 * else is attached to them by then.
 *
 * The stored file objects stay in the bucket; only their rows go. The storage
 * adapter has no delete, and an orphaned object is harmless where a missing one
 * is not (see the Jul 27 2026 S3 incident in CLAUDE.md).
 */
export async function undoBatch(batchId: string): Promise<UndoReport> {
  const rows = await prisma.importRow.findMany({
    where: { importBatchId: batchId, status: { in: ["IMPORTED", "RUNNING", "ERROR"] } },
    orderBy: { createdAt: "desc" }
  });
  const report: UndoReport = { undone: 0, keptBecauseWorked: [], notes: [] };

  for (const row of rows) {
    const { application, undo } = JSON.parse(row.rawJson) as { application: ParsedApplication; undo: RowUndo };
    const label = `${application.displayName} (${application.applicationId})`;

    if (undo.applicationId) {
      const appRow = await prisma.candidateApplication.findUnique({
        where: { id: undo.applicationId },
        select: { id: true, status: true }
      });
      const interviews = await prisma.interview.count({ where: { candidateId: undo.candidateId, jobId: undo.jobId } });
      if (appRow && undo.applicationCreated && ((appRow.status ?? "New") !== "New" || interviews > 0)) {
        report.keptBecauseWorked.push(label);
        await prisma.importRow.update({ where: { id: row.id }, data: { status: "KEPT" } });
        continue;
      }
    }

    if (undo.fileIds.length) await prisma.candidateFile.deleteMany({ where: { id: { in: undo.fileIds } } });

    if (undo.applicationId) {
      if (undo.applicationCreated) {
        await prisma.candidateApplication.deleteMany({ where: { id: undo.applicationId } });
      } else if (undo.applicationPrior) {
        await prisma.candidateApplication.updateMany({ where: { id: undo.applicationId }, data: undo.applicationPrior });
      }
    }

    if (undo.contactIds.length) await prisma.candidateContact.deleteMany({ where: { id: { in: undo.contactIds } } });

    if (undo.candidateId) {
      if (undo.candidateCreated) {
        const [apps, files, notes, interviews] = await Promise.all([
          prisma.candidateApplication.count({ where: { candidateId: undo.candidateId } }),
          prisma.candidateFile.count({ where: { candidateId: undo.candidateId } }),
          prisma.candidateNote.count({ where: { candidateId: undo.candidateId } }),
          prisma.interview.count({ where: { candidateId: undo.candidateId } })
        ]);
        if (apps + files + notes + interviews === 0) {
          await prisma.candidate.deleteMany({ where: { id: undo.candidateId } });
        } else if (apps + files > 0) {
          // Still holds another application from this same upload, undone on a later
          // row (rows run newest first) — or real work. Either way it stays for now.
        } else {
          report.notes.push(`${application.displayName} was kept: notes or interviews were added after the upload.`);
        }
      } else {
        if (Object.keys(undo.filled).length) await prisma.candidate.updateMany({ where: { id: undo.candidateId }, data: undo.filled });
        if (undo.reactivated) {
          await prisma.candidate.updateMany({
            where: { id: undo.candidateId, archivedAt: null },
            data: { archivedAt: undo.reactivated.archivedAt ? new Date(undo.reactivated.archivedAt) : null, status: undo.reactivated.status }
          });
        }
      }
    }

    if (undo.jobId) {
      if (undo.jobReopenedFrom) {
        await prisma.job.updateMany({ where: { id: undo.jobId, status: "OPEN" }, data: { status: undo.jobReopenedFrom } });
      }
      if (undo.jobCreated && (await prisma.candidateApplication.count({ where: { jobId: undo.jobId } })) === 0) {
        await prisma.job.deleteMany({ where: { id: undo.jobId } });
      }
    }

    await prisma.importRow.update({ where: { id: row.id }, data: { status: "UNDONE" } });
    report.undone += 1;
  }

  // A person created by this upload whose LAST application was undone on an earlier
  // pass of the loop above is now empty — sweep those once more.
  for (const row of rows) {
    const { undo } = JSON.parse(row.rawJson) as { undo: RowUndo };
    if (!undo.candidateCreated || !undo.candidateId) continue;
    const [apps, files, notes, interviews] = await Promise.all([
      prisma.candidateApplication.count({ where: { candidateId: undo.candidateId } }),
      prisma.candidateFile.count({ where: { candidateId: undo.candidateId } }),
      prisma.candidateNote.count({ where: { candidateId: undo.candidateId } }),
      prisma.interview.count({ where: { candidateId: undo.candidateId } })
    ]);
    if (apps + files + notes + interviews === 0) await prisma.candidate.deleteMany({ where: { id: undo.candidateId } });
  }
  return report;
}
