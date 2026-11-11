import { prisma } from "@/lib/prisma";
import { parseOfferSteps } from "@/lib/offers/steps";
import { isTestTagged } from "@/lib/testdata/markers";
import { CHECKIN_RATING_DAY } from "@/lib/onboarding/checkin-rating";

// ---------------------------------------------------------------------------
// The Quality of Hire tracking check - milestone 4. His wording (Nov 5, 2026):
// from Dec 10 "every new hire's record has interviews logged in Journey, the
// recruiter, the hiring manager; a reason on any declined offer; manager
// check-ins. Check on Dec 17: every offer made since Dec 10 has all four."
//
// An offer counts once it is MADE - sent, signed or declined (not one only planned
// or started, nor one that was never sent) - dated by its earliest recorded moment
// (a ticked step, or sent / signed / declined), on or after TRACKING_FROM. For each one, four things:
//   interviews   at least one interview logged on the candidate (not cancelled,
//                not the offer call, not an imported Jazz evaluation or demo row),
//                and whether any of its scorecards rates the core values
//   recruiter    CandidateApplication.recruiterName
//   manager      CandidateApplication.hiringManager
//   reason       a decline reason - asked only of a declined offer
// Until TRACKING_FROM the same check runs over the last PRACTICE_DAYS, so the
// gaps can be seen and closed before it counts.
//
// Also listed: 90-day check-ins due without a rating - people past day 90 and not
// past day 150 (a window, so a years-old hire is never "due").
// ---------------------------------------------------------------------------

export const TRACKING_FROM = "2026-12-10";
const PRACTICE_DAYS = 30;
const DUE_WINDOW_DAYS = 60;
const DAY = 86_400_000;

export type TrackedOffer = {
  applicationId: string;
  candidateId: string;
  candidate: string;
  job: string | null;
  status: string;
  offerOn: string;
  interviews: number;
  valuesScored: boolean;
  recruiter: string | null;
  hiringManager: string | null;
  declineReason: string | null;
  /** The four items, true when this offer has it (reason counts true when not declined). */
  has: { interviews: boolean; recruiter: boolean; hiringManager: boolean; reason: boolean };
  complete: boolean;
};

export type RatingDue = { id: string; name: string; startDate: string; day: number };

export type QohTracking = {
  from: string;
  /** True before TRACKING_FROM: the list is the last PRACTICE_DAYS, a practice run. */
  practice: boolean;
  offers: TrackedOffer[];
  ratingsDue: RatingDue[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function getQohTracking(now: Date = new Date()): Promise<QohTracking> {
  const practice = iso(now) < TRACKING_FROM;
  const from = practice ? iso(new Date(now.getTime() - PRACTICE_DAYS * DAY)) : TRACKING_FROM;
  const fromMs = Date.parse(`${from}T00:00:00Z`);

  const apps = await prisma.candidateApplication.findMany({
    where: { offerStatus: { in: ["SENT", "SIGNED", "DECLINED"] } },
    select: {
      id: true,
      candidateId: true,
      offerStatus: true,
      offerStepsJson: true,
      offerSentAt: true,
      offerSignedAt: true,
      offerDeclinedAt: true,
      offerDeclineReason: true,
      recruiterName: true,
      hiringManager: true,
      historicalJobTitle: true,
      job: { select: { title: true } },
      candidate: { select: { displayName: true, tagsJson: true } }
    }
  });

  // When the offer got under way: its earliest recorded moment.
  const started = apps
    .map((a) => {
      const moments = [a.offerSentAt, a.offerSignedAt, a.offerDeclinedAt].filter((d): d is Date => Boolean(d)).map((d) => d.getTime());
      for (const at of Object.values(parseOfferSteps(a.offerStepsJson))) {
        const t = at ? Date.parse(at) : NaN;
        if (!Number.isNaN(t)) moments.push(t);
      }
      return { a, at: moments.length ? Math.min(...moments) : null };
    })
    .filter((x): x is { a: (typeof apps)[number]; at: number } => x.at !== null && x.at >= fromMs);

  const candidateIds = [...new Set(started.map((x) => x.a.candidateId))];
  const interviews = candidateIds.length
    ? await prisma.interview.findMany({
        where: {
          candidateId: { in: candidateIds },
          status: { notIn: ["CANCELLED", "CANCELED"] },
          NOT: [{ source: "seed-demo" }, { source: "JAZZ" }, { interviewType: "OFFER" }]
        },
        select: { candidateId: true, scorecards: { select: { itemsJson: true } } }
      })
    : [];
  const byCandidate = new Map<string, typeof interviews>();
  for (const i of interviews) byCandidate.set(i.candidateId, [...(byCandidate.get(i.candidateId) ?? []), i]);
  const ratesValues = (json: string) => {
    try {
      const items = JSON.parse(json) as Array<{ value?: unknown; rating?: unknown }>;
      return Array.isArray(items) && items.some((it) => typeof it.value === "string" && it.value && typeof it.rating === "string");
    } catch {
      return false;
    }
  };

  const offers: TrackedOffer[] = started
    .filter((x) => !isTestTagged(parseTags(x.a.candidate?.tagsJson)))
    .map(({ a, at }) => {
      const ivs = byCandidate.get(a.candidateId) ?? [];
      const declined = a.offerStatus === "DECLINED";
      const has = {
        interviews: ivs.length > 0,
        recruiter: Boolean(a.recruiterName?.trim()),
        hiringManager: Boolean(a.hiringManager?.trim()),
        reason: !declined || Boolean(a.offerDeclineReason?.trim())
      };
      return {
        applicationId: a.id,
        candidateId: a.candidateId,
        candidate: a.candidate?.displayName ?? "Unknown",
        job: a.job?.title ?? a.historicalJobTitle ?? null,
        status: a.offerStatus,
        offerOn: iso(new Date(at)),
        interviews: ivs.length,
        valuesScored: ivs.some((i) => i.scorecards.some((s) => ratesValues(s.itemsJson))),
        recruiter: a.recruiterName,
        hiringManager: a.hiringManager,
        declineReason: a.offerDeclineReason,
        has,
        complete: has.interviews && has.recruiter && has.hiringManager && has.reason
      };
    })
    .sort((x, y) => (x.offerOn < y.offerOn ? 1 : -1));

  // 90-day ratings due: people past day 90 and inside the window, with no rating.
  const lo = new Date(now.getTime() - (CHECKIN_RATING_DAY + DUE_WINDOW_DAYS) * DAY);
  const hi = new Date(now.getTime() - CHECKIN_RATING_DAY * DAY);
  const people = await prisma.newHire.findMany({
    where: { canceled: false, employmentStatus: { not: "TERMINATED" }, startDate: { gte: lo, lte: hi } },
    select: { id: true, name: true, startDate: true, tags: true }
  });
  const rated = new Set(
    (await prisma.hireCheckinRating.findMany({ where: { newHireId: { in: people.map((p) => p.id) }, dayMark: CHECKIN_RATING_DAY }, select: { newHireId: true } })).map((r) => r.newHireId)
  );
  const ratingsDue: RatingDue[] = people
    .filter((p) => p.startDate && !rated.has(p.id) && !isTestTagged(p.tags))
    .map((p) => ({ id: p.id, name: p.name, startDate: iso(p.startDate as Date), day: Math.floor((now.getTime() - (p.startDate as Date).getTime()) / DAY) }))
    .sort((a, b) => b.day - a.day);

  return { from, practice, offers, ratingsDue };
}

function parseTags(json: string | null | undefined): string[] {
  try {
    const v = JSON.parse(json ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
