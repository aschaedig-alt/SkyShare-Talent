import { prisma } from "@/lib/prisma";
import { normalizeName, normalizePhone } from "@/lib/candidates/normalize";

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
  truncated: boolean;
};

export const DISPOSITIONS = ["APPLIED", "INTERVIEWED", "OFFER", "REJECTED", "HIRED"] as const;

const RESULT_LIMIT = 100;

function ci(value: string) {
  return { contains: value, mode: "insensitive" as const };
}

export async function searchHistorical(filters: HistoricalSearchFilters): Promise<HistoricalSearchResult> {
  // Always scope to historical records — created-from-Jazz or merged-with-Jazz.
  const and: Record<string, unknown>[] = [{ OR: [{ origin: "JAZZ" }, { historicalSourceId: { not: null } }] }];

  const q = filters.q?.trim();
  if (q) {
    and.push({
      OR: [
        { normalizedName: { contains: normalizeName(q) ?? q.toLowerCase() } },
        { displayName: ci(q) },
        { primaryEmail: ci(q) },
        { primaryPhone: { contains: normalizePhone(q) ?? q } },
        { jazzCandidateNumber: ci(q) },
        { applications: { some: { job: { title: ci(q) } } } },
        { applications: { some: { job: { recruiter: ci(q) } } } },
        { interviews: { some: { interviewer: ci(q) } } },
        { notes: { some: { body: ci(q) } } },
        { interviews: { some: { notes: ci(q) } } }
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

  const [total, candidates] = await Promise.all([
    prisma.candidate.count({ where }),
    prisma.candidate.findMany({
      where,
      take: RESULT_LIMIT,
      orderBy: [{ displayName: "asc" }],
      include: {
        applications: {
          orderBy: { appliedAt: "desc" },
          include: { job: { select: { title: true, recruiter: true } } }
        },
        _count: { select: { interviews: true } }
      }
    })
  ]);

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

  return { rows, total, truncated: total > RESULT_LIMIT };
}
