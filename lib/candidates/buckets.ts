/**
 * Which bucket a candidate belongs in, and why.
 *
 * This is the meaning behind the segment rail on /candidates. It is deliberately
 * PURE — no Prisma, no React — so the list query, the rail and the Paycom
 * importer can all share one definition. Two copies of this ladder that drift
 * apart is how somebody ends up in "Not selected" on one screen and "Talent
 * pool" on another.
 *
 * The vocabulary comes from Paycom, which spells the same outcome more than one
 * way (see dispositionGroup). Everything here matches on MEANING, not on an
 * exact string, because the exact strings are not stable.
 */

/** Where a candidate sits. One bucket each — the ladder below picks exactly one. */
export type CandidateBucket =
  | "active"
  | "offered"
  | "pool"
  | "hired"
  | "notselected"
  | "historical";

/**
 * The outcome of a SINGLE application, normalised.
 *
 * Paycom's own vocabulary, in the order a recruiter moves through it. Kept
 * separate from the bucket because a person with five applications has five of
 * these and only one bucket.
 */
export type ApplicationOutcome =
  | "Active"
  | "Offered"
  | "Hired"
  | "SavedForLater"
  | "Denied"
  | "KnockedOut"
  | "DeclinedOffer"
  | "Archived";

/** Why an application ended. Coarser than the raw text, which has ~53 variants. */
export type DispositionGroup =
  | "hired"
  | "offered"
  | "evergreen"
  | "interview"
  | "incomplete"
  | "positionfilled"
  | "notqualified"
  | "noteligible"
  | "withdrew"
  | "declined"
  | "knockout"
  | "admin"
  | "none"
  | "other";

export const BUCKET_LABEL: Record<CandidateBucket, string> = {
  active: "Active",
  offered: "Offered",
  pool: "Talent pool",
  hired: "Hired",
  notselected: "Not selected",
  historical: "Historical"
};

/**
 * The rail's stages, and the one colour each carries.
 *
 * Drawn from the palette already in use so the rail stays inside the design
 * system. These are referenced by the group's top rule, its label, and the
 * stripe down every item in it.
 */
export type RailStage = "working" | "decided" | "archive" | "across" | "manage";

export const STAGE_COLOR: Record<RailStage, { light: string; dark: string }> = {
  working: { light: "#0369a1", dark: "#7dd3fc" }, // in play
  decided: { light: "#047857", dark: "#6ee7b7" }, // settled
  archive: { light: "#63666a", dark: "#93a7bb" }, // dormant
  across: { light: "#6d28d9", dark: "#c4b5fd" }, // cuts through the buckets
  manage: { light: "#466481", dark: "#8fb3d6" } // admin, not a bucket
};

export const BUCKET_STAGE: Record<CandidateBucket, RailStage> = {
  active: "working",
  offered: "working",
  pool: "working",
  hired: "decided",
  notselected: "decided",
  historical: "archive"
};

/** Order the rail renders them in. */
export const BUCKET_ORDER: CandidateBucket[] = [
  "active",
  "offered",
  "pool",
  "hired",
  "notselected",
  "historical"
];

/** Two-letter chips for the collapsed rail. */
export const BUCKET_INITIALS: Record<CandidateBucket, string> = {
  active: "AC",
  offered: "OF",
  pool: "TP",
  hired: "HI",
  notselected: "NS",
  historical: "HS"
};

export function isCandidateBucket(value: string): value is CandidateBucket {
  return (BUCKET_ORDER as string[]).includes(value);
}

/**
 * Cross-cutting filters — a DIFFERENT AXIS from the buckets.
 *
 * A bucket answers "where is this person", and every candidate has exactly one,
 * which is why the six have to sum to the population. These answer "what is
 * true about this person", cut across all six, and combine with them: somebody
 * can be Active AND type rated, or Not selected AND have failed an interview.
 *
 * They are kept apart from CandidateBucket for exactly that reason — folding
 * them into the same list would break the sum and make the counts a lie.
 */
export type CandidateAcross = "interview" | "typed";

export const ACROSS_ORDER: CandidateAcross[] = ["interview", "typed"];

export const ACROSS_LABEL: Record<CandidateAcross, string> = {
  interview: "Failed interview",
  typed: "Type rated"
};

export function isCandidateAcross(value: string): value is CandidateAcross {
  return (ACROSS_ORDER as string[]).includes(value);
}

