import { prisma } from "@/lib/prisma";
import { CORE_VALUE_NAMES } from "@/lib/interviews/scorecard";
import { RATED_CHECKINS, RATED_DAY_MARKS, readScale, cleanRatings, type RoleProgressKey } from "@/lib/onboarding/checkin-rating";
import { readAllRatingRequestViews } from "@/lib/onboarding/checkin-rating-request";
import { richTextToPlain } from "@/lib/richtext/sanitize";

// ---------------------------------------------------------------------------
// Reports > Check-ins: every post-hire check-in rating (3, 6 and 12 months), his
// pick on Nov 17 2026 of the mock-ups: option A's score grid plus option C's
// follow-up list and check-in status.
//
// EVERYONE WITH A RATING, whatever their stage. A rating lives in its own table
// (HireCheckinRating) and survives archiving, but until this report nothing showed
// it once a person left Post-onboard - and finishing the 12-month check-in archives
// them the moment it saves. Archived and terminated people are listed and say so.
//
// FOLLOW-UP RULE (the form's, his call Nov 13): no reason is required for a low
// score, so HR talks to anyone who scored a value 1-3, answered "No" to hire again,
// or is Behind in the role. FOLLOW_UP_MAX is that line.
//
// Notes are the hiring manager's words about a named employee: this report is
// loaded for admins only, like Quality of Hire (app/reports/page.tsx).
// ---------------------------------------------------------------------------

export const FOLLOW_UP_MAX = 3;

export type CheckinRow = {
  id: string;
  newHireId: string;
  name: string;
  department: string | null;
  position: string | null;
  /** Where they are now: on Post-onboard, archived, or gone. */
  now: "POST_ONBOARD" | "ARCHIVED" | "ACTIVE" | "LEFT" | "MISSING";
  dayMark: number;
  /** 1-10 per core value, in CORE_VALUE_NAMES order; null = not seen yet. */
  scores: (number | null)[];
  /** A rating saved before the 1-10 form: its four-word bands instead. */
  legacyBands: (string | null)[] | null;
  progress: RoleProgressKey | null;
  hireAgain: boolean | null;
  ratedBy: string | null;
  note: string | null;
  ratedOn: string;
  followUp: string[];
};

export type CheckinStatus = {
  dayMark: number;
  label: string;
  answered: number;
  waiting: number;
  expired: number;
  /** On Post-onboard, past the day mark, check-in still open. Some already have a link waiting. */
  dueNoRating: number;
};

export type CheckinReport = {
  rows: CheckinRow[];
  status: CheckinStatus[];
  sent: number;
  managers: { name: string; answered: number }[];
};

const RATED_BY = /^Rating link \((.*)\)$/;
const DAY = 86_400_000;

const HIRE_SELECT = { id: true, name: true, department: true, position: true, stage: true, employmentStatus: true, canceled: true } as const;
type HireBits = { id: string; name: string; department: string | null; position: string | null; stage: string; employmentStatus: string; canceled: boolean };
type RatingRecord = { id: string; newHireId: string; dayMark: number; ratingsJson: string; wouldHireAgain: boolean | null; managerName: string | null; notes: string | null; enteredBy: string | null; updatedAt: Date };

