import { prisma } from "@/lib/prisma";
import { METRIC_DEFS, type MetricKind } from "@/lib/extraction/pilot-metrics";
import { parseStringArray } from "@/lib/json";
import { normalizeEmail, normalizeName } from "@/lib/candidates/normalize";
import { parseOfferSteps } from "@/lib/offers/steps";
import { suggestCompanyEmail } from "@/lib/people/company-email";
import { resolveDepartmentKey } from "@/lib/calendar/departments";
import {
  rawJobDepartmentsFor,
  resolveCandidateDepartments,
  type CandidateDepartmentKey
} from "@/lib/candidates/departments";
import { CANDIDATE_LIST_LIMIT, CANDIDATE_LIST_MAX } from "@/lib/candidates/list-config";
import {
  historicalTextPredicates,
  jazzIdentifierPredicates,
  splitSearchTerms
} from "@/lib/candidates/search-terms";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import {
  candidateScopeWhere,
  isCandidateAllowlisted,
  isCandidateVisible,
  scopeCandidateIds
} from "@/lib/auth/candidate-scope";
import type { TagChip } from "@/lib/tags/colors";

// Carries BOTH narrowing mechanisms: the department restriction (a join through
// applications->job->department, resolved in this file) and the hand-picked
// allowlist (a set of ids, resolved in lib/auth/candidate-scope.ts).
export type CandidateListViewer = Pick<
  ViewerScope,
  | "role"
  | "department"
  | "restrictCandidatesToDepartment"
  | "restrictCandidatesToAllowlist"
  | "allowedCandidateIds"
>;

// Is the DEPARTMENT restriction on for this viewer? An admin-set exception that
// only ever applies to a HIRING_MANAGER — ADMIN/RECRUITER are never narrowed.
// Named because two things ask it (the where-fragment below and
// isCandidateScopeNarrowed) and a second hand-rolled copy of the condition is
// exactly how one of these rules gets half-fixed.
function isDepartmentRestricted(viewer: CandidateListViewer | undefined): boolean {
  return Boolean(viewer && viewer.role === "HIRING_MANAGER" && viewer.restrictCandidatesToDepartment);
}

// The where-fragment for the DEPARTMENT restriction, or null when it does not
// apply. Extracted so the list, the comparison board and the saved-view reader
// all narrow the same way — before this, only the list honoured it, so a
// department-scoped hiring manager saw their own department on /candidates and
// the entire roster on the Compare tab.
async function departmentScopeWhere(
  viewer: CandidateListViewer | undefined
): Promise<{ applications: { some: { job: { department: { in: string[] } } } } } | null> {
  if (!isDepartmentRestricted(viewer)) {
    return null;
  }
  // No department set means no job strings match, which correctly matches nobody
  // rather than falling open to everybody.
  // Optional-chained because the guard above is now a named predicate, which
  // does not narrow the parameter for the compiler the way an inline !viewer did.
  const deptStrings = viewer?.department ? await jobDepartmentStringsFor(viewer.department) : [];
  return { applications: { some: { job: { department: { in: deptStrings } } } } };
}

// Candidates have no department column of their own — it's derived through
// their job applications, same as the calendar does (see
// lib/calendar/departments.ts resolveDepartmentKey). Prisma can't run that
// regex classifier in SQL, so resolve which raw Job.department strings bucket
// into the target DeptKey first, then filter candidates by "applied to a job
// with one of those raw strings."
async function jobDepartmentStringsFor(dept: NonNullable<CandidateListViewer["department"]>): Promise<string[]> {
  const jobs = await prisma.job.findMany({
    where: { department: { not: null } },
    select: { department: true },
    distinct: ["department"]
  });
  return jobs
    .map((j) => j.department)
    .filter((d): d is string => Boolean(d) && resolveDepartmentKey(d).deptKey === dept);
}

/**
 * Is this viewer narrowed by EITHER mechanism — the hand-picked allowlist or the
 * department restriction?
 *
 * For the pages that hide a saved view holding nobody this viewer may see, and
 * that show "N of M" instead of a bare count. Asking isCandidateAllowlisted()
 * there covers only half of it: a department-scoped hiring manager is narrowed
 * too, and their cards promised the full count and then opened short.
 */
export function isCandidateScopeNarrowed(viewer?: CandidateListViewer): boolean {
  return isCandidateAllowlisted(viewer) || isDepartmentRestricted(viewer);
}

/**
 * Which of these saved candidate ids may this viewer actually see?
 *
 * The question a page has to answer before it can explain why a saved view came
 * back short, and it applies BOTH narrowing mechanisms: the hand-picked
 * allowlist (a set of ids, lib/auth/candidate-scope.ts) and the department
 * restriction (the join above). scopeCandidateIds() implements only the first
 * and hands the ids straight back when the allowlist is off, so for a
 * department-scoped viewer every member the department filter dropped was
 * counted as an id that no longer resolves — and the saved view told a real
 * hiring manager that live candidates "can no longer be loaded, most likely
 * deleted or merged". That is the reason this exists.
 *
 * Returns the survivors in the order they were passed. What comes back short by
 * is the caller's WITHHELD count; ids that survive here and still resolve to no
 * row are its MISSING count.
 *
 * Costs no query at all for a viewer under neither restriction — most of the
 * roster, every ADMIN and RECRUITER, and a null viewer — which is why the
 * department lookup is guarded rather than run and discarded.
 */
export async function visibleCandidateIdsFor(ids: string[], viewer?: CandidateListViewer): Promise<string[]> {
  if (ids.length === 0) {
    return ids;
  }
  // The allowlist first: it is a set of ids the viewer already carries, so it
  // needs no round trip, and it narrows what the query below has to ask about.
  const scoped = scopeCandidateIds(viewer, ids);
  if (scoped.length === 0) {
    return scoped;
  }
  const department = await departmentScopeWhere(viewer);
  if (!department) {
    // Not department-scoped, so the allowlist answer is the whole answer — and
    // for an unrestricted viewer that is the ids untouched, no query run.
    return scoped;
  }
  // One id-only lookup answering "exists AND applied in this department". Note
  // it collapses the two reasons an id can fail: for a department-scoped viewer
  // an id that no longer resolves at all lands in the caller's withheld bucket
  // rather than its missing one. Deliberate — telling somebody a deleted record
  // is outside their access is a small wrong answer, telling them a live one was
  // deleted is the expensive one, and separating them costs a second query on
  // every saved view to relabel a case that only happens after a merge.
  const rows = await prisma.candidate.findMany({
    where: { AND: [{ id: { in: scoped } }, department] },
    select: { id: true }
  });
  const inDepartment = new Set(rows.map((row) => row.id));
  return scoped.filter((id) => inDepartment.has(id));
}

