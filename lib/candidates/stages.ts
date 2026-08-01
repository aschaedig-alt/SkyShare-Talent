/**
 * The candidate pipeline stages, as one list.
 *
 * Stage was a free-text field: whatever the JazzHR import wrote, plus whatever
 * anybody typed into the profile's Stage box. That is how you get a pipeline
 * nobody can filter or report on — one typo makes a stage of one.
 *
 * These are the values that ACTUALLY EXIST in the live database (counted
 * 2026-08-01), put in pipeline order, plus Screening and Interviewing. Those two
 * are not in the data yet but the list UI has always coloured them (stagePill
 * matches "screen" and "interview"), so the pipeline was clearly meant to have
 * them and there is nowhere else for a candidate mid-interview to sit.
 *
 * NOTHING IS MIGRATED. This only controls what the pickers offer — every
 * existing value is preserved, and an unrecognised one is shown as its own
 * option rather than being quietly replaced (see stageOptionsFor).
 *
 * PURE module (no Prisma) so client components can import it.
 */

export type StageGroup = "Open" | "Closed";

export type CandidateStage = { value: string; group: StageGroup };

/** Live in the pipeline — someone is still working this candidate. */
const OPEN_STAGES = ["New", "Applied", "Screening", "Prescreen Complete", "Interviewing", "Offer", "Hired"];

/** Out of the pipeline, for one reason or another. "Saved For Later" sits here
    because nobody is actively working it, even though it is not a rejection. */
const CLOSED_STAGES = ["Saved For Later", "Withdrew", "Rejected", "Knocked Out", "Archived"];

export const CANDIDATE_STAGES: CandidateStage[] = [
  ...OPEN_STAGES.map((value) => ({ value, group: "Open" as const })),
  ...CLOSED_STAGES.map((value) => ({ value, group: "Closed" as const }))
];

const BY_LOWER = new Map(CANDIDATE_STAGES.map((s) => [s.value.toLowerCase(), s]));

/** Is this an on-the-list stage? Case-insensitive, so "applied" counts. */
export function isKnownStage(stage: string | null | undefined): boolean {
  return Boolean(stage && BY_LOWER.has(stage.trim().toLowerCase()));
}

/** The canonical spelling of a stage, or the value unchanged when we don't know
    it — never null for a non-empty input, because losing somebody's stage to a
    capitalisation difference would be worse than showing it as-is. */
export function canonicalStage(stage: string | null | undefined): string | null {
  const raw = stage?.trim();
  if (!raw) return null;
  return BY_LOWER.get(raw.toLowerCase())?.value ?? raw;
}

/**
 * The options a picker should show for a candidate currently on `stage`.
 *
 * If they sit on something not in the list — an old import value, a stage
 * somebody typed — it is added at the top under "Current" so opening the
 * dropdown can never silently rewrite their record. That is the whole reason
 * this returns options per candidate instead of a constant.
 */
export function stageOptionsFor(stage: string | null | undefined): { group: string; values: string[] }[] {
  const groups: { group: string; values: string[] }[] = [];
  const current = stage?.trim();
  if (current && !isKnownStage(current)) groups.push({ group: "Current", values: [current] });
  groups.push({ group: "Open", values: OPEN_STAGES });
  groups.push({ group: "Closed", values: CLOSED_STAGES });
  return groups;
}