/**
 * Group a raw Paycom/Jazz disposition string into a reason.
 *
 * Ported from the import builder so the page and the importer agree. The two
 * spellings of "didn't pass interview" are the reason this matches on a pattern
 * rather than a literal: Paycom stores both a straight apostrophe and a curly
 * one, and matching one loses about a third of the cases.
 */
/**
 * The key a stored group override is filed under: the wording, tidied the same
 * way the grouper tidies it, so a saved override and a live row agree.
 */
export function reasonKey(disposition: string | null | undefined): string {
  return (disposition ?? "").toLowerCase().trim().replace(/^xx\s*-\s*/, "");
}

/** wording key -> the group somebody chose for it, beating the patterns below. */
export type DispositionOverrides = Record<string, DispositionGroup>;

export function dispositionGroup(
  disposition: string | null | undefined,
  outcome?: ApplicationOutcome | null,
  overrides?: DispositionOverrides
): DispositionGroup {
  // Jazz-era statuses carry an "xx - " prefix that the display strips. Strip it
  // here too, or the grouper matches the prefix instead of the meaning.
  const d = reasonKey(disposition);

  // A CHOSEN group wins over every pattern below. The patterns are a good guess
  // at 39 wordings nobody wrote for us; when one of them guesses wrong, this is
  // how it gets corrected without editing code.
  if (d && overrides && overrides[d]) return overrides[d];

  if (!d) {
    if (outcome === "Hired") return "hired";
    if (outcome === "Offered") return "offered";
    return "none";
  }

  if (d.includes("incomplete application")) return "incomplete";
  if (d.includes("knocked out")) return "knockout";
  if (d.includes("position filled") || d.includes("position closed")) return "positionfilled";
  if (d.includes("evergreen") || d.includes("future consideration") || d.includes("highly consider")) {
    return "evergreen";
  }
  if (
    /did\s*n(?:o|'|’)?t\s*pass\s*interview/.test(d) ||
    d.includes("past interview") ||
    d.includes("no show")
  ) {
    return "interview";
  }
  if (d.startsWith("withdrew")) return "withdrew";
  if (d.startsWith("declined offer") || /did\s*n(?:o|'|’)?t\s*accept\s*offer/.test(d)) {
    return "declined";
  }
  if (d.includes("not eligible") || d.includes("prior employee") || d.includes("contract only")) {
    return "noteligible";
  }
  if (
    d.includes("not best qualified") ||
    d.includes("meet min") ||
    d.includes("prescreen") ||
    d.includes("lacks basic")
  ) {
    return "notqualified";
  }
  if (d.startsWith("admin") || d.startsWith("internal") || d.includes("resume not reviewed")) {
    return "admin";
  }

  // ---- Jazz-era status strings, which use a different vocabulary entirely ----
  if (d.includes("knockout question")) return "knockout";
  if (d.startsWith("hired")) return "hired";
  if (d.includes("old applicant")) return "admin";
  if (d.includes("no longer interested") || d === "location" || d === "salary" || d === "schedule") {
    return "withdrew";
  }
  if (d.includes("ineligible") || d.includes("pria") || d.includes("prd")) return "noteligible";
  if (d === "rejected") return "notqualified";
  if (d === "new") return "none";
  return "other";
}

/** Paycom's outcome vocabulary as a recruiter reads it. */
export const OUTCOME_LABEL: Record<ApplicationOutcome, string> = {
  Active: "Active",
  Offered: "Offered",
  Hired: "Hired",
  SavedForLater: "Saved for later",
  Denied: "Denied",
  KnockedOut: "Knocked out",
  DeclinedOffer: "Declined offer",
  Archived: "Archived"
};

/** Human label for a reason group, for the rail's sub-items and the row detail. */
export const DISPOSITION_LABEL: Record<DispositionGroup, string> = {
  hired: "Hired",
  offered: "Offer out",
  evergreen: "Keep for later",
  interview: "Did not pass interview",
  incomplete: "Incomplete application",
  positionfilled: "Position filled or closed",
  notqualified: "Did not meet requirements",
  noteligible: "Not eligible",
  withdrew: "Withdrew",
  declined: "Declined the offer",
  knockout: "Knocked out",
  admin: "Moved or administrative",
  none: "No reason recorded",
  other: "Other"
};

/**
 * What to show under an outcome as its reason.
 *
 * "none" is not really a reason — it means nothing has ended this application.
 * Printing "No reason recorded" above the raw status read as though something
 * was missing, when the status IS the whole story.
 *
 * The outcome matters here because Paycom's two fields DISAGREE on real rows:
 * `status` carries the pipeline step ("New") while `disposition` carries the
 * decision ("HIRED"), and a row can hold both. Showing the stale step under a
 * decided outcome produced "Hired / New", which reads as a bug rather than as
 * the stale step it is. So a decided application prints no second line unless
 * there is a genuine reason for it.
 */
export function reasonLine(
  group: DispositionGroup,
  statusText: string | null | undefined,
  outcome?: ApplicationOutcome | null
): string | null {
  if (group === "none") {
    // Only while the application is still moving is the raw step worth showing.
    if (outcome && outcome !== "Active") return null;
    return (statusText ?? "").replace(/^xx\s*-\s*/i, "").trim() || null;
  }
  return DISPOSITION_LABEL[group];
}

/**
 * Normalise one application's outcome.
 *
 * `status` is the raw Paycom disposition text as stored on CandidateApplication
 * (e.g. "Not Selected - Prescreen Disqualification"); `disposition` is the
 * coarse code the importer also writes (HIRED / OFFER / APPLIED / REJECTED /
 * INTERVIEWED). Both are consulted because neither is populated on every row:
 * the Jazz import filled one and the Paycom sync fills the other.
 */
export function applicationOutcome(
  status: string | null | undefined,
  disposition: string | null | undefined,
  offerStatus?: string | null
): ApplicationOutcome {
  const s = (status ?? "").toLowerCase().trim().replace(/^xx\s*-\s*/, "");
  const code = (disposition ?? "").toUpperCase().trim();

  // An offer that was actually signed outranks whatever text is on the row —
  // recordOfferStatus is the authority on offers, and a stale status string
  // should not be able to un-hire somebody.
  if (offerStatus === "SIGNED") return "Hired";
  if (offerStatus === "DECLINED") return "DeclinedOffer";

  if (code === "HIRED" || s.startsWith("hired")) return "Hired";
  if (s.startsWith("declined offer") || /did\s*n(?:o|'|’)?t\s*accept\s*offer/.test(s)) {
    return "DeclinedOffer";
  }
  if (s.includes("retracted offer") || s.includes("rescind offer")) return "Denied";
  if (code === "OFFER" || offerStatus === "SENT" || s === "offered") return "Offered";
  if (s.includes("knock")) return "KnockedOut";
  if (s === "saved for later") return "SavedForLater";
  if (s === "new" || code === "APPLIED" || code === "INTERVIEWED") return "Active";
  if (!s && !code) return "Active";
  return "Denied";
}

/** One application, reduced to what the bucket ladder needs. */
export type BucketApplication = {
  outcome: ApplicationOutcome;
  group: DispositionGroup;
};

/**
 * The ladder. Order is the whole point: somebody who was hired for one job and
 * rejected for three others is HIRED, not "not selected".
 *
 * `isHistorical` short-circuits everything — a Jazz-era archive record is in the
 * archive regardless of what its applications say, because those outcomes
 * describe a pipeline that no longer exists.
 */
export function bucketOf(applications: BucketApplication[], isHistorical: boolean): CandidateBucket {
  if (isHistorical) return "historical";

  // NO APPLICATIONS IS NOT A REJECTION.
  //
  // Falling through to "notselected" put 305 people there who had simply never
  // been linked to a job — every one of them an ACTIVE candidate record. That is
  // 95% of what the segment contained, and it read as "these 322 were rejected",
  // which is a claim about real people that was not true. Nothing has ended for
  // somebody with no applications, so they belong with the live pool.
  if (applications.length === 0) return "active";

  const outcomes = new Set(applications.map((a) => a.outcome));
  const groups = new Set(applications.map((a) => a.group));

  if (outcomes.has("Hired")) return "hired";
  if (outcomes.has("Offered")) return "offered";
  if (outcomes.has("Active")) return "active";
  // Evergreen is a KEEP, not a rejection. Before this line existed these people
  // sat in "Not selected", which is why the talent pool looked empty while ~1,000
  // deliberately-retained candidates were filed as rejected.
  if (outcomes.has("SavedForLater") || groups.has("evergreen")) return "pool";
  return "notselected";
}

/**
 * The application whose outcome the row's Status column shows.
 *
 * Most-recent first, so the collapsed row and the expanded list can never
 * disagree about which application is being described. Callers must sort with
 * this rather than reading applications in query order.
 */
export function sortApplicationsForDisplay<T extends { appliedAt: Date | string | null }>(
  applications: T[]
): T[] {
  const time = (v: Date | string | null) => (v ? new Date(v).getTime() : 0);
  return [...applications].sort((a, b) => time(b.appliedAt) - time(a.appliedAt));
}
