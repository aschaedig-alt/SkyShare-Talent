/**
 * THE HOUSE DISPOSITION VOCABULARY — and the map from Paycom's wording to it.
 *
 * READ THIS BEFORE WRITING ANY IMPORTER.
 *
 * On 2026-09-07 the 39 disposition wordings on file were shortened to 26 house
 * names: "Not Selected - Position Closed/On Hold" became "Closed / On Hold",
 * and so on, across 3,817 applications. PAYCOM DOES NOT KNOW THAT. It will keep
 * sending its own long wordings, so an import that writes `status` straight from
 * the export will re-introduce every one of them and quietly undo the tidy-up —
 * the list would grow back to 39 wordings one sync at a time, and nobody would
 * notice until the reasons page was next opened.
 *
 * So: run every incoming disposition through toHouseWording() before storing it.
 *
 * The second map answers the other question the sheet asked — which STAGE a
 * disposition implies. "Failed Interview" means the person is Rejected;
 * "Future Consideration" means Saved For Later. That is a fact about the
 * vocabulary, so it lives here next to the wordings rather than being re-derived
 * wherever somebody needs it.
 */

/**
 * Paycom's wording (lowercased, "xx - " prefix stripped) -> the house name.
 *
 * Keyed loosely on purpose: Paycom spells the same thing with a straight
 * apostrophe in one export and a curly one in the next, and both must land in
 * the same place. See legacyKey().
 */
const LEGACY_TO_HOUSE: Record<string, string> = {
  // Did not meet requirements
  "notselectedprescreendisqualification": "Prescreen Disqualification",
  "notselectedpilotdoesnotmeetminshrstypeetc": "Does Not Meet Mins",
  "notselectednotbestqualified": "Not Best Qualified",
  "nolongerinterestedinthiscandidate": "Not Best Qualified",
  "lacksbasicqualificationsexperience": "Not Best Qualified",
  "notselectednotbestqualifiedexperience": "Not Best Qualified",

  // Keep for later
  "notselectedfutureconsideration": "Future Consideration",
  "notselectedhighlyconsiderinfuture": "Future Consideration",
  "wanttohireinthefuture": "Future Consideration",
  "hiringpausedwouldliketocontinuewithcandidate": "Future Consideration",
  "evergreencandidate": "Future Consideration",

  // Knocked out
  "knockoutquestion": "Knocked out",
  "knockedout": "Knocked out",
  "knockedoutdidnotmeetminimumrequirements": "Knocked out",
  "notreviewedknockedout": "Knocked out",

  // Position filled or closed
  "notselectedpositionclosedonhold": "Closed / On Hold",
  "notreviewedpositionfilled": "Filled",

  // Withdrew
  "withdrewnoresponse": "No Response",
  "withdrewother": "Other",
  "withdrewcompbenefits": "Comp & Benefits",
  "location": "Location",
  "salary": "Salary",
  "schedule": "Schedule",
  "nolongerinterested": "No Longer Interested",

  // Did not pass interview
  "notselecteddidnotpassinterview": "Failed Interview",
  "didntpassinterview": "Failed Interview",
  "notselectedpastinterview": "Failed Interview",
  "notselectednoshow": "No Show",

  // Not eligible
  "notselectedcontractonly": "Contract Only",
  "noteligiblepilotnonuspassport": "Ineligible - Passport",
  "ineligibletotrainintheusatsaftsp": "Ineligible - Passport",
  "priaprd": "Ineligible - PRD",
  "noteligiblepilotprdpria": "Ineligible - PRD",
  "multiplefailuresonpria": "Ineligible - PRD",
  notselectedprioremployee: "Not Best Qualified",

  // Moved / administrative
  "adminmovedtonewreq": "Moved Application",
  "oldapplicantfromoldjobpost": "Moved Application",
  "internalhandledbyhiringmanager": "Moved Application",
  "notconsideredresumenotreviewed": "Moved Application",

  // Hired
  "hiredfulltime": "Hired",
  "hiredparttime": "Hired",
  "hired": "Hired",

  // Offer outcomes
  "declinedofferother": "Declined Offer",
  "declinedoffercompbenefits": "Declined Offer",
  "didntacceptoffer": "Declined Offer",
  "retractedofferletter": "Rescind Offer",
  "rescindofferother": "Rescind Offer",

  // Left alone deliberately — "New" is not a reason, it is the absence of one.
  "new": "New",
  "savedforlater": "Saved For Later",
  "rejected": "Rejected"
};

