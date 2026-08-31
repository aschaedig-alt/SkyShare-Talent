/**
 * WHO THE MATCHER IS ALLOWED TO SEE.
 *
 * This used to be `status: "ACTIVE"` scattered across five call sites, which
 * quietly meant the matcher only ever considered 200 of 3,433 people: the 3,143
 * archived Jazz records had never been scanned once. The whole point of the
 * archive is to be reminded of someone you already met, so the pool is now
 * everyone EXCEPT:
 *
 *   - MERGED records, which are duplicates already folded into another
 *     candidate. Scanning them would surface the same human twice.
 *   - anyone carrying a scanExcludedReason (the skip list), unless the caller
 *     explicitly asks to see skipped people.
 *
 * ARCHIVED is deliberately IN. It marks a historical Jazz import, not a person
 * who is unavailable — that judgement is what the skip list is for.
 *
 * A PURE module (no Prisma import) so client components can use the labels.
 */

/** Statuses that are never scannable, whatever else is true of the record. */
export const NEVER_SCANNED_STATUS = "MERGED";

/** Status marking a historical (Jazz) import rather than a live pipeline record. */
export const ARCHIVE_STATUS = "ARCHIVED";

export function isArchivedCandidateStatus(status: string | null | undefined) {
  return status === ARCHIVE_STATUS;
}

/**
 * Prisma `where` for the scannable pool. Pass includeExcluded to also return
 * people on the skip list (the "Include skipped" escape hatch in the UI).
 */
export function scanPoolWhere(includeExcluded = false) {
  return {
    status: { not: NEVER_SCANNED_STATUS },
    ...(includeExcluded ? {} : { scanExcludedReason: null })
  };
}

/** Just the live pipeline half of the pool, for the "current" count. */
export function currentPoolWhere(includeExcluded = false) {
  return {
    status: { notIn: [NEVER_SCANNED_STATUS, ARCHIVE_STATUS] },
    ...(includeExcluded ? {} : { scanExcludedReason: null })
  };
}

/** Just the archive half, for the "archive" count. */
export function archivePoolWhere(includeExcluded = false) {
  return {
    status: ARCHIVE_STATUS,
    ...(includeExcluded ? {} : { scanExcludedReason: null })
  };
}

/**
 * How many results each half of a scan returns. The archive gets its own budget
 * rather than competing in one list: archived people out-rank live candidates
 * often enough that a single merged cut pushed the working pipeline off the
 * board entirely.
 *
 * RAISED FROM 12 TO 50 on 2026-08-30, at the user's request. 12 was too small to
 * be a useful shortlist: every scan hit the ceiling, so the Screening panel's
 * filter tab permanently read "All 12" while 3,541 people had actually been
 * scored (422 live, 3,119 archived) — and PC-12 Captain alone carries 476
 * applications.
 *
 * RAISING THIS IS CHEAP. It is a DISPLAY slice, not a scan budget: the matcher
 * already fetches and scores the entire pool in memory (pilot-requirement-matches.ts
 * scores every row returned by scanPoolWhere before any slice is taken), so a
 * bigger number costs rendering and nothing else. No extra queries, no API calls.
 *
 * If 50 is still not enough, this is the only place to change it — but keep the
 * two halves separate, and keep the label honest: the Screening panel says "Top"
 * rather than "All" whenever a list comes back at the limit.
 */
export const CURRENT_MATCH_LIMIT = 50;
export const ARCHIVE_MATCH_LIMIT = 50;
