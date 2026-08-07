/**
 * Shared query-parsing for the candidate search boxes.
 *
 * Two rules live here, and both exist because of how the JazzHR export is
 * shaped. See the comments on each function before changing them.
 */

/** Below this length a term is too short to anchor an identifier usefully. */
const MIN_IDENTIFIER_TERM = 2;

/**
 * Split a raw search box value into terms. EVERY term must match (the caller
 * ANDs them), so "Pilatus Hired" means "on the Pilatus req AND hired" rather
 * than "matches either word".
 *
 * The box is one `contains` per field, so without this a two-term query looks
 * for a single field containing the whole typed string and always returns
 * nothing — and an empty result is indistinguishable from "not in the system",
 * which is precisely the way people learn to distrust a search box.
 */
export function splitSearchTerms(query: string): string[] {
  return query.trim().split(/\s+/).filter(Boolean);
}

/**
 * Predicates for the Jazz identifier fields, anchored to the START of the value
 * rather than matched anywhere inside it.
 *
 * This is not a style preference — the id formats genuinely collide:
 *
 *   job         job_20231027170958_IIJSUJ
 *   application projob_20240305062839_PKQ7SGR5XJ3F3IH9
 *   prospect    prospect_20231004184122_25VW02EPYDL9S67A
 *
 * "projob_" CONTAINS "job_", so a substring search for a partial job id such as
 * "job_2023" matches all 3,816 application ids at once. Anchoring to the prefix
 * removes that entirely: "projob_" does not START with "job_". Bare timestamps
 * collide the same way (2,576 application ids share a timestamp segment with
 * some prospect id) and are likewise handled by anchoring.
 *
 * Substring matching is still right for the human-readable fields — a recruiter
 * typing part of a job title means it as a fragment. Nobody means a fragment of
 * an opaque token; they paste the whole thing.
 */
export function jazzIdentifierPredicates(term: string): Record<string, unknown>[] {
  if (term.length < MIN_IDENTIFIER_TERM) return [];
  const startsWith = { startsWith: term, mode: "insensitive" as const };
  return [
    // prospect_id
    { jazzCandidateNumber: startsWith },
    // application_id
    { applications: { some: { jazzApplicationNumber: startsWith } } },
    // job_id, and the Jazz requisition code (AC.2, LSM.1, ...)
    { applications: { some: { job: { sourceJobId: startsWith } } } },
    { applications: { some: { job: { jobReqId: startsWith } } } }
  ];
}

/**
 * Predicates for the human-readable historical fields: the job a candidate
 * applied to, and Jazz's own status vocabulary ("Hired - Full Time", "Not
 * Selected - Prescreen Disqualification", ...). Substring, deliberately.
 */
export function historicalTextPredicates(term: string): Record<string, unknown>[] {
  const contains = { contains: term, mode: "insensitive" as const };
  return [
    { applications: { some: { job: { title: contains } } } },
    { applications: { some: { status: contains } } }
  ];
}