/** Loose key: case, punctuation and the "xx - " prefix are all noise here. */
export function legacyKey(wording: string | null | undefined): string {
  return (wording ?? "")
    .toLowerCase()
    .replace(/^xx\s*-\s*/, "")
    .replace(/[^a-z0-9]/g, "");
}

/**
 * The house wording for an incoming disposition.
 *
 * Returns the original UNCHANGED when it does not recognise it — a new Paycom
 * wording is information, and silently flattening it to something else would
 * hide that the vocabulary has grown. Unrecognised wordings show up on the
 * manage page, where they can be reworded by hand and added here.
 */
export function toHouseWording(wording: string | null | undefined): string | null {
  const raw = (wording ?? "").trim();
  if (!raw) return null;
  return LEGACY_TO_HOUSE[legacyKey(raw)] ?? raw;
}

/**
 * Every house wording, IN THE ORDER IT WAS WRITTEN ABOVE.
 *
 * Not sorted, and that is the point - asked for on 2026-09-08. LEGACY_TO_HOUSE is
 * grouped deliberately (did not meet requirements, keep for later, knocked out,
 * position filled, withdrew, did not pass interview, not eligible, moved, hired,
 * offer outcomes), and alphabetising threw that away. Insertion order on a
 * string-keyed object is guaranteed for non-numeric keys, so the authored grouping
 * reaches the screen for free.
 *
 * Adding a wording therefore puts it where you write it. Put it in its group.
 */
export const HOUSE_WORDINGS: string[] = [...new Set(Object.values(LEGACY_TO_HOUSE))];

/**
 * Which stage a disposition implies.
 *
 * Asked for directly: the reasons are grouped under stages on the sheet because
 * that is how they are thought about — "Failed Interview" means Rejected,
 * "Future Consideration" means Saved For Later. Nothing applies this
 * automatically yet; it is the vocabulary written down so that an importer, or
 * a later "set the stage from the outcome" step, has one definition to read
 * instead of inventing its own.
 */
export const WORDING_TO_STAGE: Record<string, string> = {
  New: "New",

  Hired: "Hired",

  "Future Consideration": "Saved For Later",
  "Saved For Later": "Saved For Later",

  "Declined Offer": "Offer",
  "Rescind Offer": "Offer",

  "No Response": "Withdrew",
  Location: "Withdrew",
  Other: "Withdrew",
  "No Longer Interested": "Withdrew",
  Salary: "Withdrew",
  "Comp & Benefits": "Withdrew",
  Schedule: "Withdrew",
  "Contract Only": "Withdrew",

  "Prescreen Disqualification": "Rejected",
  Rejected: "Rejected",
  "Not Best Qualified": "Rejected",
  "Failed Interview": "Rejected",
  "No Show": "Rejected",
  "Does Not Meet Mins": "Rejected",
  "Closed / On Hold": "Rejected",
  Filled: "Rejected",
  "Moved Application": "Rejected",
  "Ineligible - Passport": "Rejected",
  "Ineligible - PRD": "Rejected",

  "Knocked out": "Knocked Out"
};

/** The stage a disposition implies, or null when the vocabulary has no opinion. */
export function stageForWording(wording: string | null | undefined): string | null {
  const raw = (wording ?? "").trim();
  if (!raw) return null;
  return WORDING_TO_STAGE[raw] ?? null;
}
