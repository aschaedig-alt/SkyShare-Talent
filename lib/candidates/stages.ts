/**
 * The candidate pipeline stages, as one list.
 *
 * Stage was a free-text field: whatever the JazzHR import wrote, plus whatever
 * anybody typed into the profile's Stage box. That is how you get a pipeline
 * nobody can filter or report on — one typo makes a stage of one.
 *
 * These are the values that ACTUALLY EXIST in the live database, put in
 * pipeline order. Screening and Interviewing were added here before anybody was
 * on them, on the grounds that the pipeline was clearly meant to have them and
 * there was nowhere else for a candidate mid-interview to sit; both are in use
 * now (8 people each, counted 2026-09-08).
 *
 * NOTHING IS MIGRATED. This only controls what the pickers offer — every
 * existing value is preserved, and an unrecognised one is shown as its own
 * option rather than being quietly replaced (see stageOptionsFor).
 *
 * PURE module (no Prisma) so client components can import it.
 */
import { isTagColor } from "@/lib/tags/colors";

export type StageGroup = "Open" | "Closed";

export type CandidateStage = {
  value: string;
  group: StageGroup;
  /**
   * A colour from the shared tag palette (lib/tags/colors.ts), or null to fall
   * back to the keyword guess.
   *
   * The Status pill used to pick its colour by matching words in the stage name
   * — "hire" or "offer" meant green, "reject" meant grey — which is a guess that
   * breaks the moment somebody renames a stage to something the matcher has
   * never heard of. A chosen colour is one less thing that can silently drift
   * from what the list actually says.
   */
  color?: string | null;
};

/**
 * Live in the pipeline — someone is still working this candidate.
 *
 * MATCHES THE SAVED LIST, and has to stay that way. Open was narrowed to these
 * five and Hired moved to Closed (scripts/tidy-stage-list.ts); "Prescreen
 * Complete" was retired and its eight people rewritten to Screening. This
 * default was left carrying both of those, so the one situation it exists for —
 * the saved list being missing — would have quietly restored a shape that had
 * been deliberately changed, with Hired reading as still in play.
 */
const OPEN_STAGES: Array<[string, string]> = [
  ["New", "amber"],
  ["Applied", "amber"],
  ["Screening", "indigo"],
  ["Interviewing", "indigo"],
  ["Offer", "violet"]
];

/**
 * Out of the pipeline, for one reason or another.
 *
 * "Saved For Later" sits here because nobody is actively working it, even
 * though it is not a rejection. Hired is here because a hired candidate is a
 * finished one — that grouping is what makes the Closed badge on the list mean
 * "no longer in play" rather than "went badly".
 *
 * Hired is green and Offer is violet on purpose. The keyword guess this
 * replaces gave both the same green (it matched "hire" OR "offer" in one rule),
 * so the two ends of the pipeline — one still to be decided, one settled — were
 * indistinguishable at a glance on a list whose whole job is to be scanned.
 */
const CLOSED_STAGES: Array<[string, string]> = [
  ["Hired", "emerald"],
  ["Saved For Later", "sky"],
  ["Withdrew", "slate"],
  ["Rejected", "rose"],
  ["Knocked Out", "slate"],
  ["Archived", "slate"]
];

/**
 * The DEFAULT list — the seed, not the last word.
 *
 * The live list is editable at /candidates/manage and stored in a
 * WorkspaceSetting; see lib/data/candidate-stages.ts. This stays here as the
 * fallback for when nothing has been saved, and because this module has to stay
 * pure so client components can import it.
 */
export const CANDIDATE_STAGES: CandidateStage[] = [
  ...OPEN_STAGES.map(([value, color]) => ({ value, group: "Open" as const, color })),
  ...CLOSED_STAGES.map(([value, color]) => ({ value, group: "Closed" as const, color }))
];

/**
 * Case-insensitive lookup for a stage list, built once per list.
 *
 * CACHED BY LIST IDENTITY, and that matters now rather than being a
 * micro-optimisation. This used to build a fresh Map on every call, which was
 * fine when the only callers were pickers — but each row of the candidate list
 * now asks twice (once for the colour, once for whether the stage is closed),
 * so a 500-row page was building a thousand throwaway Maps per render on a page
 * that has already been reported as laggy.
 *
 * A WeakMap keyed on the array is safe because the list arrives as one stable
 * object from the server and is never mutated in place; a genuinely new list
 * gets a new entry, and the old one is collected with it.
 */
const lowerCache = new WeakMap<CandidateStage[], Map<string, CandidateStage>>();

const byLower = (list: CandidateStage[]) => {
  const cached = lowerCache.get(list);
  if (cached) return cached;
  const built = new Map(list.map((s) => [s.value.toLowerCase(), s]));
  lowerCache.set(list, built);
  return built;
};

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
    const rawColor = (item as { color?: unknown }).color;
    // Validated against the palette rather than trusted: an unknown colour name
    // would render as no class at all, which reads as a styling bug.
    const color = typeof rawColor === "string" && isTagColor(rawColor) ? rawColor : null;
    out.push({ value, group, color });
  }
  return out.length ? out : CANDIDATE_STAGES;
}

/** The stored entry for a stage, or null when it is not on the list. */
export function findStage(
  stage: string | null | undefined,
  list: CandidateStage[] = CANDIDATE_STAGES
): CandidateStage | null {
  const raw = stage?.trim();
  if (!raw) return null;
  return byLower(list).get(raw.toLowerCase()) ?? null;
}

/**
 * Is this candidate out of the pipeline?
 *
 * Answers "should the row read as finished" — which is a different question
 * from Candidate.archivedAt. Somebody Rejected last week is closed but very
 * much not archived, and the list previously had no way to show that.
 *
 * A stage NOT on the list returns false: an unrecognised value is more likely
 * to be an old import than a closure, and greying somebody out on a guess is
 * worse than leaving them looking active.
 */
export function isClosedStage(
  stage: string | null | undefined,
  list: CandidateStage[] = CANDIDATE_STAGES
): boolean {
  return findStage(stage, list)?.group === "Closed";
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
