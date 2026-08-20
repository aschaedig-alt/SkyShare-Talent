import { prisma } from "@/lib/prisma";
import { canonicalTitle } from "@/lib/fleet/positions";
import { parseStringArray } from "@/lib/json";
import { candidateScopeWhere } from "@/lib/auth/candidate-scope";
import type { ViewerScope } from "@/lib/auth/viewer-scope";

export type RecruitingJobListItem = {
  id: string;
  title: string;
  department: string | null;
  status: string;
  /** Active = OPEN (hiring). Inactive = anything else (RETIRED/FILLED). Drives active-first sort + the toggle. */
  isActive: boolean;
  city: string | null;
  state: string | null;
  pilotSeat: string | null;
  aircraftTypes: string[];
  isPilotRole: boolean;
  candidateCount: number;
  requirementCount: number;
  updatedAt: string;
};

export type RecruitingJobDetail = RecruitingJobListItem & {
  recruiter: string | null;
  jobReqId: string | null;
  /** Paycom's requisition number (3296). Their emails quote it; Jazz codes never match. */
  paycomReqId: string | null;
  sourceFilename: string | null;
  paySummary: string | null;
  rawPayScale: string | null;
  rawMinimumRequirements: string | null;
  jobDescriptionText: string | null;
  linkedRequirements: Array<{
    id: string;
    title: string;
    status: string;
    reviewStatus: string;
    pilotSeat: string | null;
  }>;
  linkedCandidates: Array<{
    id: string;
    displayName: string;
    currentTitle: string | null;
    stage: string | null;
    status: string | null;
  }>;
};

export type RecruitingJobsData = {
  jobs: RecruitingJobListItem[];
  /** Full detail for EVERY job, keyed by id, so the client can switch the
   * selected job instantly with no server round-trip. */
  details: Record<string, RecruitingJobDetail>;
  selectedJob: RecruitingJobDetail | null;
  stats: {
    total: number;
    open: number;
    pilot: number;
    support: number;
    withCandidates: number;
  };
};


function locationLabel(city: string | null, state: string | null) {
  return [city, state].filter(Boolean).join(", ") || null;
}

function toListItem(
  job: {
    id: string;
    title: string;
    department: string | null;
    status: string;
    city: string | null;
    state: string | null;
    pilotSeat: string | null;
    aircraftTypesJson: string | null;
    isPilotRole: boolean;
    updatedAt: Date;
    _count: {
      applications: number;
      pilotRequirements: number;
    };
  },
  // Applicant count as this viewer may see it. Omitted (the unrestricted case)
  // falls through to the unfiltered _count, so nothing changes for anyone who
  // is not allowlist-scoped. NOTE: because this now takes a second parameter it
  // must never be handed straight to Array.map, which would pass the index.
  candidateCount?: number
): RecruitingJobListItem {
  return {
    id: job.id,
    title: canonicalTitle(job.title),
    department: job.department,
    status: job.status,
    isActive: job.status === "OPEN",
    city: job.city,
    state: job.state,
    pilotSeat: job.pilotSeat,
    aircraftTypes: parseStringArray(job.aircraftTypesJson),
    isPilotRole: job.isPilotRole,
    candidateCount: candidateCount ?? job._count.applications,
    requirementCount: job._count.pilotRequirements,
    updatedAt: job.updatedAt.toISOString()
  };
}

