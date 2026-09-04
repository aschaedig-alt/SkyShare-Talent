/**
 * Keyword filtering over the candidate cards on a role's screening panel.
 *
 * The point is triage in bulk: type "jet 0", get back every card whose Jet time
 * line reads 0 hrs, then set the whole lot aside in one action instead of
 * working down 50 cards with a dropdown each.
 *
 * ---------------------------------------------------------------------------
 * WHY TERMS MUST LAND ON THE SAME LINE
 *
 * The obvious build — join the whole card into one string and require every
 * term somewhere in it — was written first and measured against the live
 * Challenger 350 First Officer scan. It returned 26 cards for "jet 0" and SIX
 * of them were people with 3,190 / 4,110 / 12,055 / 13,204 / 23,000 jet hours.
 * The word "jet" came from their Jet time line and the "0" came from somewhere
 * else entirely — a recency figure, an hours-in-type line. Bulk-skipping that
 * result as "no jet time" would have set aside a 23,000-hour pilot.
 *
 * So a card matches when ONE OF ITS LINES holds every term. A line is the header
 * (name, title, stage, readiness, summary) or a single factor (its label, detail
 * and source). "jet 0" then means the Jet time line reads 0, which is the
 * question actually being asked.
 *
 * The cost is that terms from different lines no longer combine — "morales jet"
 * finds nobody. That is the right trade: a query that silently means something
 * other than what it looks like is worse than one that finds nothing.
 *
 * ---------------------------------------------------------------------------
 * WHY A NUMBER IS MATCHED WHOLE AND A WORD BY ITS START
 *
 * A plain substring search for "0" hits the 0 inside 500 and inside every
 * minimum on the line. Anchoring to the start of a word is not enough either,
 * and the test that proved it is worth remembering: a thousands separator IS a
 * word boundary, so "\b0" happily matches the "000" in "4,000 hrs". Numbers
 * therefore match a whole token, against a comma-stripped copy of the line so
 * that typing 1500 finds "1,500". Words keep prefix matching, because "smi"
 * finding "Smith" is what a person expects when typing part of a name.
 *
 * A PURE module (no Prisma, no React) so both the client panel and any future
 * server-side caller can use it, and so the term rule can be reasoned about on
 * its own.
 */

import type { PilotRequirementCandidateMatch } from "@/lib/matching/pilot-requirement-matches";

/**
 * The card broken into the lines a reader sees it as.
 *
 * Built from the SAME fields MatchCard renders — the factor lines only after the
 * card is expanded, which is fair enough since the hour detail is exactly what
 * the filter exists to reach, but nothing here is text that has no home on the
 * card at all.
 */
export function matchSegments(match: PilotRequirementCandidateMatch): string[] {
  const header = [
    match.candidateName,
    match.currentTitle,
    match.stage,
    match.readiness,
    match.summary,
    match.positionSkip?.note,
    match.excludedNote
  ]
    .filter(Boolean)
    .join(" · ");

  return [
    header,
    ...match.hardGaps,
    ...match.subScores.map((sub) => sub.label),
    ...match.factors.map((factor) => [factor.label, factor.detail, factor.sourceLabel].filter(Boolean).join(" · "))
  ].filter((segment) => segment.length > 0);
}

/** Split a raw query box value into the terms that must all match. */
export function searchTerms(query: string): string[] {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function escapeRe(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Digits, with the separators a formatted number may carry. */
const NUMERIC_TERM = /^[\d.,]+$/;

/**
 * One term against one line.
 *
 * A numeric term must be a WHOLE token, tested against the comma-stripped copy
 * ONLY — a thousands separator is a word boundary, so "3,200" offers a phantom
 * token "200" that "\b200\b" would match in the raw text. A word term matches
 * from the start of any word. A term opening with punctuation (someone pastes
 * "· min") falls back to a plain substring, because \b is only meaningful next
 * to a word character and would otherwise never match anything.
 */
function termMatches(segment: string, flattened: string, term: string): boolean {
  if (NUMERIC_TERM.test(term)) {
    const escaped = escapeRe(term.replace(/,/g, ""));
    return new RegExp(`\\b${escaped}\\b`, "i").test(flattened);
  }
  const escaped = escapeRe(term);
  const pattern = /^\w/.test(term) ? `\\b${escaped}` : escaped;
  return new RegExp(pattern, "i").test(segment);
}

/** True when some single line of the card carries every term in the query. */
export function matchesQuery(match: PilotRequirementCandidateMatch, terms: string[]): boolean {
  if (terms.length === 0) return true;
  return matchSegments(match).some((segment) => {
    const flattened = segment.replace(/,/g, "");
    return terms.every((term) => termMatches(segment, flattened, term));
  });
}

/** Convenience for a list: filter in place, preserving the caller's order. */
export function filterMatches(
  matches: PilotRequirementCandidateMatch[],
  terms: string[]
): PilotRequirementCandidateMatch[] {
  if (terms.length === 0) return matches;
  return matches.filter((match) => matchesQuery(match, terms));
}
