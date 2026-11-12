import { prisma } from "@/lib/prisma";
import { cleanRichInput, richNoteTooLong } from "@/lib/richtext/stored";
import { CHECKIN_RATING_DAY, CHECKIN_RATING_TASK_KEY, cleanRatings, type CheckinRatingView, type CheckinTickResult } from "@/lib/onboarding/checkin-rating";
import { MAINTENANCE_GROUP } from "@/lib/onboarding/tasks";
import { maybeArchiveOnCheckinsComplete } from "@/lib/data/onboarding";

// Saving a 90-day check-in rating, and ticking the 90-day check-in done because of
// it. ONE implementation for both ways a rating arrives:
//   - HR enters it in the app (app/api/onboarding/checkin-ratings, commit 2c28d61);
//   - the hiring manager submits the no-login link (app/api/rate/[token], feedback
//     cmwcq16o7).
// Moved here out of the route so the link cannot tick the check-in any differently
// from the in-app save: completedAt set, and the last check-in done archives.

const tidy = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) || null : null);

export function checkinRatingView(r: {
  newHireId: string;
  dayMark: number;
  ratingsJson: string;
  wouldHireAgain: boolean | null;
  managerName: string | null;
  notes: string | null;
  enteredBy: string | null;
  updatedAt: Date;
}): CheckinRatingView {
  let ratings = {};
  try {
    ratings = cleanRatings(JSON.parse(r.ratingsJson));
  } catch {
    ratings = {};
  }
  return { newHireId: r.newHireId, dayMark: r.dayMark, ratings, wouldHireAgain: r.wouldHireAgain, managerName: r.managerName, notes: r.notes, enteredBy: r.enteredBy, updatedAt: r.updatedAt.toISOString() };
}

export type SaveCheckinRatingInput = {
  newHireId: string;
  ratings: unknown;
  wouldHireAgain: unknown;
  managerName: unknown;
  notes: unknown;
  enteredBy: string | null;
};

export type SaveCheckinRatingResult =
  | ({ ok: true; rating: CheckinRatingView } & CheckinTickResult)
  | { ok: false; status: number; message: string };

/** Validate the answers. Separate so the link can refuse bad input before it spends its one submission. */
export function checkCheckinRatingInput(input: Pick<SaveCheckinRatingInput, "ratings" | "wouldHireAgain" | "notes">): { ok: true } | { ok: false; message: string } {
  const ratings = cleanRatings(input.ratings);
  const wouldHireAgain = typeof input.wouldHireAgain === "boolean" ? input.wouldHireAgain : null;
  if (!Object.keys(ratings).length && wouldHireAgain === null) {
    return { ok: false, message: 'Rate at least one value, or answer "would you hire again?"' };
  }
  const tooLong = richNoteTooLong(cleanRichInput(input.notes));
  if (tooLong) return { ok: false, message: tooLong };
  return { ok: true };
}

export async function saveCheckinRating(input: SaveCheckinRatingInput): Promise<SaveCheckinRatingResult> {
  const { newHireId } = input;
  if (!newHireId) return { ok: false, status: 400, message: "Which person?" };
  const check = checkCheckinRatingInput(input);
  if (!check.ok) return { ok: false, status: 400, message: (check as { message: string }).message };
  const hire = await prisma.newHire.findUnique({ where: { id: newHireId }, select: { id: true } });
  if (!hire) return { ok: false, status: 404, message: "Person not found." };

  const data = {
    ratingsJson: JSON.stringify(cleanRatings(input.ratings)),
    wouldHireAgain: typeof input.wouldHireAgain === "boolean" ? input.wouldHireAgain : null,
    managerName: tidy(input.managerName, 80),
    // Rich text since feedback cmwcjtm5k; the shared 4000 limit is on the words typed (checked above).
    notes: cleanRichInput(input.notes),
    enteredBy: input.enteredBy
  };
  const saved = await prisma.hireCheckinRating.upsert({
    where: { newHireId_dayMark: { newHireId, dayMark: CHECKIN_RATING_DAY } },
    create: { newHireId, dayMark: CHECKIN_RATING_DAY, ...data },
    update: data
  });

  // A rating means the 90-day check-in happened, so it ticks that check-in done -
  // from any screen (his call, Nov 11: "Yes, tick it"). Same as ticking it by hand
  // in onboarding-tasks/[id]: completedAt set, and the last check-in done archives.
  const tick: CheckinTickResult = { checkinDone: false, archived: false };
  const task = await prisma.onboardingTask.findUnique({
    where: { newHireId_key: { newHireId, key: CHECKIN_RATING_TASK_KEY } },
    select: { id: true, status: true, group: true }
  });
  if (task) {
    if (task.status !== "DONE") {
      await prisma.onboardingTask.update({ where: { id: task.id }, data: { status: "DONE", completedAt: new Date() } });
      if (task.group === MAINTENANCE_GROUP) tick.archived = await maybeArchiveOnCheckinsComplete(newHireId);
    }
    tick.checkinDone = true;
  }
  return { ok: true, rating: checkinRatingView(saved), ...tick };
}
