import { prisma } from "@/lib/prisma";
import { normalizeName, normalizePhone } from "@/lib/candidates/normalize";
import {
  historicalTextPredicates,
  jazzIdentifierPredicates,
  splitSearchTerms
} from "@/lib/candidates/search-terms";

export type HistoricalSearchFilters = {
  q?: string;
  recruiter?: string;
  interviewer?: string;
  disposition?: string;
  jobTitle?: string;
  candidateNumber?: string;
  applicationNumber?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
};

export type HistoricalSearchRow = {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  jazzCandidateNumber: string | null;
  applicationCount: number;
  interviewCount: number;
  latestStatus: string | null;
  latestDisposition: string | null;
  topJobTitle: string | null;
  recruiters: string[];
};

export type HistoricalSearchResult = {
  rows: HistoricalSearchRow[];
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export const DISPOSITIONS = ["APPLIED", "INTERVIEWED", "OFFER", "REJECTED", "HIRED"] as const;

export const PAGE_SIZE = 100;

/**
 * Page sizes the archive offers.
 *
 * Mirrors CANDIDATE_PAGE_SIZES deliberately — same numbers, same reasoning.
 * The archive is ~3,200 rows, and the job being done is scanning them, not
 * looking one up, so paging 100 at a time is the actual complaint. 500 is a
 * real cost per load (each row counts its applications and interviews), so it
 * stays opt-in per request rather than becoming the default, and the ceiling
 * stops a hand-typed ?size= from asking for the whole table.
 */
export const ARCHIVE_PAGE_SIZES = [100, 250, 500] as const;

/** Coerce a ?size= into one of the offered sizes; anything else falls back to the default. */
export function normalizeArchivePageSize(input: unknown): number {
  const n = typeof input === "string" ? Number.parseInt(input, 10) : typeof input === "number" ? input : NaN;
  return (ARCHIVE_PAGE_SIZES as readonly number[]).includes(n) ? n : PAGE_SIZE;
}

function ci(value: string) {
  return { contains: value, mode: "insensitive" as const };
}

export async function searchHistorical(filters: HistoricalSearchFilters): Promise<HistoricalSearchResult> {
  // Always scope to historical records — created-from-Jazz or merged-with-Jazz.
  const and: Record<string, unknown>[] = [{ OR: [{ origin: "JAZZ" }, { historicalSourceId: { not: null } }] }];

  // One OR-block per typed term, ANDed by virtue of being separate entries in
  // `and`. A single match against the whole string meant any two-term query
  // ("Pilatus Hired") returned nothing at all.
  for (const term of splitSearchTerms(filters.q ?? "")) {
    and.push({
      OR: [
        { normalizedName: { contains: normalizeName(term) ?? term.toLowerCase() } },
        { displayName: ci(term) },
        { primaryEmail: ci(term) },
        { primaryPhone: { contains: normalizePhone(term) ?? term } },
        { applications: { some: { job: { recruiter: ci(term) } } } },
        { interviews: { some: { interviewer: ci(term) } } },
        { notes: { some: { body: ci(term) } } },
        { interviews: { some: { notes: ci(term) } } },
        // Jazz identifiers are PREFIX-matched, not substring — "projob_"
        // contains "job_", so substring matching on a partial job id would drag
        // in every application in the archive. See lib/candidates/search-terms.ts.
        ...jazzIdentifierPredicates(term),
        // Job title and Jazz's own status vocabulary.
        ...historicalTextPredicates(term)
      ]
    });
  }

  if (filters.recruiter?.trim())
    and.push({ applications: { some: { job: { recruiter: ci(filters.recruiter.trim()) } } } });
  if (filters.interviewer?.trim())
    and.push({ interviews: { some: { interviewer: ci(filters.interviewer.trim()) } } });
  if (filters.disposition?.trim())
    and.push({ applications: { some: { disposition: filters.disposition.trim().toUpperCase() } } });
  if (filters.jobTitle?.trim())
    and.push({ applications: { some: { job: { title: ci(filters.jobTitle.trim()) } } } });
  if (filters.candidateNumber?.trim())
    and.push({ jazzCandidateNumber: ci(filters.candidateNumber.trim()) });
  if (filters.applicationNumber?.trim())
    and.push({ applications: { some: { jazzApplicationNumber: ci(filters.applicationNumber.trim()) } } });

  const from = filters.from ? new Date(filters.from) : null;
  const to = filters.to ? new Date(filters.to) : null;
  if ((from && !isNaN(from.getTime())) || (to && !isNaN(to.getTime()))) {
    and.push({
      applications: {
        some: {
          appliedAt: {
            ...(from && !isNaN(from.getTime()) ? { gte: from } : {}),
            ...(to && !isNaN(to.getTime()) ? { lte: to } : {})
          }
        }
      }
    });
  }

  const where = { AND: and };

  const pageSize = normalizeArchivePageSize(filters.pageSize);
  const total = await prisma.candidate.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  // Clamp so a hand-typed or stale ?page= never lands on an empty table.
  const page = Math.min(Math.max(1, Math.floor(filters.page ?? 1)), pageCount);

  const candidates = await prisma.candidate.findMany({
    where,
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: [{ displayName: "asc" }, { id: "asc" }],
    include: {
      applications: {
        orderBy: { appliedAt: "desc" },
        include: { job: { select: { title: true, recruiter: true } } }
      },
      _count: { select: { interviews: true } }
    }
  });

  const rows: HistoricalSearchRow[] = candidates.map((c) => {
    const latest = c.applications[0] ?? null;
    const recruiters = [
      ...new Set(c.applications.map((a) => a.job?.recruiter).filter((v): v is string => Boolean(v)))
    ];
    const topJobTitle = c.applications.find((a) => a.job?.title)?.job?.title ?? null;
    return {
      id: c.id,
      displayName: c.displayName,
      primaryEmail: c.primaryEmail,
      jazzCandidateNumber: c.jazzCandidateNumber,
      applicationCount: c.applications.length,
      interviewCount: c._count.interviews,
      latestStatus: latest?.status ?? null,
      latestDisposition: latest?.disposition ?? null,
      topJobTitle,
      recruiters
    };
  });

  return { rows, total, page, pageCount, pageSize };
}
