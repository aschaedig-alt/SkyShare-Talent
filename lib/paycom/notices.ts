import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity/logger";
import { isOfferStepKey } from "@/lib/offers/steps";
import { syncOnboardingTaskToOffer } from "@/lib/offers/onboarding-sync";
import type { FrontMessage } from "@/lib/front";

/**
 * Paycom's automated notices, turned into onboarding-checklist progress.
 *
 * Paycom emails HR Onboarding when something moves on a hire (background check,
 * offer acceptance, and later others). Those mails carry real status we otherwise
 * re-key by hand, so we read them and tick the matching checklist step.
 *
 * Handled today:
 *   BG_INFO_SUBMITTED  "Background Check Requested Information Completed" -> bg_check_info
 *   BG_CHECK_COMPLETE  "Background check is completed"                    -> bg_check_complete
 *   OFFER_ACCEPTED     "Offer Accepted"                                   -> candidate_signed
 *
 * WORDING TRAP: the "Requested Information Completed" notice reads, in its body,
 * "NAME has completed the background check" — but it means the candidate finished
 * submitting their INFORMATION, i.e. the check has STARTED. So the SUBJECT decides
 * which step we tick; the body is only used to pull the person's name.
 *
 * Safety posture: we only ever tick a step forward, never untick. If the name
 * doesn't resolve to exactly one current hire we do nothing and report it — a wrong
 * guess here would put false compliance state on a person.
 */

export type PaycomNoticeKind = "BG_INFO_SUBMITTED" | "BG_CHECK_COMPLETE" | "OFFER_ACCEPTED";

type NoticeDef = {
  kind: PaycomNoticeKind;
  /** Checklist key in lib/onboarding/tasks.ts that this notice completes. */
  taskKey: string;
  /** Matched against the message subject — this is what tells the notices apart. */
  subject: RegExp;
  /** Pulls the person's name out of the body. */
  name: RegExp;
  /**
   * A SECOND, independent thing the body must say before we act.
   *
   * Only the offer notices need it, and they need it badly — see the comment on
   * OFFER_ACCEPTED below. The subject alone tells the background-check notices
   * apart, so they leave this unset.
   */
  bodyMustMatch?: RegExp;
  /** The role, where the notice names one. Reported, never matched on. */
  position?: RegExp;
  /** Paycom's own requisition number. Reported, never matched on. */
  requisition?: RegExp;
  /** Paycom's person id, which the offer notices carry in parentheses. */
  personId?: RegExp;
};

/**
 * SUBJECT COLLISION — the reason these patterns are as tight as they are.
 *
 *   step 2  "Background Check Requested Information Completed"
 *   step 3  "Background check is completed"
 *
 * Both contain "background check" and "completed", so any loose pattern like
 * /background check.*completed/ matches BOTH — and would start marking people
 * CLEAR TO HIRE the moment they merely submitted their information. The two
 * subjects are separated on the words only one of them has: "requested
 * information" versus "is completed". There is a test for exactly this below the
 * fold in the scan script, because getting it wrong is a compliance problem, not
 * a cosmetic one.
 */
