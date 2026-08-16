/**
 * The Front tags this app applies — ONE list, by their real names in the account.
 *
 * WHY THIS EXISTS. Until now each sweep carried its own TAGS constant with its own
 * guess at the spelling: lib/paycom/scan.ts, lib/pilotapp/scan.ts and
 * lib/travel/from-email.ts each had a private copy. Every one of them had already
 * drifted from the account at least once, and the failure is SILENT by design —
 * resolveTagIdByNames returns null for a name that does not exist, and the sweep
 * carries on untagged rather than erroring. The comment in from-email.ts records
 * one round of it ("travel threads the app read and filed carried no sign it had
 * touched them"); the Aug 16 renaming broke three more in paycom/scan.ts the same
 * way, and nothing failed, which is exactly the problem.
 *
 * Three copies means three chances to be wrong and no single place to check. One
 * copy can be verified against the account in a single pass.
 *
 * CASE DOES NOT MATTER. resolveTagIdByNames lower-cases both sides before
 * comparing, so "[automated]" and "[Automated]" resolve identically. The WORDS do
 * matter, including the "N.N " number prefixes — those are part of the tag name,
 * not decoration, and dropping one is what turns a tag into a silent no-op.
 *
 * Verified against the live account 2026-08-16. If you rename a tag in Front,
 * change it here too — nothing will tell you otherwise, it will just stop tagging.
 */

/**
 * The "SkyShare Journey" group — the tags that say what the app did and why.
 *
 * Numbered ones follow the onboarding sequence a recruiter already thinks in:
 * 1.x offer, 2.x background check, 3.x drug screen.
 */
export const JOURNEY_TAGS = {
  /** On EVERY thread the app acted on, successfully or not. The "a robot touched
   *  this" marker — one search shows the automation's whole footprint. */
  automated: "[automated]",

  /** Offer letter went out to the candidate. NOT WIRED: no email the app reads
   *  announces this. Paycom's "Pending Offer Approved" only grants permission to
   *  send ("You can send this offer to the applicant now"), which is not the same
   *  event, and ticking it off that would be wrong in the same way the
   *  approved-vs-accepted confusion is. Named here so it is not reinvented. */
  offerSent: "1.1 offer sent to candidate",
  /** The candidate accepted — ticks "Candidate signed offer letter". */
  offerAccepted: "1.2 offer accepted",

  /** The candidate submitted their background-check details (check STARTED). */
  bgInfoSubmitted: "2.1 submitted background check",
  /** The check came back clear. */
  bgCheckComplete: "2.2 background check complete",

  /** NOT WIRED — see the note at the bottom of this file. */
  drugScreenRequested: "3.1 drug screen requested",
  /** NOT WIRED — see the note at the bottom of this file. */
  drugScreenComplete: "3.2 drug screen complete",

  /** The app CREATED a candidate from this email, rather than matching one that
   *  already existed. The record therefore holds only what the email carried. */
  candidateCreated: "candidate profile created",
  /** The app downloaded an attachment and filed it onto a candidate. */
  fileAdded: "file added to app",

  /** Read and understood, but NOT actioned — no match, two matches, or wording
   *  the app could not parse. This is the follow-up queue. */
  needsReview: "needs review",

  /** A travel booking was read out of this thread. */
  travel: "travel"
} as const;

/**
 * Outside the SkyShare Journey group, but applied by the pilot-application sweep
 * to say what KIND of thread this is. Lives under the "Pilot" parent in Front.
 */
export const PILOT_APP_TAG = "Pilot App";

/**
 * THE APP MUST NEVER APPLY THIS. "Manually Added to ATS" means a person put the
 * application into Paycom by hand. The scanner used to set it on every successful
 * filing, which read as that having happened when all the app had done was attach
 * a PDF on this side — ticking off the one marker that told Hannah what was still
 * outstanding, with a job that cannot do the thing it claims. Reversed Aug 7 2026.
 *
 * Named here only so a cleanup script can refer to it.
 */
export const NEVER_APPLY_TAG = "Manually Added to ATS";

/**
 * TAGS THAT EXIST BUT NOTHING SETS YET, and why:
 *
 *   1.1 offer sent to candidate  — no notice the app reads announces the send.
 *   3.1 drug screen requested    — the checklist step "Email docs to ITS for
 *   3.2 drug screen complete       pre-employment drug screen" is manual today.
 *                                  Mail from bgc-netjets@integritytesting.net does
 *                                  arrive in the account and may carry results,
 *                                  but nobody has read one closely enough to write
 *                                  a parser, and guessing at wording is how the
 *                                  offer-vs-approved trap gets sprung.
 *   [tracking]                   — purpose unclear; not set by the app.
 *
 * Left unwired ON PURPOSE. A tag applied on a guess is worse than one never
 * applied, because it looks like evidence.
 */
