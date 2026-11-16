import { COMPANY_VALUES } from "@/lib/compliments/constants";

// Which core values one answer on an interview guide showed. PURE module, shared
// by the guide page, the chart, the interview drawer, the routes and the draft
// evaluator, so there is one rule.
//
//   asked    the values the question was written for (copied from the bank)
//   shown    values ticked BEYOND those ("also showed")       shownValuesJson
//   removed  asked values unticked: the answer did not show   removedValuesJson
//
//   the answer's values = (asked - removed) + shown
//
// Unticking an asked value was added Nov 16 2026 ("the preselected values: I
// might want to uncheck them sometimes"). It is a second column rather than a
// change to the first, so rows saved before then still read correctly.

export const VALUE_KEYS: string[] = COMPANY_VALUES.map((v) => v.colorKey);
export const VALUE_NAME: Record<string, string> = Object.fromEntries(COMPANY_VALUES.map((v) => [v.colorKey, v.name]));

export function answerValues(asked: string[], shown: string[], removed: string[]): string[] {
  const set = new Set([...asked.filter((v) => !removed.includes(v)), ...shown]);
  return VALUE_KEYS.filter((k) => set.has(k));
}

/** The two stored lists for a chosen set of values. */
export function splitValues(asked: string[], selected: string[]): { shown: string[]; removed: string[] } {
  const pick = new Set(selected);
  return {
    shown: VALUE_KEYS.filter((k) => pick.has(k) && !asked.includes(k)),
    removed: VALUE_KEYS.filter((k) => !pick.has(k) && asked.includes(k))
  };
}

/**
 * Did the interviewer set this answer's values by hand? Then the draft
 * evaluator leaves them alone. Rows from before Nov 16 have no source; a list
 * on one of those was ticked by hand, since the evaluator did not do values yet.
 */
export function valuesSetByHand(source: string | null, shown: string[], removed: string[]): boolean {
  if (source === "INTERVIEWER") return true;
  if (source === "AI") return false;
  return shown.length > 0 || removed.length > 0;
}