const NOTICES: NoticeDef[] = [
  {
    // Step 2 of 3: the candidate filled in their details. The check has STARTED,
    // it is not finished — the subject's "Completed" refers to the information.
    kind: "BG_INFO_SUBMITTED",
    taskKey: "bg_check_info",
    subject: /background\s+check\s+requested\s+information\s+completed/i,
    // Paycom sends TWO body wordings under this one subject:
    //   "TARA WARD has completed the background check."
    //   "...because JONATHAN SOTO has completed their information for a background check."
    // Anchor on the SHOUTED name (Paycom always upper-cases it) rather than the
    // trailing phrase. A looser, case-insensitive pattern swallows the lead-in and
    // captures "You have received this email because JONATHAN SOTO" — the second
    // wording has no punctuation to stop it.
    name: /\b([A-Z][A-Z'’\-]+(?:\s+[A-Z][A-Z'’\-]+){1,3})\s+has\s+completed\b/
  },
  {
    // Step 3 of 3: the check itself came back. This is the one that means the
    // person is clear to hire.
    kind: "BG_CHECK_COMPLETE",
    taskKey: "bg_check_complete",
    subject: /background\s+check\s+is\s+completed/i,
    // "The background check for TARA WARD has been completed and is ready for
    // review." The name sits BETWEEN "for" and "has been completed", so the
    // step-2 pattern (which expects the name immediately before "has completed")
    // cannot read this one — hence a separate expression rather than a shared,
    // looser one.
    name: /\bfor\s+([A-Z][A-Z'’\-]+(?:\s+[A-Z][A-Z'’\-]+){1,3})\s+has\s+been\s+completed\b/
  },
  {
    /**
     * The candidate accepted the offer — which is the moment "Candidate signed
     * offer letter" becomes true.
     *
     * SUBJECT COLLISION, WORSE THAN THE BACKGROUND-CHECK ONE. Paycom sends FOUR
     * offer notices about the same person, from the same address, all of which
     * say "offer for NAME (id) to fill Requisition N":
     *
     *   "Pending Offer Approval"                    there IS a pending offer
     *   "ACTION REQUIRED: Pending Offer Approved"   ...has been APPROVED
     *   "Pending Offer Expires Soon"                ...expires soon
     *   "Offer Accepted"                            ...has been ACCEPTED   <- this one
     *
     * Only the last means the candidate said yes. The other three are INTERNAL:
     * "Approved" is our own approver signing off, which happens BEFORE the offer
     * reaches the candidate at all. Dayten Schureman's real sequence was Approval
     * Aug 10, Approved Aug 10/13/14, Accepted Aug 15 — so anything matching
     * /offer.*approved/ or a bare /offer/ would tick "candidate signed" five days
     * before he had seen it, on a person who could still decline.
     *
     * Hence two independent gates, and both must pass:
     *   1. the subject is EXACTLY "Offer Accepted" (anchored, nothing either side)
     *   2. the body says "has been accepted"
     * "Pending Offer Approved" fails both — its subject carries the ACTION
     * REQUIRED prefix and its body says "has been approved".
     */
    kind: "OFFER_ACCEPTED",
    taskKey: "candidate_signed",
    // Anchored on purpose. "ACTION REQUIRED: Pending Offer Approved" contains
    // neither word adjacent, but an unanchored /offer\s+accepted/ would still be
    // one Paycom wording change away from matching something it shouldn't.
    subject: /^\s*offer\s+accepted\s*$/i,
    // Paycom has used two wordings for the same event, and BOTH are still in the
    // mailbox, so both have to parse:
    //   "The offer for Dayten Schureman (333520) to fill Requisition 3685 has been accepted."
    //   "You have an offer for Bailey Barcelon (151908) filling Requisition 2233 that has been accepted."
    // The shared, stable part is "offer for <NAME> (<digits>)". Anchoring on the
    // parenthesised id rather than on the trailing phrase is what lets one
    // expression read both — and unlike the background-check notices, these names
    // are NOT reliably upper-cased ("nicholas Zehr", "RICHARD VANCE", "Little
    // Craig" all appear), so a shouted-name pattern would silently miss them.
    name: /\boffer\s+for\s+([^()\n]{2,80}?)\s*\(\d+\)/i,
    bodyMustMatch: /\bhas\s+been\s+accepted\b/i,
    // "This offer was for the Gulfstream G200 First Officer position." (newer) /
    // "This offer is for the Pilatus PC-12 Captain position." (older).
    position: /\bThis\s+offer\s+(?:was|is)\s+for\s+the\s+(.+?)\s+position\b/i,
    requisition: /\brequisition\s+(\d+)/i,
    personId: /\boffer\s+for\s+[^()\n]{2,80}?\((\d+)\)/i
  }
];

const PAYCOM_SENDER = /@paycomonline\.com$/i;

/**
 * Paycom mail we have SEEN and deliberately do not act on.
 *
 * This exists because "unrecognised-subject" carries a meaning worth protecting:
 * it says Paycom has changed its wording and a notice we rely on is now being
 * missed. The scan surfaces it loudly for exactly that reason.
 *
 * Once the sweep widened to systemmessage@ (needed to see offer notices at all),
 * roughly 85% of what comes back is this traffic — interview invitations, the
 * [PaycomOnline] onboarding task mails, checklist assignments. Left unclassified
 * every single one would report as "couldn't be read", and a warning that fires
 * a hundred times a scan is one nobody reads the hundred-and-first time.
 *
 * Deliberately a NARROW list of things actually observed in the account, not a
 * catch-all: anything from Paycom that is not on it still reports as
 * unrecognised, which is what keeps the rewording alarm working.
 */
