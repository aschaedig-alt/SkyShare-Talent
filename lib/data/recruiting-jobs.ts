import { prisma } from "@/lib/prisma";
import { canonicalTitle } from "@/lib/fleet/positions";
import { parseStringArray } from "@/lib/json";

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

function toListItem(job: {
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
}): RecruitingJobListItem {
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
    candidateCount: job._count.applications,
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

export async function getRecruitingJobsData(query = "", selectedId?: string): Promise<RecruitingJobsData> {
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

  const listItems = rows.map(toListItem);
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
      ...toListItem(row),
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