export type CandidateListItem = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  /**
   * Why this row is not in the live pool, or null when it is.
   *
   * SEARCH deliberately spans archived and historical records so legacy Jazz
   * candidates stay findable (see the comment on baseWhere), which means a
   * search can return a person twice: the record people work, and a tombstone
   * left behind by a merge. Until 2026-08-31 those looked IDENTICAL in the
   * list, so a resolved duplicate read as an unfixed one and the obvious
   * reaction was to try to merge them again.
   *
   * MERGED means a merge folded this record into another and kept it for
   * history. ARCHIVED is everything else out of the pool, mostly the Jazz
   * import. Derived rather than exposing status and archivedAt raw, because
   * the list only needs to answer "why is this one different".
   */
  archivedAs: "MERGED" | "ARCHIVED" | null;
  owner: string | null;
  source: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  tags: string[];
  /**
   * The same tags carrying their colour, for the Tags column.
   *
   * Kept ALONGSIDE the plain string list rather than replacing it: `tags` is
   * still what isTestTagged() and the search paths read, and widening those to
   * objects would ripple a long way for no gain.
   */
  tagChips: TagChip[];
  updatedAt: string;
  noteCount: number;
  fileCount: number;
  applicationCount: number;
  /**
   * Derived from the jobs they applied to — never stored. More than one when
   * somebody applied across departments, which is real and should not collapse.
   */
  departments: CandidateDepartmentKey[];
  docMatch: { filename: string; snippet: string } | null;
  /** Direct link to this person's own record in Paycom, if one has been pasted in. */
  paycomLink: string | null;
};

// Defined in lib/candidates/list-config.ts (which imports nothing) because the
// client-side filter controls need them and this module imports Prisma.
// Re-exported here so existing server-side importers keep working.
export { CANDIDATE_LIST_LIMIT, CANDIDATE_PAGE_SIZES, CANDIDATE_LIST_MAX } from "@/lib/candidates/list-config";

/** Co-interviewers off the stored JSON. Anything unusable reads as an empty panel. */
function parseCoInterviewers(raw: string | null): Array<{ name: string; email: string }> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p) => p && typeof p === "object")
      .map((p) => ({ name: String(p.name ?? "").trim(), email: String(p.email ?? "").trim().toLowerCase() }))
      .filter((p) => p.email || p.name);
  } catch {
    return [];
  }
}

export type CandidateListData = {
  candidates: CandidateListItem[];
  /** How many candidates match the current view in total — the list itself is capped. */
  matchingTotal: number;
  /** The cap applied to the list, so the UI can say when it is showing a subset. */
  listLimit: number;
  stats: {
    total: number;
    active: number;
    withFiles: number;
    withApplications: number;
    scheduledInterviews: number;
    /** Historical (Jazz) records, kept out of the working list but findable by search. */
    archived: number;
  };
};

export type CandidateProfileData = {
  id: string;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  currentTitle: string | null;
  status: string;
  stage: string | null;
  owner: string | null;
  source: string | null;
  /** Paycom's person id (e.g. 320080) — the only exact key their emails give us. */
  paycomPersonId: string | null;
  /** Direct link to this person's own record in Paycom, pasted in by hand. */
  paycomLink: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  tags: string[];
  /** The same tags with their colour, for the pills under the name. */
  tagChips: TagChip[];
  folders: string[];
  pros: string[];
  cons: string[];
  createdAt: string;
  updatedAt: string;
  // Cross-link to a separate historical (Jazz) profile that appears to be the
  // same person. Populated only on non-Jazz profiles; drives the merge panel.
  linkedHistorical: {
    reviewItemId: string;
    candidateId: string;
    displayName: string;
    jazzCandidateNumber: string | null;
    confidence: string;
    reason: string;
    applicationCount: number;
    interviewCount: number;
    fileCount: number;
  } | null;
  // Drives the "move to pre-onboarding" action. hireId is set once this candidate
  // has been moved (NewHire.candidateId), so the panel links instead of re-creating.
  preOnboarding: {
    hireId: string | null;
    hireStage: string | null;
    /** They are in: an offer is SIGNED (or an application says hired). */
    isHired: boolean;
    /** True specifically because an offer was signed — the real handoff moment. */
    offerSigned: boolean;
    suggestedPosition: string | null;
    suggestedDepartment: string | null;
    /** Start date named on the signed offer, to prefill the new hire. */
    suggestedStartDate: string | null;
    /** Company address by the convention: first initial + last name. Feeds business cards. */
    suggestedEmail: string | null;
    /** Someone already holds that address — the convention collides for real pairs. */
    emailTakenBy: string | null;
    // An existing hand-typed hire with the same name that isn't linked to anyone.
    // Offer to LINK to it rather than creating a duplicate record.
    matchingHire: {
      id: string;
      name: string;
      stage: string;
      position: string | null;
      department: string | null;
      startDate: string | null;
    } | null;
  };
  contacts: Array<{
    id: string;
    type: string;
    label: string | null;
    value: string;
    isPrimary: boolean;
    source: string | null;
  }>;
  files: Array<{
    id: string;
    originalFilename: string;
    displayFilename: string;
    storageKey: string | null;
    mimeType: string | null;
    sizeBytes: number | null;
    source: string | null;
    documentType: string | null;
    expiresAt: string | null;
    uploadedAt: string;
    extractedText: string | null;
  }>;
  metrics: Array<{
    id: string;
    key: string;
    label: string;
    valueNumber: number | null;
    valueText: string | null;
    unit: string | null;
    status: string;
    sourceFileId: string | null;
    sourceSnippet: string | null;
  }>;
  notes: Array<{
    id: string;
    body: string;
    source: string | null;
    author: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  activity: Array<{
    id: string;
    activityType: string;
    description: string;
    actor: string | null;
    createdAt: string;
  }>;
  applications: Array<{
    id: string;
    status: string | null;
    stage: string | null;
    source: string | null;
    appliedAt: string | null;
    // Offer lives on the application because an offer is always for a job.
    // NONE | PLANNED | SENT | SIGNED | DECLINED. Never written directly — see
    // lib/offers/record-offer-status.ts.
    offerStatus: string;
    offerSentAt: string | null;
    offerSignedAt: string | null;
    offerDeclinedAt: string | null;
    offerDeclineReason: string | null;
    offerStartDate: string | null;
    offerSource: string | null;
    /** Ticked offer steps: key → when. offerStatus is derived from these. */
    offerSteps: Record<string, string>;
    job: {
      id: string;
      title: string;
      department: string | null;
      status: string;
      location: string | null;
    } | null;
    pilotRequirement: {
      id: string;
      title: string;
      status: string;
      reviewStatus: string;
    } | null;
    questionnaire: Array<{ questionnaireName: string | null; question: string | null; answer: string | null }>;
  }>;
  interviews: Array<{
    id: string;
    title: string;
    startDateTime: string;
    endDateTime: string | null;
    interviewType: string;
    coInterviewers: Array<{ name: string; email: string }>;
    timezone: string | null;
    interviewer: string | null;
    location: string | null;
    meetingUrl: string | null;
    status: string;
    notes: string | null;
    /** Formatted write-up. `notes` stays the plain-text version. */
    notesHtml: string | null;
    interviewerEmail: string | null;
    outcome: string | null;
    rating: number | null;
    nextStep: string | null;
  }>;
  // Historical Candidate Archive surfaces. `origin` is internal (PAYCOM | JAZZ |
  // MANUAL); `isHistorical` is true when the profile carries legacy (Jazz) data,
  // whether it was created from it or merged into an existing candidate.
  origin: string;
  jazzCandidateNumber: string | null;
  isHistorical: boolean;
  historicalMatch: {
    applicationCount: number;
    interviewers: string[];
    hasNotes: boolean;
    declinedOffer: boolean;
    resumeArchived: boolean;
    hired: boolean;
  } | null;
  timeline: Array<{
    id: string;
    type: string;
    title: string;
    detail: string | null;
    occurredAt: string;
    origin: string;
  }>;
  aiSummary: { summary: string; generatedAt: string } | null;
  communications: Array<{
    id: string;
    subject: string | null;
    senderEmail: string | null;
    recipientEmail: string | null;
    sentAt: string | null;
    body: string | null;
    fromCandidate: boolean;
  }>;
  communicationCount: number;
};


/** Merge legacy tagsJson tags with normalized CandidateTag labels (case-insensitive dedupe). */
/**
 * Tags with colour, in the same merged order as mergeTags produces.
 *
 * Legacy tagsJson entries have no colour of their own — nothing ever stored one
 * for them — so they come through as null and the UI derives a stable colour
 * from the label instead.
 */
function mergeTagChips(
  jsonTags: string[],
  normalized: Array<{ label: string; color: string | null; source: string | null }>
): TagChip[] {
  const seen = new Set<string>();
  const out: TagChip[] = [];
  const all: TagChip[] = [
    // Legacy tagsJson entries are historical by definition — they only exist on
    // records written by an importer, and nothing has added to that column since.
    ...jsonTags.map((label) => ({ label, color: null, historical: true })),
    ...normalized.map((n) => ({ label: n.label, color: n.color, historical: n.source !== "MANUAL" }))
  ];
  for (const chip of all) {
    const trimmed = chip.label.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push({ ...chip, label: trimmed });
    }
  }
  // Current tags first, then historical — so the colour is what you see and the
  // grey is what you scroll past.
  return out.sort((a, b) => Number(a.historical) - Number(b.historical) || a.label.localeCompare(b.label));
}