function matchesSearch(job: RecruitingJobListItem, query: string) {
  if (!query) {
    return true;
  }

  const searchable = [
    job.title,
    job.department,
    job.status,
    job.pilotSeat,
    locationLabel(job.city, job.state),
    ...job.aircraftTypes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(query.toLowerCase());
}

export async function getRecruitingJobsData(
  query = "",
  selectedId?: string,
  // Optional and trailing so any non-request caller keeps working; omitted means
  // unrestricted. Pass it from anything serving a signed-in user — linkedCandidates
  // below carries a candidate id, name and current title for EVERY application on
  // EVERY job, in the first-paint payload.
  viewer?: ViewerScope | null
): Promise<RecruitingJobsData> {
  // Null for anyone who is not allowlist-scoped, so the query below comes out
  // byte-identical to what it has always been for every existing user.
  //
  // Applied through the relation (candidate: { id: { in: ... } }) rather than the
  // applications.candidateId column, matching lib/data/recent-interviews.ts: the
  // column-shaped helper returns an index-signature Record, which is not worth
  // spreading into a Prisma where clause.
  const scope = candidateScopeWhere(viewer);
  const [rows, total, open, pilot, withCandidates] = await Promise.all([
    prisma.job.findMany({
      where: { mergedIntoJobId: null },
      orderBy: [{ isPilotRole: "desc" }, { department: "asc" }, { title: "asc" }],
      include: {
        _count: {
          select: {
            applications: true,
            pilotRequirements: true
          }
        },
        pilotRequirements: {
          select: {
            id: true,
            title: true,
            status: true,
            reviewStatus: true,
            pilotSeat: true
          }
        },
        applications: {
          // `undefined` is Prisma for "no filter", so the unrestricted case is
          // the exact query that was here before. Not a conditional spread: this
          // object is what Prisma infers the result shape from, and a spread
          // would turn it into a union.
          where: scope ? { candidate: scope } : undefined,
          include: {
            candidate: {
              select: {
                id: true,
                displayName: true,
                currentTitle: true
              }
            }
          },
          orderBy: { updatedAt: "desc" }
        }
      }
    }),
    prisma.job.count({ where: { mergedIntoJobId: null } }),
    prisma.job.count({ where: { mergedIntoJobId: null, status: "OPEN" } }),
    prisma.job.count({ where: { mergedIntoJobId: null, isPilotRole: true } }),
    prisma.job.count({ where: { mergedIntoJobId: null, applications: { some: {} } } })
  ]);

  // The applications array is loaded in full (no `take`), so its length IS the
  // applicant count — the scoped one once the where above is on. The
  // unrestricted path keeps reading _count, so that case is untouched.
  //
  // Not `rows.map(toListItem)` any more: toListItem takes a second parameter
  // now, and map would have passed it the array index.
  const candidateCountFor = (job: (typeof rows)[number]) =>
    scope ? job.applications.length : job._count.applications;
  const listItems = rows.map((row) => toListItem(row, candidateCountFor(row)));
  // Active (OPEN) jobs first. Stable sort, so the DB's isPilotRole/department/title
  // order is preserved within the active and inactive groups (Node's sort is stable).
  listItems.sort((a, b) => (a.isActive === b.isActive ? 0 : a.isActive ? -1 : 1));
  const jobs = listItems.filter((job) => matchesSearch(job, query));
  const selectedRow =
    rows.find((job) => job.id === selectedId) ??
    rows.find((job) => jobs.some((listItem) => listItem.id === job.id)) ??
    rows[0] ??
    null;
  // Build the full detail for EVERY job up front (rows are already loaded, so no
  // extra queries) and hand it all to the client for instant selection.
  const details: Record<string, RecruitingJobDetail> = {};
  for (const row of rows) {
    details[row.id] = {
      ...toListItem(row, candidateCountFor(row)),
      recruiter: row.recruiter,
      jobReqId: row.jobReqId,
      paycomReqId: row.paycomReqId,
      sourceFilename: row.sourceFilename,
      paySummary: row.paySummary,
      rawPayScale: row.rawPayScale,
      rawMinimumRequirements: row.rawMinimumRequirements,
      jobDescriptionText: row.jobDescriptionText,
      linkedRequirements: row.pilotRequirements.map((requirement) => ({
        ...requirement,
        title: canonicalTitle(requirement.title)
      })),
      linkedCandidates: row.applications.map((application) => ({
        id: application.candidate.id,
        displayName: application.candidate.displayName,
        currentTitle: application.candidate.currentTitle,
        stage: application.stage,
        status: application.status
      }))
    };
  }

  return {
    jobs,
    details,
    selectedJob: selectedRow ? details[selectedRow.id] : null,
    stats: {
      total,
      open,
      pilot,
      support: total - pilot,
      withCandidates
    }
  };
}
