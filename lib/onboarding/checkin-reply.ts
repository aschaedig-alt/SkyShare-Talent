// Replies to the post-onboarding check-in emails ("Re: Just checking in"). Client-safe:
// types, labels and the pure text helpers. The scan and the store are in
// checkin-replies.ts; the Claude read is in checkin-reply-triage.ts.
//
// Asked for 2026-11-11, the day 23 of the 30-day emails went out: "when the reply
// comes back ... add their notes in the app. we probably need to see if its
// something that needs an action", and be able to see on the post-hire page who
// has replied. His answers that day: HR only sees them, Claude sorts each one and
// HR makes the final call, a needs-action reply goes on the dashboard worklist,
// and no reminder email to people who have not replied - the grid just shows it.

/** How a reply was sorted. "hr" is the sensitive one: harassment, discrimination,
 *  safety, retaliation, a serious complaint. Never sent on to a supervisor. */
export const REPLY_LEVELS = ["ok", "fyi", "action", "hr"] as const;
export type ReplyLevel = (typeof REPLY_LEVELS)[number];

export const REPLY_LEVEL_LABEL: Record<ReplyLevel, string> = {
  ok: "All good",
  fyi: "FYI",
  action: "Needs action",
  hr: "Talk to HR today"
};

export function isReplyLevel(v: unknown): v is ReplyLevel {
  return typeof v === "string" && (REPLY_LEVELS as readonly string[]).includes(v);
}

/** The levels that put a reply on the dashboard worklist until somebody marks it handled. */
export function needsFollowUp(level: ReplyLevel): boolean {
  return level === "action" || level === "hr";
}

export const REPLY_CATEGORIES = [
  "pay",
  "benefits",
  "equipment_access",
  "training_schedule",
  "travel_reimbursement",
  "manager_team",
  "wants_to_talk",
  "other",
  "none"
] as const;
export type ReplyCategory = (typeof REPLY_CATEGORIES)[number];

export const REPLY_CATEGORY_LABEL: Record<ReplyCategory, string> = {
  pay: "Pay / payroll",
  benefits: "Benefits",
  equipment_access: "Equipment or system access",
  training_schedule: "Training or schedule",
  travel_reimbursement: "Travel reimbursement",
  manager_team: "Manager or team",
  wants_to_talk: "Wants to talk",
  other: "Other",
  none: "Nothing specific"
};

export function isReplyCategory(v: unknown): v is ReplyCategory {
  return typeof v === "string" && (REPLY_CATEGORIES as readonly string[]).includes(v);
}

export type ReplyTriage = {
  level: ReplyLevel;
  category: ReplyCategory;
  /** One line, for the grid tooltip and the worklist. */
  summary: string;
  /** A suggestion for HR. Never acted on by the app. */
  suggestedStep: string | null;
  /** "ai" when Claude read it; "none" when it could not (no key, an error) and the
   *  reply was filed as FYI so a person reads it. */
  source: "ai" | "none";
};

export type CheckinReply = {
  /** Front message id - the record's identity, so a reply is never filed twice. */
  messageId: string;
  conversationId: string;
  hireId: string;
  /** checkin_30, checkin_60 ... the check-in whose email this answers. */
  taskKey: string;
  receivedAt: string;
  fromEmail: string | null;
  fromName: string | null;
  /** True when the sender is not one of the person's own addresses on file. */
  fromSomeoneElse: boolean;
  /** "thread" = a reply in the thread the app sent; "search" = a new email from
   *  the person with a check-in subject, found by the fallback search. */
  foundBy: "thread" | "search";
  subject: string | null;
  /** The reply itself, word for word, with the quoted original and the mailing-list
   *  footer cut off. */
  text: string;
  /** What Claude said. Kept even after HR changes the level, so it can be compared. */
  triage: ReplyTriage;
  /** HR's final call on the level, when it differs from Claude's. */
  levelOverride?: ReplyLevel | null;
  overrideBy?: string | null;
  handledAt?: string | null;
  handledBy?: string | null;
  handledNote?: string | null;
  filedAt: string;
};

/** What the screens get: the stored record plus the hire's name. */
export type CheckinReplyView = CheckinReply & { level: ReplyLevel; hireName: string | null; frontUrl: string };

export function effectiveLevel(r: Pick<CheckinReply, "triage" | "levelOverride">): ReplyLevel {
  return r.levelOverride && isReplyLevel(r.levelOverride) ? r.levelOverride : r.triage.level;
}

/** Days after a send before the grid says "no reply". Grid only - no reminder email (his call, Nov 11). */
export const NO_REPLY_AFTER_DAYS = 7;

/** A check-in email subject, for the fallback search. Front search cannot filter on
 *  the subject (lib/front search notes), so the thread is fetched and tested here. */
export function isCheckinSubject(subject: string | null | undefined): boolean {
  return /checking\s+in|check[\s-]?in/i.test(subject ?? "");
}

/**
 * The reply alone, from a Front message's plain text.
 *
 * Built from the three real replies in the account on 2026-11-11, which quote the
 * original three different ways - Gmail's "On Mon, Sep 14 ... wrote:" (which can
 * wrap onto a second line), iOS Mail's "> On Sep 29 ... wrote:", and Outlook's
 * "--- original message ---" - and all end in the hrotasks@ group's unsubscribe
 * line. Cut at the earliest of those. What is left, signature included, is kept
 * word for word.
 */
export function cleanReplyText(raw: string | null | undefined): string {
  let t = (raw ?? "").replace(/\r\n?/g, "\n");
  const cuts: number[] = [];
  const patterns = [
    /^[ \t]*>?[ \t]*On [^\n]{0,240}(?:\n[^\n]{0,240})?wrote:[ \t]*$/m,
    /^[ \t]*-{2,}[ \t]*original message[ \t]*-{2,}/im,
    /^[ \t]*-{2,}[ \t]*Original Message[ \t]*-{2,}/m,
    /^[ \t]*From: [^\n]+\n(?:[^\n]*\n){0,3}[ \t]*(?:Sent|Date): /m,
    /^[ \t]*>[^\n]*\n[ \t]*>/m,
    /^To unsubscribe from this group/m
  ];
  for (const p of patterns) {
    const m = p.exec(t);
    if (m) cuts.push(m.index);
  }
  if (cuts.length) t = t.slice(0, Math.min(...cuts));
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t ]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
