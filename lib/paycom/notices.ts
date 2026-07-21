import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity/logger";
import type { FrontMessage } from "@/lib/front";

/**
 * Paycom's automated notices, turned into onboarding-checklist progress.
 *
 * Paycom emails HR Onboarding when something moves on a hire (background check,
 * and later others). Those mails carry real status we otherwise re-key by hand, so
 * we read them and tick the matching checklist step.
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

export type PaycomNoticeKind = "BG_INFO_SUBMITTED" | "BG_CHECK_COMPLETE";

type NoticeDef = {
  kind: PaycomNoticeKind;
  /** Checklist key in lib/onboarding/tasks.ts that this notice completes. */
  taskKey: string;
  /** Matched against the message subject — this is what tells the notices apart. */
  subject: RegExp;
  /** Pulls the person's name out of the body. */
  name: RegExp;
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
  }
];

const PAYCOM_SENDER = /@paycomonline\.com$/i;

export type PaycomNoticeResult = {
  kind: PaycomNoticeKind | null;
  personName: string | null;
  hireId: string | null;
  hireName: string | null;
  /** How we tied the Paycom name to a person — worth showing in the report. */
  matchedBy?: "exact" | "nickname";
  /** What actually happened, for the scan report. */
  outcome:
    | "not-a-paycom-notice"
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

/** Identify which Paycom notice this message is, if any. Exported for testing. */
export function classifyNotice(subject: string, fromEmail: string): NoticeDef | null {
  if (!PAYCOM_SENDER.test(fromEmail.trim())) return null;
  return NOTICES.find((n) => n.subject.test(subject)) ?? null;
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
  const base = { kind: null, personName: null, hireId: null, hireName: null } as const;

  const def = classifyNotice(subject, fromEmail);
  if (!def) {
    return PAYCOM_SENDER.test(fromEmail)
      ? { ...base, outcome: "unrecognised-subject", detail: subject }
      : { ...base, outcome: "not-a-paycom-notice" };
  }

  const text = messageText(message);
  const personName = extractName(def, text);
  if (!personName) {
    // Report enough to tell "body never came back" from "wording differs".
    return { ...base, kind: def.kind, outcome: "no-name-found", detail: `len=${text.length} :: ${text.slice(0, 160)}` };
  }

  // Match against people who are actually on staff — never former employees.
  const roster = await prisma.newHire.findMany({
    where: { employmentStatus: { not: "TERMINATED" }, canceled: false },
    select: { id: true, name: true, stage: true }
  });
  const { matches, matchedBy } = matchHire(personName, roster);

  if (matches.length === 0) {
    return { ...base, kind: def.kind, personName, outcome: "no-match" };
  }
  if (matches.length > 1) {
    return { ...base, kind: def.kind, personName, outcome: "ambiguous-match", detail: `${matches.length} current people share this name` };
  }

  const hire = matches[0];
  // Everything from here on names the person we resolved to, so a nickname match
  // can be eyeballed in the report rather than taken on trust.
  const found = {
    ...base,
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

  await prisma.onboardingTask.update({
    where: { id: task.id },
    data: { status: "DONE", completedAt: new Date() }
  });
  await logActivity({
    activityType: "CANDIDATE_EDITED",
    description: `Paycom notice ticked "${def.taskKey}" for ${hire.name} (${def.kind})`,
    entityType: "NewHire",
    entityId: hire.id,
    metadata: { source: "paycom-front", kind: def.kind, taskKey: def.taskKey, subject, paycomName: personName, matchedBy }
  });

  return { ...found, outcome: "ticked", detail: def.taskKey };
}