/** One stored rating as a report row - shared by the report and the profile's Check-ins tab. */
function toRow(r: RatingRecord, h: HireBits | undefined): CheckinRow {
  let raw: unknown = {};
  try {
    raw = JSON.parse(r.ratingsJson);
  } catch {
    raw = {};
  }
  const scale = readScale(raw);
  const bands = cleanRatings(raw);
  const scores = CORE_VALUE_NAMES.map((v) => scale?.scores[v] ?? null);
  const legacy = !scale && Object.keys(bands).length ? CORE_VALUE_NAMES.map((v) => bands[v] ?? null) : null;
  const nowState: CheckinRow["now"] = !h
    ? "MISSING"
    : h.canceled || h.employmentStatus === "TERMINATED"
      ? "LEFT"
      : h.stage === "POST_ONBOARD" || h.stage === "ARCHIVED"
        ? h.stage
        : "ACTIVE";
  const progress = scale?.progress ?? null;
  const followUp = [
    scores.some((s) => s !== null && s <= FOLLOW_UP_MAX) || (legacy?.some((b) => b === "DOES_NOT_MEET") ?? false) ? "a score of 1 to 3" : null,
    r.wouldHireAgain === false ? "would not hire again" : null,
    progress === "BEHIND" ? "behind in the role" : null
  ].filter((x): x is string => Boolean(x));
  return {
    id: r.id,
    newHireId: r.newHireId,
    name: h?.name ?? "Deleted employee record",
    department: h?.department?.trim() || null,
    position: h?.position?.trim() || null,
    now: nowState,
    dayMark: r.dayMark,
    scores,
    legacyBands: legacy,
    progress,
    hireAgain: r.wouldHireAgain,
    ratedBy: r.enteredBy?.match(RATED_BY)?.[1] ?? r.managerName ?? r.enteredBy ?? null,
    note: r.notes ? richTextToPlain(r.notes).trim() || null : null,
    ratedOn: r.updatedAt.toISOString(),
    followUp
  };
}

/** One person's check-in ratings, 3-month first - the profile's Check-ins tab. Admins only (the caller gates it). */
export async function getCheckinRowsForHire(newHireId: string): Promise<CheckinRow[]> {
  const [ratings, hire] = await Promise.all([
    prisma.hireCheckinRating.findMany({ where: { newHireId, dayMark: { in: RATED_DAY_MARKS } }, orderBy: { dayMark: "asc" } }),
    prisma.newHire.findUnique({ where: { id: newHireId }, select: HIRE_SELECT })
  ]);
  return ratings.map((r) => toRow(r, hire ?? undefined));
}

export async function getCheckinReport(now: Date = new Date()): Promise<CheckinReport> {
  const [ratings, requests, post] = await Promise.all([
    prisma.hireCheckinRating.findMany({ where: { dayMark: { in: RATED_DAY_MARKS } }, orderBy: { createdAt: "desc" } }),
    readAllRatingRequestViews(),
    prisma.newHire.findMany({
      where: { stage: "POST_ONBOARD", canceled: false },
      select: { startDate: true, tasks: { where: { key: { in: RATED_CHECKINS.map((c) => c.taskKey) } }, select: { key: true, status: true } } }
    })
  ]);

  const hires = await prisma.newHire.findMany({ where: { id: { in: [...new Set(ratings.map((r) => r.newHireId))] } }, select: HIRE_SELECT });
  const byId = new Map(hires.map((h) => [h.id, h]));
  const rows: CheckinRow[] = ratings.map((r) => toRow(r, byId.get(r.newHireId)));

  const status: CheckinStatus[] = RATED_CHECKINS.map((c) => {
    const mine = requests.filter((q) => q.dayMark === c.dayMark);
    return {
      dayMark: c.dayMark,
      label: c.title,
      answered: rows.filter((r) => r.dayMark === c.dayMark).length,
      waiting: mine.filter((q) => q.state === "PENDING").length,
      expired: mine.filter((q) => q.state === "EXPIRED").length,
      dueNoRating: post.filter(
        (p) => p.startDate && now.getTime() - p.startDate.getTime() >= c.dayMark * DAY && p.tasks.some((t) => t.key === c.taskKey && t.status === "TODO")
      ).length
    };
  });

  const counts = new Map<string, number>();
  for (const r of rows) if (r.ratedBy) counts.set(r.ratedBy, (counts.get(r.ratedBy) ?? 0) + 1);
  const managers = [...counts.entries()].map(([name, answered]) => ({ name, answered })).sort((a, b) => b.answered - a.answered || a.name.localeCompare(b.name));

  return { rows, status, sent: requests.filter((q) => q.state !== "CANCELLED").length, managers };
}
