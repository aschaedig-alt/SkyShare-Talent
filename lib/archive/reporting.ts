import { prisma } from "@/lib/prisma";

export type CountRow = { label: string; count: number };

export type HistoricalReports = {
  totalCandidates: number;
  totalApplications: number;
  repeatApplicants: number;
  applicationsByYear: CountRow[];
  byDisposition: CountRow[];
  offersMade: number;
  offersAccepted: number;
  acceptanceRate: number | null;
  topRejectionReasons: CountRow[];
  recruiterActivity: CountRow[];
  interviewerActivity: CountRow[];
};

function tally(map: Map<string, number>, key: string | null | undefined, by = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + by);
}

function toRows(map: Map<string, number>, limit?: number): CountRow[] {
  const rows = [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  return limit ? rows.slice(0, limit) : rows;
}

export async function getHistoricalReports(): Promise<HistoricalReports> {
  const [apps, interviews, totalCandidates] = await Promise.all([
    prisma.candidateApplication.findMany({
      where: { origin: "JAZZ" },
      select: {
        appliedAt: true,
        disposition: true,
        status: true,
        rejectionReason: true,
        candidateId: true,
        job: { select: { recruiter: true } }
      }
    }),
    prisma.interview.findMany({ where: { source: "JAZZ" }, select: { interviewer: true } }),
    prisma.candidate.count({ where: { origin: "JAZZ" } })
  ]);

  const byYear = new Map<string, number>();
  const byDisposition = new Map<string, number>();
  const byRejection = new Map<string, number>();
  const byRecruiter = new Map<string, number>();
  const perCandidate = new Map<string, number>();
  let offersMade = 0;
  let offersAccepted = 0;
  let offersDeclined = 0;

  for (const a of apps) {
    tally(byYear, a.appliedAt ? String(a.appliedAt.getFullYear()) : "Unknown");
    tally(byDisposition, a.disposition ?? "APPLIED");
    tally(perCandidate, a.candidateId);
    tally(byRecruiter, a.job?.recruiter ?? null);

    const status = (a.status ?? "").toLowerCase();
    if (a.disposition === "HIRED") {
      offersMade++;
      offersAccepted++;
    } else if (status.includes("declined")) {
      offersMade++;
      offersDeclined++;
    } else if (a.disposition === "OFFER" || status.includes("offer")) {
      offersMade++;
    }

    if (a.disposition === "REJECTED") tally(byRejection, a.rejectionReason ?? a.status ?? "Unspecified");
  }

  const byInterviewer = new Map<string, number>();
  for (const i of interviews) tally(byInterviewer, i.interviewer);

  const repeatApplicants = [...perCandidate.values()].filter((n) => n > 1).length;
  const acceptanceDenominator = offersAccepted + offersDeclined;
  const acceptanceRate = acceptanceDenominator > 0 ? offersAccepted / acceptanceDenominator : null;

  return {
    totalCandidates,
    totalApplications: apps.length,
    repeatApplicants,
    applicationsByYear: toRows(byYear).sort((a, b) => a.label.localeCompare(b.label)),
    byDisposition: toRows(byDisposition),
    offersMade,
    offersAccepted,
    acceptanceRate,
    topRejectionReasons: toRows(byRejection, 8),
    recruiterActivity: toRows(byRecruiter, 10),
    interviewerActivity: toRows(byInterviewer, 10)
  };
}
