import { prisma } from "@/lib/prisma";
import { cleanRichInput, richNoteTooLong } from "@/lib/richtext/stored";
import {
  cleanRatings,
  ratedCheckin,
  parseAnswers,
  readScale,
  type CheckinRatingView,
  type CheckinTickResult
} from "@/lib/onboarding/checkin-rating";
import { MAINTENANCE_GROUP } from "@/lib/onboarding/tasks";
import { maybeArchiveOnCheckinsComplete } from "@/lib/data/onboarding";

// Saving a 90-day check-in rating, and ticking the 90-day check-in done because of
// it. ONE implementation for both ways a rating arrives:
//   - HR enters it in the app (app/api/onboarding/checkin-ratings, commit 2c28d61);
//   - the hiring manager submits the no-login link (app/api/rate/[token], feedback
//     cmwcq16o7).
// Both post the same 1-10 answers (lib/onboarding/checkin-rating.ts, parseAnswers),
// so the link cannot store or tick anything differently from the in-app save.

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
  let parsed: unknown = {};
  try {
    parsed = JSON.parse(r.ratingsJson);
  } catch {
    parsed = {};
  }
  return {
    newHireId: r.newHireId,
    dayMark: r.dayMark,
    ratings: cleanRatings(parsed),
    scale: readScale(parsed),
    wouldHireAgain: r.wouldHireAgain,
    managerName: r.managerName,
    notes: r.notes,
    enteredBy: r.enteredBy,
    updatedAt: r.updatedAt.toISOString()
  };
}

export type SaveCheckinRatingInput = {
  newHireId: string;
  /** 90, 180 or 365 - which check-in this rating is for. */
  dayMark: number;
  /** The form's answers: { scores, reasons, progress, wouldHireAgain, hireAgainReason }. */
  answers: unknown;
  managerName: unknown;
  notes: unknown;
  enteredBy: string | null;
};

export type SaveCheckinRatingResult =
  | ({ ok: true; rating: CheckinRatingView } & CheckinTickResult)
  | { ok: false; status: number; message: string };

/** Validate everything. Separate so the link can refuse bad input before it spends its one submission. */
export function checkCheckinRatingInput(input: Pick<SaveCheckinRatingInput, "answers" | "notes">): { ok: true } | { ok: false; message: string } {
  const parsed = parseAnswers(input.answers);
  if (!parsed.ok) return { ok: false, message: (parsed as { message: string }).message };
  const tooLong = richNoteTooLong(cleanRichInput(input.notes));
  if (tooLong) return { ok: false, message: tooLong };
  return { ok: true };
}

export async function saveCheckinRating(input: SaveCheckinRatingInput): Promise<SaveCheckinRatingResult> {
  const { newHireId } = input;
  if (!newHireId) return { ok: false, status: 400, message: "Which person?" };
  const checkin = ratedCheckin(input.dayMark);
  if (!checkin) return { ok: false, status: 400, message: "Which check-in? (90-day, 6-month or 12-month)" };
  const dayMark = checkin.dayMark;
  const parsed = parseAnswers(input.answers);
  if (!parsed.ok) return { ok: false, status: 400, message: (parsed as { message: string }).message };
  const notes = cleanRichInput(input.notes);
  const tooLong = richNoteTooLong(notes);
  if (tooLong) return { ok: false, status: 400, message: tooLong };
  const hire = await prisma.newHire.findUnique({ where: { id: newHireId }, select: { id: true } });
  if (!hire) return { ok: false, status: 404, message: "Person not found." };

  const good = parsed as Extract<typeof parsed, { ok: true }>;
  const data = {
    ratingsJson: JSON.stringify(good.ratingsJson),
    wouldHireAgain: good.wouldHireAgain,
    managerName: tidy(input.managerName, 80),
    // Rich text since feedback cmwcjtm5k; the shared 4000 limit is on the words typed (checked above).
    notes,
    enteredBy: input.enteredBy
  };
  const saved = await prisma.hireCheckinRating.upsert({
    where: { newHireId_dayMark: { newHireId, dayMark } },
    create: { newHireId, dayMark, ...data },
    update: data
  });

  // A rating means its check-in happened, so it ticks that check-in done -
  // from any screen (his call, Nov 11: "Yes, tick it"). Same as ticking it by hand
  // in onboarding-tasks/[id]: completedAt set, and the last check-in done archives.
  const tick: CheckinTickResult = { checkinDone: false, archived: false };
  const task = await prisma.onboardingTask.findUnique({
    where: { newHireId_key: { newHireId, key: checkin.taskKey } },
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