const IGNORED: Array<{ subject?: RegExp; body?: RegExp; why: string }> = [
  // The rest of the offer family. Known, understood, and NOT the candidate
  // accepting — see the OFFER_ACCEPTED comment for why acting on these would be
  // actively wrong rather than merely noisy.
  { subject: /\bpending\s+offer\b/i, why: "pending offer (approval/approved/expiring) — not an acceptance" },
  // Paycom's own onboarding task mails, which the team works inside Paycom.
  { subject: /^\s*\[PaycomOnline\]/i, why: "Paycom task notification" },
  { subject: /^\s*checklist\s+(assigned|completed)\s*$/i, why: "Paycom checklist notification" },
  { subject: /^\s*employee\s+my\s+pay\s+items\s*$/i, why: "payroll notification" },
  // Straight and curly apostrophes both appear depending on how the body arrives.
  { subject: /you\s*['’]?\s*ve\s+been\s+mentioned/i, why: "note mention" },
  // Interview invitations carry FREE-FORM subjects ("Paxton Boyce - PDP or Base
  // Support (In-person)", "Interview Scheduled (video)"), so there is no subject
  // pattern to match — the body is the only stable marker they share.
  { body: /\byou\s+have\s+been\s+invited\s+to\s+an\s+interview\b/i, why: "interview invitation" },
  // A reply on a forwarded notice thread. Paycom itself never sends "Re:", so
  // this can only be a person talking about a notice — and the reply quotes the
  // whole notice underneath, which is why it reaches this far at all. Without
  // this it reports as unrecognised and fires the rewording alarm every time
  // somebody answers one.
  { subject: /^\s*re\s*:/i, why: "a reply about a notice, not the notice" }
];

/** Known Paycom mail we intentionally skip. Returns why, or null if unknown. */
function ignoredReason(subject: string, text: string): string | null {
  for (const rule of IGNORED) {
    if (rule.subject?.test(subject)) return rule.why;
    if (rule.body?.test(text)) return rule.why;
  }
  return null;
}

export type PaycomNoticeResult = {
  kind: PaycomNoticeKind | null;
  personName: string | null;
  hireId: string | null;
  hireName: string | null;
  /** How we tied the Paycom name to a person — worth showing in the report. */
  matchedBy?: "exact" | "nickname";
  /**
   * The role the offer was for, as Paycom worded it. Reported so a recruiter can
   * eyeball that the tick landed on the right person for the right job — the one
   * check that catches a same-name mix-up, which is otherwise invisible.
   */
  position?: string | null;
  /** Paycom's requisition number, for tracing the notice back to its posting. */
  requisition?: string | null;
  /**
   * Paycom's own person id. NOT used to match (only ~1% of candidates have it
   * stored), but recorded on the activity entry so the exact applicant record is
   * recoverable later even if the name was a near-miss.
   */
  paycomPersonId?: string | null;
  /** What actually happened, for the scan report. */
  outcome:
    | "not-a-paycom-notice"
    /** Paycom mail we recognise and deliberately skip — see IGNORED. */
    | "not-actionable"
    | "unrecognised-subject"
    | "no-name-found"
    | "no-match"
    | "ambiguous-match"
    | "no-such-task"
    | "already-done"
    | "would-tick"
    | "ticked";
  detail?: string;
};

const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/** Plain text of a Front message — prefer `text`, else strip tags off `body`. */
export function messageText(message: FrontMessage): string {
  if (typeof message.text === "string" && message.text.trim()) return message.text;
  const html = typeof message.body === "string" ? message.body : "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

/**
 * Who sent an inbound Front message.
 *
 * NOT `author` — on an inbound message Front leaves that empty (it means the
 * TEAMMATE who wrote a message, i.e. outbound only). The external sender is the
 * recipient carrying role "from". Reading `author.email` here silently matches
 * nothing, which is exactly how this failed the first time.
 */
export function senderEmail(message: FrontMessage): string {
  const from = message.recipients?.find((r) => r.role === "from")?.handle;
  return (from || message.author?.email || "").trim();
}

/**
 * Where a notice reached us from.
 *
 * "routed" exists because Paycom addresses some notices — "Offer Accepted" among
 * them — to ONE person, and they land in that teammate's PRIVATE Front inbox. A
 * company API token cannot read a private inbox (Front answers 403 to
 * /teammates/{id}/conversations, by design and with no setting to change it), so
 * the only way the app sees those is a Front rule copying them into a shared
 * inbox.
 *
 * Such a copy may or may not still carry Paycom as its sender, and may or may not
 * have gained a "Fwd:" — that is up to Front's rule engine. So the second door
 * tests the message's CONTENT for Paycom provenance rather than trusting who
 * appears to have sent it.
 */
export type NoticeSource = "direct" | "routed";

/**
 * Proof that a message began at Paycom, found ANYWHERE in it.
 *
 * The outer sender is deliberately not part of this test. A Front rule routes
 * these notices from a private inbox into the shared one, and whether the copy
 * that lands keeps Paycom as its sender (a moved conversation) or is rewritten to
 * a teammate's address (a forward) is an implementation detail of Front's rule
 * engine that cannot be known before the first one arrives. What survives either
 * way is the address itself — as the From header, or in the quoted header block a
 * forward carries — plus the footer every Paycom notice ends with.
 *
 * THE TRADE, STATED PLAINLY. Accepting body-only provenance means the sender is
 * no longer a gate, so in principle anyone who can email the shared inbox could
 * craft a message that passes it. They would also have to produce an exactly
 * anchored "Offer Accepted" subject, a body saying "has been accepted", the
 * "offer for NAME (123456)" shape, and a name resolving to exactly one CURRENT
 * new hire whose step is not already ticked. The worst outcome is one checklist
 * box ticked early — visible on the person's record, reversible, and recorded in
 * the activity log with its source. That is a fair price for a sweep that works
 * whatever Front's rule does to the headers, and it is the behaviour the user
 * asked for on 2026-08-16.
 */
const PAYCOM_PROVENANCE =
  /(?:systemmessage|employmentscreening)@paycomonline\.com|automatically\s+generated\s+by\s+paycomonline\.com/i;

/**
 * Strip forwarding prefixes so "Fwd: Offer Accepted" matches the same anchored
 * subject pattern the direct notice does.
 *
 * "Re:" is deliberately NOT stripped. A reply is a human conversation about a
 * notice, not the notice — and leaving Re: in place is what stops somebody's
 * reply on a forwarded thread, which quotes the whole notice underneath it, from
 * being read as a fresh event.
 */
export function bareSubject(subject: string): string {
  let s = subject.trim();
  let previous: string;
  do {
    previous = s;
    s = s.replace(/^\s*(?:fwd?|fw)\s*:\s*/i, "");
  } while (s !== previous);
  return s.trim();
}

/** Is this a Paycom notice at all, and how did it get here? Exported for testing. */
export function paycomSource(fromEmail: string, text: string): NoticeSource | null {
  if (PAYCOM_SENDER.test(fromEmail.trim())) return "direct";
  if (PAYCOM_PROVENANCE.test(text)) return "routed";
  return null;
}

/** Identify which Paycom notice this message is, if any. Exported for testing. */
export function classifyNotice(subject: string, fromEmail: string, text = ""): NoticeDef | null {
  if (!paycomSource(fromEmail, text)) return null;
  const cleaned = bareSubject(subject);
  return NOTICES.find((n) => n.subject.test(cleaned)) ?? null;
}

/** Pull the person's name out of a notice body. Exported for testing. */
export function extractName(def: NoticeDef, text: string): string | null {
  const m = text.match(def.name);
  const raw = m?.[1]?.trim();
  if (!raw) return null;
  // Paycom shouts the name ("TARA WARD") — title-case it for display/matching.
  return raw
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export type RosterEntry = { id: string; name: string; stage: string };

/**
 * Tie a Paycom name to exactly one person on the roster.
 *
 * Paycom uses the LEGAL name; our roster uses whatever the person goes by. Real
 * examples from the live inbox: "NICHOLAS LEMBO" is our Nick Lembo, "RUSSELL
 * HERMAN" is our Russ Herman, and "JONATHAN DELGADO LEVIN TURNER" is our Jonathan
 * Delgado. Exact-full-name-only missed a third of the notices.
 *
 * Two tiers, both exact comparisons — no fuzzy scoring:
 *   1. exact    — full name; for 3+ word names also first+last and first+second,
 *                 since Paycom carries middle and maternal surnames we don't.
 *   2. nickname — same surname AND the first names agree on their first three
 *                 letters (Nicholas/Nick, Russell/Russ, Christopher/Chris). Three
 *                 letters is the point: it catches the real shortenings while still
 *                 refusing Sarah/Steve Nelson, which a bare initial would tick wrong.
 *
 * Either tier must land on exactly ONE person. Two candidates is reported as
 * ambiguous and changes nothing — a wrong tick puts false compliance state on a
 * real person, which is worse than leaving a box for a human.
 */
export function matchHire(
  personName: string,
  roster: RosterEntry[]
): { matches: RosterEntry[]; matchedBy: "exact" | "nickname" | null } {
  const parts = normalize(personName).split(" ").filter(Boolean);
  const forms = new Set<string>([parts.join(" ")]);
  if (parts.length > 2) {
    forms.add(`${parts[0]} ${parts[parts.length - 1]}`);
    forms.add(`${parts[0]} ${parts[1]}`);
  }

  let matchedBy: "exact" | "nickname" | null = null;
  let matches = roster.filter((h) => forms.has(normalize(h.name)));
  if (matches.length) matchedBy = "exact";

  if (!matches.length && parts.length >= 2) {
    const surname = parts[parts.length - 1];
    const stem = parts[0].slice(0, 3);
    matches = roster.filter((h) => {
      const hp = normalize(h.name).split(" ").filter(Boolean);
      return hp.length >= 2 && hp[hp.length - 1] === surname && hp[0].slice(0, 3) === stem;
    });
    if (matches.length) matchedBy = "nickname";
  }

  // The same name twice usually means an old record and a live one — prefer the
  // person actually in onboarding.
  if (matches.length > 1) {
    const active = matches.filter((h) => h.stage === "ACTIVE");
    if (active.length === 1) matches = active;
  }

  return { matches, matchedBy };
}

/**
 * Process one Front message. Read-then-act: resolves the person, ticks the step,
 * and records an activity entry. Idempotent — an already-done step is left alone,
 * so re-scanning the same thread does nothing.
 */
export async function processPaycomMessage(
  message: FrontMessage,
  opts?: { dryRun?: boolean }
): Promise<PaycomNoticeResult> {
  const subject = typeof message.subject === "string" ? message.subject : "";
  const fromEmail = senderEmail(message);
  const text = messageText(message);
  const base = { kind: null, personName: null, hireId: null, hireName: null } as const;

  const source = paycomSource(fromEmail, text);
  if (!source) return { ...base, outcome: "not-a-paycom-notice" };

  /**
   * OUTBOUND MESSAGES. The sweeps used to skip these wholesale, on the reasoning
   * that our own replies can quote a notice back and only Paycom's own inbound
   * copy counts. That reasoning breaks for a ROUTED notice: Front may mark a
   * rule-created copy as outbound because a teammate's channel produced it, and
   * skipping it would silently ignore the only copy the app can see.
   *
   * So outbound is allowed through the routed door only. A reply is still
   * refused, because bareSubject does not strip "Re:" and the anchored subject
   * patterns therefore cannot match one.
   */
  const isOutbound = message.is_inbound === false;
  if (isOutbound && source !== "routed") return { ...base, outcome: "not-a-paycom-notice" };

  const def = classifyNotice(subject, fromEmail, text);
  if (!def) {
    // Known-and-skipped is reported separately from genuinely-unreadable, so the
    // "Paycom changed its wording" alarm keeps meaning that and only that.
    const why = ignoredReason(bareSubject(subject), text);
    if (why) return { ...base, outcome: "not-actionable", detail: why };
    // An outbound message that did not classify is almost always one of our own
    // replies on a forwarded thread. Reporting those as unrecognised would fire
    // the rewording alarm every time somebody answers a notice, so they are
    // dropped rather than flagged.
    if (isOutbound) return { ...base, outcome: "not-a-paycom-notice" };
    return { ...base, outcome: "unrecognised-subject", detail: subject };
  }

  // The second gate, where a notice has one. A subject can be right while the
  // body describes a different event — that is exactly the offer family, where
  // four notices share a wording and only one says "has been accepted". Treated
  // as unrecognised rather than silently skipped, so a Paycom rewording surfaces
  // in the report instead of quietly switching the feature off.
  if (def.bodyMustMatch && !def.bodyMustMatch.test(text)) {
    return {
      ...base,
      kind: def.kind,
      outcome: "unrecognised-subject",
      detail: `subject matched ${def.kind} but the body did not — ${text.slice(0, 160)}`
    };
  }

  const personName = extractName(def, text);
  if (!personName) {
    // Report enough to tell "body never came back" from "wording differs".
    return { ...base, kind: def.kind, outcome: "no-name-found", detail: `len=${text.length} :: ${text.slice(0, 160)}` };
  }

  // Context, not identity: reported and logged, never matched on.
  const position = def.position ? (text.match(def.position)?.[1]?.trim() ?? null) : null;
  const requisition = def.requisition ? (text.match(def.requisition)?.[1]?.trim() ?? null) : null;
  const paycomPersonId = def.personId ? (text.match(def.personId)?.[1]?.trim() ?? null) : null;
  const extras = { position, requisition, paycomPersonId };

  // Match against people who are actually on staff — never former employees.
  const roster = await prisma.newHire.findMany({
    where: { employmentStatus: { not: "TERMINATED" }, canceled: false },
    select: { id: true, name: true, stage: true }
  });
  const { matches, matchedBy } = matchHire(personName, roster);

  if (matches.length === 0) {
    return { ...base, ...extras, kind: def.kind, personName, outcome: "no-match" };
  }
  if (matches.length > 1) {
    return { ...base, ...extras, kind: def.kind, personName, outcome: "ambiguous-match", detail: `${matches.length} current people share this name` };
  }

  const hire = matches[0];
  // Everything from here on names the person we resolved to, so a nickname match
  // can be eyeballed in the report rather than taken on trust.
  const found = {
    ...base,
    ...extras,
    kind: def.kind,
    personName,
    hireId: hire.id,
    hireName: hire.name,
    matchedBy: matchedBy ?? undefined
  };

  const task = await prisma.onboardingTask.findFirst({
    where: { newHireId: hire.id, key: def.taskKey },
    select: { id: true, status: true }
  });
  if (!task) {
    return { ...found, outcome: "no-such-task", detail: def.taskKey };
  }
  if (task.status === "DONE") {
    return { ...found, outcome: "already-done" };
  }

  if (opts?.dryRun) {
    return { ...found, outcome: "would-tick", detail: def.taskKey };
  }

  const completedAt = new Date();
  await prisma.onboardingTask.update({
    where: { id: task.id },
    data: { status: "DONE", completedAt }
  });

  // An OFFER-group task has a second home: the same six keys live on the
  // candidate's application as offer steps, and offerStatus is DERIVED from them.
  // Ticking only the checklist row would leave a candidate whose offer is signed
  // still reading as SENT on their profile and in the offers board — the exact
  // drift lib/offers/onboarding-sync.ts exists to prevent. This is the same call
  // the checklist UI makes (app/api/onboarding-tasks/[id]/route.ts), so a tick
  // from Paycom and a tick by hand land identically.
  //
  // Deliberately after the task write and non-fatal: the checklist is the thing
  // the user asked for, and a sync failure must not undo it.
  if (isOfferStepKey(def.taskKey)) {
    try {
      await syncOnboardingTaskToOffer(hire.id, def.taskKey, true);
    } catch (err) {
      console.error(`Paycom notice: ticked ${def.taskKey} for ${hire.name} but could not sync the offer`, err);
    }
  }

  await logActivity({
    activityType: "CANDIDATE_EDITED",
    description: `Paycom notice ticked "${def.taskKey}" for ${hire.name} (${def.kind})`,
    entityType: "NewHire",
    entityId: hire.id,
    metadata: {
      source: "paycom-front",
      kind: def.kind,
      taskKey: def.taskKey,
      subject,
      paycomName: personName,
      matchedBy,
      // Only the offer notice carries these; null elsewhere. Recorded because the
      // person id is the one exact key Paycom gives us, and keeping it on the
      // activity entry means a tick can be traced back to the precise applicant
      // record even when the name matched only approximately.
      ...extras
    }
  });

  return { ...found, outcome: "ticked", detail: def.taskKey };
}
