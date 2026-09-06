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

/**
 * The DEFAULT list — the seed, not the last word.
 *
 * The live list is editable at /candidates/manage and stored in a
 * WorkspaceSetting; see lib/data/candidate-stages.ts. This stays here as the
 * fallback for when nothing has been saved, and because this module has to stay
 * pure so client components can import it.
 */
export const CANDIDATE_STAGES: CandidateStage[] = [
  ...OPEN_STAGES.map((value) => ({ value, group: "Open" as const })),
  ...CLOSED_STAGES.map((value) => ({ value, group: "Closed" as const }))
];

const byLower = (list: CandidateStage[]) =>
  new Map(list.map((s) => [s.value.toLowerCase(), s]));

/** Is this an on-the-list stage? Case-insensitive, so "applied" counts. */
export function isKnownStage(
  stage: string | null | undefined,
  list: CandidateStage[] = CANDIDATE_STAGES
): boolean {
  return Boolean(stage && byLower(list).has(stage.trim().toLowerCase()));
}

/** The canonical spelling of a stage, or the value unchanged when we don't know
    it — never null for a non-empty input, because losing somebody's stage to a
    capitalisation difference would be worse than showing it as-is. */
export function canonicalStage(
  stage: string | null | undefined,
  list: CandidateStage[] = CANDIDATE_STAGES
): string | null {
  const raw = stage?.trim();
  if (!raw) return null;
  return byLower(list).get(raw.toLowerCase())?.value ?? raw;
}

/**
 * Read a stored stage list back, dropping anything unusable.
 *
 * Falls back to the defaults when nothing survives, so a corrupt or emptied
 * setting can never leave the pickers with no options at all. Pure, so both the
 * server reader and the client editor can use it.
 */
export function sanitizeStageList(raw: unknown): CandidateStage[] {
  if (!Array.isArray(raw)) return CANDIDATE_STAGES;
  const seen = new Set<string>();
  const out: CandidateStage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const value = String((item as { value?: unknown }).value ?? "").trim();
    if (!value || value.length > 40) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue; // a duplicate would render twice and sort oddly
    seen.add(key);
    const group = (item as { group?: unknown }).group === "Closed" ? "Closed" : "Open";
    out.push({ value, group });
  }
  return out.length ? out : CANDIDATE_STAGES;
}

/**
 * The options a picker should show for a candidate currently on `stage`.
 *
 * If they sit on something not in the list — an old import value, a stage
 * somebody typed — it is added at the top under "Current" so opening the
 * dropdown can never silently rewrite their record. That is the whole reason
 * this returns options per candidate instead of a constant.
 */
export function stageOptionsFor(
  stage: string | null | undefined,
  list: CandidateStage[] = CANDIDATE_STAGES
): { group: string; values: string[] }[] {
  const groups: { group: string; values: string[] }[] = [];
  const current = stage?.trim();
  // Also covers a stage that has been RETIRED from the list while somebody is
  // still on it — retiring must never rewrite a record, only stop offering it.
  if (current && !isKnownStage(current, list)) groups.push({ group: "Current", values: [current] });

  const open = list.filter((s) => s.group === "Open").map((s) => s.value);
  const closed = list.filter((s) => s.group === "Closed").map((s) => s.value);
  if (open.length) groups.push({ group: "Open", values: open });
  if (closed.length) groups.push({ group: "Closed", values: closed });
  return groups;
}
