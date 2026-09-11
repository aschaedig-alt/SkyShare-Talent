/**
 * Detail fields on a new hire that can be marked "not needed".
 *
 * WHY THIS LIST EXISTS. Most of the Dates & training and HR fields are
 * PILOT-specific. On a Customer Service Representative or a Base Support hire
 * they sit empty for the whole of onboarding, and the accordion header counts
 * them as missing — "3 OF 7" on a section where four of the seven were never
 * going to apply. Asked for directly on 2026-09-11, with the fields named:
 * indoc start and end, training date, training location, the Paycom seniority
 * number, aircraft service date, and the managed aircraft tail.
 *
 * WHAT MARKING ONE DOES, and does not do:
 *   - it greys the field and labels it, so it reads as answered rather than
 *     forgotten;
 *   - it stops counting toward that section's "n of m";
 *   - it does NOT hide the field. Her words: "the field doesn't have to
 *     disappear even";
 *   - it does NOT clear the value. Somebody who is not a pilot today and moves
 *     into a pilot seat later keeps whatever was already typed, and unticking
 *     the box brings it straight back. That is the whole reason this is a flag
 *     and not a delete.
 *
 * ORIENTATION IS NOT IN HERE. `NewHire.orientationNotNeeded` is its own column
 * because it does real work beyond presentation: it keeps somebody off the
 * orientation page's outstanding list. These keys are presentational only, which
 * is exactly why they can share one array.
 *
 * TO ADD ANOTHER: add the key here and nothing else. The column is a string
 * array, the UI is driven off this list, and no migration is involved. She said
 * plainly she is still finding them.
 */

/** A detail-field key that can be marked not needed. */
export const OPTIONAL_FIELD_KEYS = [
  "indocStartDate",
  "indocEndDate",
  "trainingDate",
  "trainingLocation",
  "seniorityNumber",
  "aircraftServiceDate",
  "managedAircraft"
] as const;

export type OptionalFieldKey = (typeof OPTIONAL_FIELD_KEYS)[number];

const KEY_SET: ReadonlySet<string> = new Set(OPTIONAL_FIELD_KEYS);

/** Can this field be marked not needed at all? */
export function isOptionalField(key: string): key is OptionalFieldKey {
  return KEY_SET.has(key);
}

/**
 * Clean an incoming list of keys.
 *
 * Unknown keys are DROPPED rather than stored. The column is a free string
 * array, so without this a typo or a stale key from an older build would sit in
 * the row forever, greying nothing and confusing the next reader. Duplicates are
 * collapsed and the order is made stable so two saves of the same set produce
 * the same value.
 */
export function normalizeFieldsNotNeeded(input: unknown): OptionalFieldKey[] {
  if (!Array.isArray(input)) return [];
  const out = new Set<OptionalFieldKey>();
  for (const raw of input) {
    if (typeof raw !== "string") continue;
    const key = raw.trim();
    if (isOptionalField(key)) out.add(key);
  }
  return OPTIONAL_FIELD_KEYS.filter((k) => out.has(k));
}

/** The label shown on the greyed-out field, so it reads as a decision. */
export const NOT_NEEDED_LABEL = "Not needed";
