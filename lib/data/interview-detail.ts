import { prisma } from "@/lib/prisma";
import { resolveDepartmentKey, interviewDepartmentRaw, type DeptKey } from "@/lib/calendar/departments";
import {
  scorecardAverage,
  interviewAverage,
  isRatingKey,
  type RecommendationKey,
  type ScorecardItem
} from "@/lib/interviews/scorecard";
import { parseStringArray } from "@/lib/json";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";

export type ScorecardView = {
  id: string;
  interviewer: string;
  recommendation: RecommendationKey | null;
  items: ScorecardItem[];
  comments: string | null;
  average: number | null;
  updatedAt: string;
};

export type InterviewDetail = {
  id: string;
  title: string;
  interviewType: string;
  startDateTime: string;
  endDateTime: string | null;
  timezone: string | null;
  status: string;
  location: string | null;
  candidate: { id: string; displayName: string; currentTitle: string | null };
  job: { id: string; title: string; department: string | null } | null;
  departmentKey: DeptKey | null;
  scorecards: ScorecardView[];
  aggregate: { average: number | null; count: number; recommendations: Partial<Record<RecommendationKey, number>> };
  bankQuestions: string[];
  interviewers: Array<{ name: string; role: string; departments: string[] }>;
};


function parseItems(json: string): ScorecardItem[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((i) => i && typeof i.q === "string")
      .map((i) => ({ q: i.q as string, rating: isRatingKey(i.rating) ? i.rating : null }));
  } catch {
    return [];
  }
}

// viewer is REQUIRED, not optional: the only caller is a request-serving page,
// and an optional parameter here would default to unrestricted every time
// somebody forgot it — which is exactly how this route came to be a bypass.
//
// It is worth being blunt about why this needs its own check. /interviews/[id]
// is gated on the CALENDAR module, not on candidates, so hiding Candidates from
// a restricted viewer does nothing to it: they can still reach every scorecard's
// free-text comments by id. Scoping has to happen here, at the data layer.
//
// Returns null — the same answer as "no such interview" — when the candidate is
// off-allowlist, so the page 404s. A 403 would confirm the interview exists,
// which tells a restricted manager that the person is in the system at all.
export async function getInterviewDetail(id: string, viewer: ViewerScope | null): Promise<InterviewDetail | null> {
  const interview = await prisma.interview.findUnique({
    where: { id },
    include: {
      candidate: {
        select: {
          id: true,
          displayName: true,
          currentTitle: true,
          // Fallback source for the department — the interview's own job link is
          // almost always null. See interviewDepartmentRaw().
          applications: {
            where: { jobId: { not: null } },
            orderBy: { appliedAt: "desc" },
            select: { job: { select: { department: true } } }
          }
        }
      },
      job: { select: { id: true, title: true, department: true } },
      scorecards: { orderBy: { createdAt: "asc" } }
    }
  });
  if (!interview) return null;
  // Checked before the two follow-up queries below, so an off-allowlist id costs
  // nothing beyond the lookup that already happened.
  if (!isCandidateVisible(viewer, interview.candidateId)) return null;

  const resolved = resolveDepartmentKey(
    interviewDepartmentRaw(
      interview.job?.department,
      interview.candidate.applications.map((application) => application.job?.department)
    )
  ).deptKey;
  const departmentKey = resolved === "unassigned" ? null : resolved;

  const scorecards: ScorecardView[] = interview.scorecards.map((card) => {
    const items = parseItems(card.itemsJson);
    return {
      id: card.id,
      interviewer: card.interviewer,
      recommendation: (card.recommendation as RecommendationKey | null) ?? null,
      items,
      comments: card.comments,
      average: scorecardAverage(items),
      updatedAt: card.updatedAt.toISOString()
    };
  });

  const recommendations: Partial<Record<RecommendationKey, number>> = {};
  for (const card of scorecards) {
    if (card.recommendation) recommendations[card.recommendation] = (recommendations[card.recommendation] ?? 0) + 1;
  }

  // Active bank questions suited to this interview's department (empty tags = all).
  const allActive = await prisma.interviewQuestion.findMany({
    where: { isActive: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }],
    select: { text: true, departmentsJson: true }
  });
  const bankQuestions = allActive
    .filter((q) => {
      if (!departmentKey) return true;
      const depts = parseStringArray(q.departmentsJson);
      return depts.length === 0 || depts.includes(departmentKey);
    })
    .map((q) => q.text);

  const hosts = await prisma.bookingHost.findMany({
    where: { isActive: true },
    select: { name: true, role: true, departmentsJson: true }
  });
  const interviewers = hosts
    .filter((h) => h.name.trim())
    .map((h) => ({ name: h.name, role: h.role, departments: parseStringArray(h.departmentsJson) }));

  return {
    id: interview.id,
    title: interview.title,
    interviewType: interview.interviewType,
    startDateTime: interview.startDateTime.toISOString(),
    endDateTime: interview.endDateTime?.toISOString() ?? null,
    timezone: interview.timezone,
    status: interview.status,
    location: interview.location,
    candidate: {
      id: interview.candidate.id,
      displayName: interview.candidate.displayName,
      currentTitle: interview.candidate.currentTitle
    },
    job: interview.job ? { id: interview.job.id, title: interview.job.title, department: interview.job.department } : null,
    departmentKey,
    scorecards,
    aggregate: {
      average: interviewAverage(scorecards.map((s) => s.average)),
      count: scorecards.length,
      recommendations
    },
    bankQuestions,
    interviewers
  };
}