function mergeTags(jsonTags: string[], normalizedTags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of [...jsonTags, ...normalizedTags]) {
    const trimmed = t.trim();
    const key = trimmed.toLowerCase();
    if (trimmed && !seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

/** Build a short excerpt around the first match of query in text. */
function buildSnippet(text: string, query: string): string {
  const lowerText = text.toLowerCase();
  const idx = lowerText.indexOf(query.toLowerCase());
  if (idx === -1) {
    return text.slice(0, 140).trim();
  }
  const start = Math.max(0, idx - 60);
  const end = Math.min(text.length, idx + query.length + 90);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";
  return `${prefix}${text.slice(start, end).trim()}${suffix}`;
}

/**
 * Every tag that exists, with how many candidates carry it.
 *
 * `live` counts only non-archived people. That split matters: 38 tags arrived
 * from the Jazz import carrying 1,648 links, but they sit almost entirely on
 * archived historical records — so ordering the filter by raw total would put
 * tags describing a process we no longer run above the ones actually in use.
 */
export type CandidateTagOption = {
  label: string;
  color: string | null;
  live: number;
  total: number;
  /**
   * True when NOBODY has applied this tag by hand — every link came from the
   * import. Those are shown separately in the filter so the vocabulary somebody
   * actually chose is not buried under 38 imported workflow labels.
   */
  historical: boolean;
};

export async function getCandidateTagOptions(): Promise<CandidateTagOption[]> {
  const tags = await prisma.tag.findMany({
    select: {
      label: true,
      color: true,
      _count: { select: { candidates: true } },
      candidates: {
        where: { candidate: { archivedAt: null } },
        select: { candidateId: true }
      }
    }
  });

  // One extra query rather than pulling every link: which tags have at least one
  // hand-applied use.
  const manual = await prisma.candidateTag.findMany({
    where: { source: "MANUAL" },
    select: { tag: { select: { label: true } } },
    distinct: ["tagId"]
  });
  const manualLabels = new Set(manual.map((m) => m.tag.label));

  return tags
    .map((t) => ({
      label: t.label,
      color: t.color,
      live: t.candidates.length,
      total: t._count.candidates,
      historical: !manualLabels.has(t.label)
    }))
    .sort(
      (a, b) =>
        Number(a.historical) - Number(b.historical) || b.live - a.live || a.label.localeCompare(b.label)
    );
}

export async function getCandidateListData(
  query = "",
  viewer?: CandidateListViewer,
  /**
   * Tag labels to narrow to. Filtering happens in the DATABASE, not in the
   * component: the list is capped at CANDIDATE_LIST_LIMIT, so filtering the
   * returned page client-side would search only the first 100 rows and quietly
   * miss anyone past the cap.
   */
  tagFilter: string[] = [],
  /**
   * Recruiting departments to narrow to, DERIVED from the job each candidate
   * applied to (see lib/candidates/departments.ts). Like the tag filter this
   * runs in the database — filtering the returned page would only ever search
   * the current page and silently miss everyone past the cap.
   */
  departmentFilter: CandidateDepartmentKey[] = [],
  /** Rows per page. Capped at CANDIDATE_LIST_MAX so a typo cannot ask for 50,000. */
  limit: number = CANDIDATE_LIST_LIMIT
): Promise<CandidateListData> {
  const normalizedQuery = query.trim().toLowerCase();
  const hasQuery = normalizedQuery.length > 0;
  const terms = splitSearchTerms(query);
  const tags = tagFilter.map((t) => t.trim()).filter(Boolean);
  const pageSize = Math.min(Math.max(1, Math.floor(limit)), CANDIDATE_LIST_MAX);

  // One OR-block per term, ANDed together, so every word the user typed has to
  // land somewhere. A single `contains` against the whole typed string can only
  // ever match one field, which made any two-term query return nothing.
  const termPredicate = (term: string) => {
    const lower = term.toLowerCase();
    const digits = lower.replace(/\D/g, "");
    return {
      OR: [
        { normalizedName: { contains: lower } },
        { normalizedEmail: { contains: lower } },
        { normalizedPhone: { contains: digits || lower } },
        { displayName: { contains: term, mode: "insensitive" as const } },
        { currentTitle: { contains: term, mode: "insensitive" as const } },
        { stage: { contains: term, mode: "insensitive" as const } },
        { owner: { contains: term, mode: "insensitive" as const } },
        { source: { contains: term, mode: "insensitive" as const } },
        { primaryEmail: { contains: lower, mode: "insensitive" as const } },
        { primaryPhone: { contains: term } },
        { tagsJson: { contains: term, mode: "insensitive" as const } },
        // Search inside document text (resumes, pilot apps, etc.)
        { files: { some: { extractedText: { contains: term, mode: "insensitive" as const } } } },
        // Jazz-era identifiers and history. Identifiers are PREFIX-matched —
        // see lib/candidates/search-terms.ts for why substring is wrong here.
        ...jazzIdentifierPredicates(term),
        ...historicalTextPredicates(term)
      ]
    };
  };

  // When searching, span ALL candidates including archived/historical (Jazz)
  // ones so legacy records are findable. With no query, the default list stays
  // active-only (archivedAt: null) so the historical archive doesn't flood it.
  const baseWhere: Record<string, unknown> = hasQuery
    ? { AND: terms.map(termPredicate) }
    : { archivedAt: null };

  // Org-wide by default — a HIRING_MANAGER only gets narrowed to their own
  // department when an admin explicitly turns on restrictCandidatesToDepartment
  // for them (an exception, not the rule). ADMIN/RECRUITER are never narrowed.
  let candidateWhere: Record<string, unknown> = baseWhere;

  // The hand-picked allowlist is checked FIRST and WINS outright over the
  // department restriction below. The two are alternative answers to the same
  // question, and intersecting them would hand an admin who set a department and
  // then picked somebody outside it an empty list with no explanation. The admin
  // UI disables the department control while this is on, so the two cannot be set
  // in contradiction in the first place.
  //
  // Note this REPLACES baseWhere rather than extending it: an allowlisted viewer
  // sees exactly the people they were granted, archived ones included. Being
  // handed somebody by name and then not finding them because they were archived
  // last month would read as the feature being broken.
  const allowlist = candidateScopeWhere(viewer);
  if (allowlist) {
    candidateWhere = hasQuery
      ? { AND: [...((baseWhere.AND as unknown[] | undefined) ?? []), allowlist] }
      : allowlist;
  } else {
    // Same helper the comparison board and the saved-view reader use, so the
    // department rule has exactly one definition. It returns null unless this
    // viewer is actually department-scoped.
    const departmentBranch = await departmentScopeWhere(viewer);
    if (departmentBranch) {
      candidateWhere = { ...baseWhere, ...departmentBranch };
    }
  }

  // Tag filter. AND across tags — picking two means "carries both", which is
  // what narrowing is for; OR would widen the list as you added tags, which is
  // the opposite of what clicking another filter looks like it should do.
  //
  // Matched case-insensitively through `normalized`, since the legacy importer
  // and hand-typed tags do not agree on casing.
  if (tags.length) {
    // Append to any existing AND rather than replacing it — the search itself
    // now lives in `AND` (one entry per typed term), so assigning here would
    // silently drop the query and return tag matches for everybody.
    candidateWhere = {
      ...candidateWhere,
      AND: [
        ...((candidateWhere.AND as unknown[]) ?? []),
        ...tags.map((label) => ({
          candidateTags: { some: { tag: { normalized: label.toLowerCase() } } }
        }))
      ]
    };
  }

  // Department filter. OR across departments — unlike tags, picking Maintenance
  // AND FBO means "show me both", because a candidate has one department in
  // practice and ANDing them would always return nobody.
  //
  // "Unassigned" cannot be expressed as "applied to a job in this bucket", since
  // it is the ABSENCE of one: no application at all, or an application whose job
  // carries no department. It gets its own branch, ORed alongside the rest.
  if (departmentFilter.length) {
    const allJobDepartments = await prisma.job.findMany({
      where: { department: { not: null } },
      select: { department: true },
      distinct: ["department"]
    });
    const named = departmentFilter.filter((key) => key !== "unassigned");
    const wantsUnassigned = departmentFilter.includes("unassigned");

    // A hand-set departmentOverride WINS over the derived value, so every branch
    // below has to respect it in both directions: an override puts somebody IN
    // its department, and equally keeps them OUT of the one their application
    // would otherwise have implied. Without the `departmentOverride: null` guard
    // on the derived branches, correcting somebody would leave them showing up
    // under both departments.
    const branches: Array<Record<string, unknown>> = [];
    if (named.length) {
      const rawStrings = await rawJobDepartmentsFor(
        named,
        allJobDepartments.map((j) => j.department)
      );
      branches.push({ departmentOverride: { in: named } });
      // An empty rawStrings would make `in: []` match nobody, which is the
      // correct answer: no job carries a department in those buckets.
      branches.push({
        departmentOverride: null,
        applications: { some: { job: { department: { in: rawStrings } } } }
      });
    }
    if (wantsUnassigned) {
      branches.push({
        departmentOverride: null,
        NOT: { applications: { some: { job: { department: { not: null } } } } }
      });
    }

    candidateWhere = {
      ...candidateWhere,
      AND: [...((candidateWhere.AND as unknown[]) ?? []), { OR: branches }]
    };
  }

  // Only pull document text for matching files when there's a query (keeps the list light).
  // Match on ANY typed term, not the whole string — otherwise a multi-term
  // query never surfaces the document snippet that explains the hit.
  const filesInclude = hasQuery
    ? {
        where: {
          OR: terms.map((term) => ({
            extractedText: { contains: term, mode: "insensitive" as const }
          }))
        },
        select: { displayFilename: true, extractedText: true },
        take: 1
      }
    : false;

  // BACK TO Promise.all, REVERTED from $transaction. The $transaction attempt
  // (theory: fewer concurrent cold connections) was never actually proven —
  // local measurements were noisy and inconclusive, and swapping it in forced
  // all 7 queries onto ONE connection SEQUENTIALLY (an array-form $transaction
  // runs each statement one after another inside a single BEGIN/COMMIT), which
  // trades "up to 7 concurrent connection opens" for "7 round trips back to
  // back" — plausibly a net loss against a remote database, and it adds a
  // transaction timeout as a new failure mode that plain Promise.all never
  // had. Reverting to the known-good behavior and instrumenting it for real
  // numbers (see queryMs below) rather than guessing a third time.
  const listQueryStart = Date.now();
  const [candidateRows, total, active, withFiles, withApplications, scheduledInterviews, archived] = await Promise.all([
    prisma.candidate.findMany({
      where: candidateWhere,
      take: pageSize,
      orderBy: [{ updatedAt: "desc" }, { displayName: "asc" }],
      include: {
        files: filesInclude,
        candidateTags: { include: { tag: { select: { label: true, color: true } } } },
        // Just the department of each applied-to job — this is what the
        // Department column shows, and it is why no Candidate.department column
        // needs to exist. Deliberately narrow: at 500 rows a wider application
        // include would be a real cost for nothing the list displays.
        applications: { select: { job: { select: { department: true } } } },
      // `source` is what separates a tag somebody chose from one the importer
      // left behind; see mergeTagChips.
        _count: {
          select: {
            notes: true,
            files: true,
            applications: true
          }
        }
      }
    }),
    // Count the SAME population the list shows. These used to count every
    // candidate ever, so the page announced 3,213 above a list of 45 and read as
    // "most of my candidates are missing" — they were the 3,169 archived Jazz
    // historical records, which live on the Historical Archive page.
    prisma.candidate.count({ where: candidateWhere }),
    prisma.candidate.count({ where: { ...candidateWhere, status: "ACTIVE" } }),
    prisma.candidate.count({ where: { ...candidateWhere, files: { some: {} } } }),
    prisma.candidate.count({ where: { ...candidateWhere, applications: { some: {} } } }),
    // These two are NOT built from candidateWhere, so they have always ignored the
    // department restriction too. Scoped explicitly rather than left to drift: a
    // restricted viewer being told there are 3,169 archived candidates is a
    // headline count of people they cannot see, which is its own small leak.
    prisma.interview.count({
      where: allowlist
        ? { status: "SCHEDULED", candidateId: { in: viewer?.allowedCandidateIds ?? [] } }
        : { status: "SCHEDULED" }
    }),
    prisma.candidate.count({
      where: allowlist ? { AND: [{ archivedAt: { not: null } }, allowlist] } : { archivedAt: { not: null } }
    })
  ]);
  // TEMPORARY diagnostic: the candidates page has been reported slow twice
  // now on guesses that didn't hold up under real measurement. This puts an
  // actual production number in the logs on every load, cheap enough to leave
  // in until the real bottleneck is confirmed and fixed, then remove.
  console.log(`[perf] getCandidateListData query time: ${Date.now() - listQueryStart}ms (query="${query}")`);

  const candidates: CandidateListItem[] = candidateRows.map((candidate) => {
    const matchedFile = hasQuery
      ? (candidate as typeof candidate & { files?: Array<{ displayFilename: string; extractedText: string | null }> }).files?.[0]
      : undefined;
    const docMatch =
      matchedFile?.extractedText
        ? { filename: matchedFile.displayFilename, snippet: buildSnippet(matchedFile.extractedText, query) }
        : null;

    return {
      id: candidate.id,
      displayName: candidate.displayName,
      currentTitle: candidate.currentTitle,
      stage: candidate.stage,
      // Only ever set on a row that is out of the live pool, so the default
      // list - which is already archivedAt: null - never shows a badge.
      archivedAs: candidate.archivedAt ? (candidate.status === "MERGED" ? "MERGED" : "ARCHIVED") : null,
      owner: candidate.owner,
      source: candidate.source,
      primaryEmail: candidate.primaryEmail,
      primaryPhone: candidate.primaryPhone,
      tags: mergeTags(
        parseStringArray(candidate.tagsJson),
        (candidate as typeof candidate & { candidateTags?: Array<{ tag: { label: string } }> }).candidateTags?.map((ct) => ct.tag.label) ?? []
      ),
      tagChips: mergeTagChips(
        parseStringArray(candidate.tagsJson),
        (
          candidate as typeof candidate & {
            candidateTags?: Array<{ source: string | null; tag: { label: string; color: string | null } }>;
          }
        ).candidateTags?.map((ct) => ({ label: ct.tag.label, color: ct.tag.color, source: ct.source })) ?? []
      ),
      updatedAt: candidate.updatedAt.toISOString(),
      noteCount: candidate._count.notes,
      fileCount: candidate._count.files,
      applicationCount: candidate._count.applications,
      // A hand-set override wins outright — see Candidate.departmentOverride.
      departments: resolveCandidateDepartments(
        candidate.departmentOverride,
        (candidate as typeof candidate & { applications?: Array<{ job: { department: string | null } | null }> })
          .applications?.map((a) => a.job?.department) ?? []
      ),
      docMatch,
      paycomLink: candidate.paycomLink
    };
  });

  return {
    candidates,
    matchingTotal: total,
    listLimit: pageSize,
    stats: {
      total,
      active,
      withFiles,
      withApplications,
      scheduledInterviews,
      archived
    }
  };
}

// ---------------------------------------------------------------------------
// Comparison table — compare flight metrics, type ratings & certs across everyone
// ---------------------------------------------------------------------------

export type ComparisonColumn = {
  key: string;
  label: string;
  kind: MetricKind;
  unit?: string;
};

export type ComparisonMetric = {
  number: number | null;
  text: string | null;
  unit: string | null;
  confirmed: boolean; // false = still a SUGGESTED (unconfirmed) extraction
};

export type CandidateComparisonRow = {
  id: string;
  displayName: string;
  currentTitle: string | null;
  stage: string | null;
  updatedAt: string;
  metrics: Record<string, ComparisonMetric>; // keyed by metric key (hours/text columns)
  typeRatings: string[];
  certificates: string[];
};

export type CandidateComparisonData = {
  rows: CandidateComparisonRow[];
  columns: ComparisonColumn[]; // every numeric/text metric column (excludes the list columns)
  typeRatingOptions: string[];
  certificateOptions: string[];
};

/** Split a stored list value ("GV, G450 / CE-525") into clean tokens. */
function splitListValue(value: string | null): string[] {
  if (!value) return [];
  return [
    ...new Set(
      value
        .split(/[,;/|]+|\band\b/gi)
        .map((part) => part.trim())
        .filter(Boolean)
    )
  ];
}

/**
 * The members of a saved view, in the order the view stores them.
 *
 * Archived candidates are INCLUDED — a shortlist that silently dropped someone
 * after they were archived would show a hiring manager a different list than the
 * recruiter picked, with nothing on screen to say so. Ids that no longer resolve
 * at all are simply absent, and the caller compares counts to report the gap.
 *
 * No docMatch here: there is no search query behind a saved view.
 */
// viewer is optional for the same reason it is elsewhere in this file — internal
// callers not serving a request pass nothing — but every REQUEST-serving caller
// must pass it. Saved views are the caller that matters: without this, an
// allowlisted viewer opening a saved view reads every candidate on it.
export async function getCandidatesByIds(ids: string[], viewer?: CandidateListViewer): Promise<CandidateListItem[]> {
  if (ids.length === 0) return [];
  const scoped = ids.filter((id) => isCandidateVisible(viewer, id));
  if (scoped.length === 0) return [];
  // A saved view can name anybody, so it has to respect the department
  // restriction as well as the allowlist — otherwise a view is a way round the
  // narrowing rather than a shortcut through it.
  const byIdsDepartment = await departmentScopeWhere(viewer);
  const rows = await prisma.candidate.findMany({
    where: byIdsDepartment ? { AND: [{ id: { in: scoped } }, byIdsDepartment] } : { id: { in: scoped } },
    include: {
      candidateTags: { include: { tag: { select: { label: true, color: true } } } },
      applications: { select: { job: { select: { department: true } } } },
      _count: { select: { notes: true, files: true, applications: true } }
    }
  });

  const byId = new Map(rows.map((row) => [row.id, row]));
  // Preserve the saved order rather than the database's — the view was picked in
  // a particular order and re-sorting it makes a re-read of the same list feel
  // like a different one.
  // Iterate the requested order but drop anything the query did not return —
  // the department filter can remove members the allowlist let through.
  return scoped
    .map((id) => byId.get(id))
    .filter((row): row is NonNullable<typeof row> => Boolean(row))
    .map((candidate) => ({
      id: candidate.id,
      displayName: candidate.displayName,
      currentTitle: candidate.currentTitle,
      stage: candidate.stage,
      // Only ever set on a row that is out of the live pool, so the default
      // list - which is already archivedAt: null - never shows a badge.
      archivedAs: candidate.archivedAt ? (candidate.status === "MERGED" ? "MERGED" : "ARCHIVED") : null,
      owner: candidate.owner,
      source: candidate.source,
      primaryEmail: candidate.primaryEmail,
      primaryPhone: candidate.primaryPhone,
      tags: mergeTags(parseStringArray(candidate.tagsJson), candidate.candidateTags.map((ct) => ct.tag.label)),
      tagChips: mergeTagChips(
        parseStringArray(candidate.tagsJson),
        candidate.candidateTags.map((ct) => ({ label: ct.tag.label, color: ct.tag.color, source: ct.source }))
      ),
      updatedAt: candidate.updatedAt.toISOString(),
      noteCount: candidate._count.notes,
      fileCount: candidate._count.files,
      applicationCount: candidate._count.applications,
      departments: resolveCandidateDepartments(
        candidate.departmentOverride,
        candidate.applications.map((a) => a.job?.department)
      ),
      docMatch: null,
      paycomLink: candidate.paycomLink
    }));
}

/**
 * @param candidateIds When given, compare exactly these people and nobody else —
 * this is a saved view being opened. Archived candidates are INCLUDED in that
 * case: a shortlist that silently dropped somebody after they were archived
 * would show a hiring manager a different list than the recruiter picked, with
 * nothing on screen to say so. Without it, the page keeps its old behaviour of
 * showing every live candidate.
 */
export async function getCandidateComparisonData(
  candidateIds?: string[],
  viewer?: CandidateListViewer
): Promise<CandidateComparisonData> {
  // The no-ids branch returns up to 1000 candidates with every flight metric, and
  // /candidates/compare hits exactly that branch when there is no ?view=. For an
  // allowlisted viewer that fallback must be THEIR people rather than everybody —
  // and gating the CSV export button would be cosmetic, because by then the rows
  // are already in the page.
  const scopedIds = candidateIds ? candidateIds.filter((id) => isCandidateVisible(viewer, id)) : undefined;
  const comparisonAllowlist = candidateScopeWhere(viewer);
  // Both narrowings apply here, not just the allowlist. The department one is
  // the older rule and had never reached this function: /candidates narrowed a
  // department-scoped manager while this board handed the same person all 1000.
  const comparisonDepartment = comparisonAllowlist ? null : await departmentScopeWhere(viewer);
  const comparisonBase: Array<Record<string, unknown>> = scopedIds
    ? [{ id: { in: scopedIds } }]
    : [{ archivedAt: null }];
  if (comparisonAllowlist) comparisonBase.push(comparisonAllowlist);
  if (comparisonDepartment) comparisonBase.push(comparisonDepartment);
  const comparisonWhere = comparisonBase.length === 1 ? comparisonBase[0] : { AND: comparisonBase };

  const candidateRows = await prisma.candidate.findMany({
    where: comparisonWhere,
    take: scopedIds ? scopedIds.length : 1000,
    orderBy: [{ displayName: "asc" }],
    select: {
      id: true,
      displayName: true,
      currentTitle: true,
      stage: true,
      updatedAt: true,
      metrics: {
        where: { status: { not: "DISMISSED" } },
        select: { key: true, valueNumber: true, valueText: true, unit: true, status: true }
      }
    }
  });

  // Scalar (hours/text) columns only; the two list columns get dedicated chip cells.
  const columns: ComparisonColumn[] = METRIC_DEFS.filter((def) => def.kind !== "list").map((def) => ({
    key: def.key,
    label: def.label,
    kind: def.kind,
    unit: def.unit
  }));

  const typeRatingSet = new Set<string>();
  const certificateSet = new Set<string>();

  const rows: CandidateComparisonRow[] = candidateRows.map((candidate) => {
    const metrics: Record<string, ComparisonMetric> = {};
    let typeRatings: string[] = [];
    let certificates: string[] = [];

    for (const metric of candidate.metrics) {
      if (metric.key === "type_ratings") {
        typeRatings = splitListValue(metric.valueText);
        typeRatings.forEach((rating) => typeRatingSet.add(rating));
        continue;
      }
      if (metric.key === "certificates") {
        certificates = splitListValue(metric.valueText);
        certificates.forEach((cert) => certificateSet.add(cert));
        continue;
      }
      metrics[metric.key] = {
        number: metric.valueNumber,
        text: metric.valueText,
        unit: metric.unit,
        confirmed: metric.status === "CONFIRMED"
      };
    }

    return {
      id: candidate.id,
      displayName: candidate.displayName,
      currentTitle: candidate.currentTitle,
      stage: candidate.stage,
      updatedAt: candidate.updatedAt.toISOString(),
      metrics,
      typeRatings,
      certificates
    };
  });

  return {
    rows,
    columns,
    typeRatingOptions: [...typeRatingSet].sort((a, b) => a.localeCompare(b)),
    certificateOptions: [...certificateSet].sort((a, b) => a.localeCompare(b))
  };
}

/**
 * Strip the "FILLED - " pipeline artifact off a candidate's current title.
 *
 * It arrived on 29 candidates via a June 2026 CSV import and means the REQ was
 * filled — it says nothing about the person. Carried onto a NewHire it becomes a
 * lie ("FILLED - Citation 560XLS+ Captain" stamped on someone just starting) and
 * pollutes an otherwise clean position vocabulary: 0 of 448 existing hires carry
 * it. Only ever cleaned for display/prefill — the stored currentTitle is left
 * alone, since it is the imported source value.
 */
function cleanTitle(title: string | null): string | null {
  if (!title) return null;
  const cleaned = title.replace(/^\s*FILLED\s*-\s*/i, "").trim();
  return cleaned || null;
}

function formatLocation(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(", ") || null;
}

const PRIVATE_NOTE_PLACEHOLDER = "Only visible to the assigned interviewer, their department's hiring managers, and Admin/Recruiter.";

// THE CHOKEPOINT for reading one candidate.
//
// viewer is REQUIRED. It used to be optional, with a missing viewer meaning
// "unrestricted" — which is the wrong default for a gate: any future call site
// that forgot the argument would silently open the record. Pass null explicitly
// for a genuinely internal caller that is not serving a request.
//
// Returns null — the same answer as "no such candidate" — when the viewer is
// allowlisted and this candidate is not on their list. Both existing callers
// already handle null correctly (notFound() on the page, 404 from the API), and
// 404 is the RIGHT answer rather than 403: a restricted hiring manager should
// not be able to learn that a given person is in the system at all by pasting
// ids into the URL bar.
export async function getCandidateProfileData(
  id: string,
  viewer: ViewerScope | null
): Promise<CandidateProfileData | null> {
  if (!isCandidateVisible(viewer, id)) {
    return null;
  }

  const candidate = await prisma.candidate.findUnique({
    where: { id },
    include: {
      contacts: {
        orderBy: [{ isPrimary: "desc" }, { type: "asc" }]
      },
      files: {
        orderBy: { uploadedAt: "asc" }
      },
      metrics: {
        where: { status: { not: "DISMISSED" } },
        orderBy: { createdAt: "asc" }
      },
      notes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { name: true, email: true } } }
      },
      applications: {
        orderBy: { updatedAt: "desc" },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              department: true,
              status: true,
              city: true,
              state: true
            }
          },
          pilotRequirement: {
            select: {
              id: true,
              title: true,
              status: true,
              reviewStatus: true
            }
          },
          questionnaireAnswers: {
            select: { questionnaireName: true, question: true, answer: true }
          }
        }
      },
      interviews: {
        orderBy: { startDateTime: "asc" }
      },
      aiSummary: true,
      candidateTags: { include: { tag: { select: { label: true, color: true } } } },
      // `source` is what separates a tag somebody chose from one the importer
      // left behind; see mergeTagChips.
      communications: {
        orderBy: { sentAt: "desc" },
        take: 100
      },
      _count: { select: { communications: true } }
    }
  });

  if (!candidate) {
    return null;
  }

  // Derive the "historical match" facts that drive the banner. A profile counts
  // as historical when it originated from Jazz, or had Jazz data merged into it.
  const isHistorical = candidate.origin === "JAZZ" || Boolean(candidate.historicalSourceId);
  const interviewers = [
    ...new Set(candidate.interviews.map((i) => i.interviewer).filter((v): v is string => Boolean(v)))
  ];

  // Interview notes/details and candidate notes are the one place with real
  // privacy: visible to whoever wrote/conducted it, plus any hiring manager in
  // this candidate's own department, plus any executive. No viewer passed
  // (internal/legacy callers) defaults to unrestricted rather than silently
  // hiding content nobody asked to gate.
  const candidateDeptRaw = candidate.applications.map((a) => a.job?.department ?? null).find((d): d is string => Boolean(d)) ?? null;
  const candidateDeptKey = candidateDeptRaw ? resolveDepartmentKey(candidateDeptRaw).deptKey : null;
  const unrestrictedViewer =
    !viewer || viewer.role === "ADMIN" || viewer.role === "RECRUITER" || viewer.isExecutive;
  const departmentMatches = Boolean(viewer?.department && candidateDeptKey && viewer.department === candidateDeptKey);
  // A hand-picked viewer reaching this line has ALREADY been checked against the
  // allowlist above, so this candidate is one of theirs. Without this arm the
  // feature contradicts itself: they would be granted a candidate by name and
  // then shown PRIVATE_NOTE_PLACEHOLDER in place of every interview write-up and
  // note body, because they carry no department, authored nothing, and are not an
  // executive — all three existing arms are false for exactly this user.
  //
  // Granting someone a candidate IS granting them that candidate's file. If the
  // assessments are meant to stay private the answer is to not grant the
  // candidate, not to hand over a redacted record.
  const allowlistGrantsCandidate = Boolean(viewer?.restrictCandidatesToAllowlist);
  function canSeeContent(authoredByViewer: boolean) {
    return unrestrictedViewer || departmentMatches || allowlistGrantsCandidate || authoredByViewer;
  }
  const declinedOffer = candidate.applications.some((a) => (a.status ?? "").toLowerCase().includes("declined"));
  const hired = candidate.applications.some((a) => (a.status ?? "").toLowerCase().includes("hired") && !(a.status ?? "").toLowerCase().includes("elsewhere"));
  const resumeArchived = candidate.files.some((f) => (f.documentType ?? "").toLowerCase() === "resume");
  const historicalMatch = isHistorical
    ? {
        applicationCount: candidate.applications.length,
        interviewers,
        hasNotes: candidate.notes.length > 0,
        declinedOffer,
        resumeArchived,
        hired
      }
    : null;

  // Unified timeline built from the real relations so everything links together
  // chronologically — every application (with its job), interview, and note —
  // even when the candidate applied to more than one job.
  const timeline = [
    ...candidate.applications
      .filter((a) => a.appliedAt)
      .map((a) => ({
        id: `app-${a.id}`,
        type: a.disposition ?? "APPLIED",
        title: a.job?.title ?? a.historicalJobTitle ?? "Application",
        detail: a.status ?? null,
        occurredAt: a.appliedAt!.toISOString(),
        origin: a.origin
      })),
    ...candidate.interviews.map((i) => ({
      id: `iv-${i.id}`,
      type: "INTERVIEWED",
      title: i.title,
      detail: [i.interviewer, i.notes?.trim()].filter(Boolean).join(" · ") || null,
      occurredAt: i.startDateTime.toISOString(),
      origin: i.source === "JAZZ" ? "JAZZ" : "PAYCOM"
    })),
    ...candidate.notes.map((n) => ({
      id: `note-${n.id}`,
      type: n.source === "JAZZ_FEEDBACK" ? "INTERVIEW_NOTE" : "NOTE",
      title: n.body.replace(/\s+/g, " ").slice(0, 240),
      detail: null as string | null,
      occurredAt: n.createdAt.toISOString(),
      origin: n.source === "JAZZ_FEEDBACK" || n.source === "JAZZ" ? "JAZZ" : "PAYCOM"
    }))
  ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  // Per-candidate activity history (edits, note add/remove, dedupe, etc.).
  const activityRows = await prisma.activityLog.findMany({
    where: { entityType: "Candidate", entityId: candidate.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { user: { select: { name: true, email: true } } }
  });

  // New candidate ↔ historical (Jazz) cross-link, surfaced on the new profile so
  // the recruiter can view the archived record or merge it in. Only shown on
  // non-Jazz profiles; backed by the existing duplicate-review + merge machinery.
  const historicalLinkSelect = {
    id: true,
    displayName: true,
    origin: true,
    status: true,
    jazzCandidateNumber: true,
    _count: { select: { applications: true, interviews: true, files: true } }
  } as const;
  let linkedHistorical: CandidateProfileData["linkedHistorical"] = null;
  if (candidate.origin !== "JAZZ" && candidate.status !== "MERGED") {
    const reviewItems = await prisma.duplicateReviewItem.findMany({
      where: {
        reviewType: "CANDIDATE",
        status: "OPEN",
        OR: [{ primaryCandidateId: candidate.id }, { secondaryCandidateId: candidate.id }]
      },
      include: {
        primaryCandidate: { select: historicalLinkSelect },
        secondaryCandidate: { select: historicalLinkSelect }
      }
    });
    // Prefer HIGH-confidence pairs; only surface a Jazz-origin counterpart.
    const ranked = reviewItems.sort(
      (a, b) => (a.confidence === "HIGH" ? -1 : 1) - (b.confidence === "HIGH" ? -1 : 1)
    );
    for (const item of ranked) {
      const other = item.primaryCandidateId === candidate.id ? item.secondaryCandidate : item.primaryCandidate;
      if (other && other.origin === "JAZZ" && other.status !== "MERGED") {
        linkedHistorical = {
          reviewItemId: item.id,
          candidateId: other.id,
          displayName: other.displayName,
          jazzCandidateNumber: other.jazzCandidateNumber,
          confidence: item.confidence,
          reason: item.reason,
          applicationCount: other._count.applications,
          interviewCount: other._count.interviews,
          fileCount: other._count.files
        };
        break;
      }
    }
  }

  // Pre-onboarding link: has this candidate already been moved to a NewHire, and
  // what should we prefill if not? Position/department come from the job they were
  // hired into, falling back to their current title.
  const hiredApp = candidate.applications.find(
    (a) => (a.status ?? "").toLowerCase().includes("hired") && !(a.status ?? "").toLowerCase().includes("elsewhere")
  );
  const existingHire = await prisma.newHire.findFirst({
    where: { candidateId: candidate.id },
    select: { id: true, stage: true }
  });
  // Not linked yet? Look for an existing hand-typed hire with the same name.
  // None of the legacy hires carry a candidateId, so without this we'd happily
  // create a duplicate for anyone already typed into pre-onboarding.
  let matchingHire: CandidateProfileData["preOnboarding"]["matchingHire"] = null;
  if (!existingHire && candidate.status !== "ARCHIVED" && candidate.status !== "MERGED") {
    const target = normalizeName(candidate.displayName);
    if (target) {
      const unlinked = await prisma.newHire.findMany({
        where: { candidateId: null },
        select: { id: true, name: true, stage: true, position: true, department: true, startDate: true }
      });
      const hit = unlinked.find((h) => normalizeName(h.name) === target);
      if (hit) {
        matchingHire = {
          id: hit.id,
          name: hit.name,
          stage: hit.stage,
          position: hit.position,
          department: hit.department,
          startDate: hit.startDate ? hit.startDate.toISOString() : null
        };
      }
    }
  }

  // A signed offer is the real handoff from recruiting to onboarding, so it wins
  // over the older free-text "hired" status when deciding what to prefill.
  const signedOfferApp = candidate.applications.find((a) => a.offerStatus === "SIGNED");
  const sourceApp = signedOfferApp ?? hiredApp;
  // The company address follows a fixed convention and feeds the business cards,
  // so derive it rather than making someone type it — but check it is free first:
  // the convention genuinely collides (Kevin vs Kieran Sherman both -> ksherman@).
  const emailSuggestion = await suggestCompanyEmail(candidate.displayName);
  const preOnboarding = {
    hireId: existingHire?.id ?? null,
    hireStage: existingHire?.stage ?? null,
    isHired: hired || Boolean(signedOfferApp),
    offerSigned: Boolean(signedOfferApp),
    suggestedPosition: sourceApp?.job?.title ?? cleanTitle(candidate.currentTitle),
    suggestedDepartment: sourceApp?.job?.department ?? null,
    suggestedStartDate: signedOfferApp?.offerStartDate?.toISOString() ?? null,
    suggestedEmail: emailSuggestion.email,
    emailTakenBy: emailSuggestion.takenBy,
    matchingHire
  };

  return {
    id: candidate.id,
    linkedHistorical,
    preOnboarding,
    displayName: candidate.displayName,
    firstName: candidate.firstName,
    lastName: candidate.lastName,
    currentTitle: candidate.currentTitle,
    status: candidate.status,
    stage: candidate.stage,
    owner: candidate.owner,
    source: candidate.source,
    paycomPersonId: candidate.paycomPersonId,
    paycomLink: candidate.paycomLink,
    primaryEmail: candidate.primaryEmail,
    primaryPhone: candidate.primaryPhone,
    tags: mergeTags(parseStringArray(candidate.tagsJson), candidate.candidateTags.map((ct) => ct.tag.label)),
    tagChips: mergeTagChips(
      parseStringArray(candidate.tagsJson),
      candidate.candidateTags.map((ct) => ({ label: ct.tag.label, color: ct.tag.color ?? null, source: ct.source }))
    ),
    folders: parseStringArray(candidate.foldersJson),
    pros: parseStringArray(candidate.prosJson),
    cons: parseStringArray(candidate.consJson),
    createdAt: candidate.createdAt.toISOString(),
    updatedAt: candidate.updatedAt.toISOString(),
    contacts: candidate.contacts.map((contact) => ({
      id: contact.id,
      type: contact.type,
      label: contact.label,
      value: contact.value,
      isPrimary: contact.isPrimary,
      source: contact.source
    })),
    files: candidate.files.map((file) => ({
      id: file.id,
      originalFilename: file.originalFilename,
      displayFilename: file.displayFilename,
      storageKey: file.storageKey,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      source: file.source,
      documentType: file.documentType,
      expiresAt: file.expiresAt ? file.expiresAt.toISOString() : null,
      uploadedAt: file.uploadedAt.toISOString(),
      extractedText: file.extractedText
    })),
    metrics: candidate.metrics.map((m) => ({
      id: m.id,
      key: m.key,
      label: m.label,
      valueNumber: m.valueNumber,
      valueText: m.valueText,
      unit: m.unit,
      status: m.status,
      sourceFileId: m.sourceFileId,
      sourceSnippet: m.sourceSnippet
    })),
    notes: candidate.notes.map((note) => {
      const visible = canSeeContent(Boolean(viewer?.userId && note.authorId === viewer.userId));
      return {
        id: note.id,
        body: visible ? note.body : PRIVATE_NOTE_PLACEHOLDER,
        source: note.source,
        author: note.author?.name ?? note.author?.email ?? null,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString()
      };
    }),
    activity: activityRows.map((row) => ({
      id: row.id,
      activityType: row.activityType,
      description: row.description,
      actor: row.user?.name ?? row.user?.email ?? row.userEmail ?? null,
      createdAt: row.createdAt.toISOString()
    })),
    applications: candidate.applications.map((application) => ({
      id: application.id,
      status: application.status,
      stage: application.stage,
      source: application.source,
      appliedAt: application.appliedAt?.toISOString() ?? null,
      offerStatus: application.offerStatus,
      offerSentAt: application.offerSentAt?.toISOString() ?? null,
      offerSignedAt: application.offerSignedAt?.toISOString() ?? null,
      offerDeclinedAt: application.offerDeclinedAt?.toISOString() ?? null,
      offerDeclineReason: application.offerDeclineReason,
      offerStartDate: application.offerStartDate?.toISOString() ?? null,
      offerSource: application.offerSource,
      offerSteps: parseOfferSteps(application.offerStepsJson),
      job: application.job
        ? {
            id: application.job.id,
            title: application.job.title,
            department: application.job.department,
            status: application.job.status,
            location: formatLocation(application.job.city, application.job.state)
          }
        : null,
      pilotRequirement: application.pilotRequirement
        ? {
            id: application.pilotRequirement.id,
            title: application.pilotRequirement.title,
            status: application.pilotRequirement.status,
            reviewStatus: application.pilotRequirement.reviewStatus
          }
        : null,
      questionnaire: application.questionnaireAnswers.map((q) => ({
        questionnaireName: q.questionnaireName,
        question: q.question,
        answer: q.answer
      }))
    })),
    interviews: candidate.interviews.map((interview) => {
      const authoredByViewer = Boolean(
        viewer?.email && interview.interviewerEmail && interview.interviewerEmail.toLowerCase() === viewer.email.toLowerCase()
      );
      const visible = canSeeContent(authoredByViewer);
      return {
        id: interview.id,
        title: interview.title,
        startDateTime: interview.startDateTime.toISOString(),
        endDateTime: interview.endDateTime?.toISOString() ?? null,
        interviewType: interview.interviewType,
        // Stored as JSON text. A malformed blob degrades to "nobody else was
        // there" rather than throwing the whole profile.
        coInterviewers: parseCoInterviewers(interview.coInterviewersJson),
        timezone: interview.timezone,
        interviewer: interview.interviewer,
        location: interview.location,
        meetingUrl: interview.meetingUrl,
        status: interview.status,
        notes: visible ? interview.notes : PRIVATE_NOTE_PLACEHOLDER,
        notesHtml: visible ? interview.notesHtml : null,
        interviewerEmail: interview.interviewerEmail,
        outcome: visible ? interview.outcome : null,
        rating: visible ? interview.rating : null,
        nextStep: visible ? interview.nextStep : null
      };
    }),
    origin: candidate.origin,
    jazzCandidateNumber: candidate.jazzCandidateNumber,
    isHistorical,
    historicalMatch,
    timeline,
    aiSummary: candidate.aiSummary
      ? { summary: candidate.aiSummary.summary, generatedAt: candidate.aiSummary.generatedAt.toISOString() }
      : null,
    communications: candidate.communications.map((c) => ({
      id: c.id,
      subject: c.subject,
      senderEmail: c.senderEmail,
      recipientEmail: c.recipientEmail,
      sentAt: c.sentAt ? c.sentAt.toISOString() : null,
      body: c.body,
      fromCandidate: Boolean(candidate.normalizedEmail) && normalizeEmail(c.senderEmail) === candidate.normalizedEmail
    })),
    communicationCount: candidate._count.communications
  };
}
