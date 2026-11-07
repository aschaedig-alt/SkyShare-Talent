import { prisma } from "@/lib/prisma";
import type { ViewerScope } from "@/lib/auth/viewer-scope";
import { isCandidateVisible } from "@/lib/auth/candidate-scope";

/**
 * THE PAYCOM EMAIL LOG: one row for every email Paycom's notification sender
 * (systemmessage@paycomonline.com) has sent to Aimee's Gmail since 2025-01-01, saying
 * what the app did with it. His request, 2026-11-06: "a running list of all of the
 * emails from paycom that you see, where they are added and what is skipped ... a log
 * that is always accessible for me if i want to check into anything."
 *
 * WHERE THE ROWS COME FROM. The app cannot read Gmail (app Gmail access was built and
 * removed Aug 16 2026). The Paycom notes scan — a scheduled task in the Claude desktop
 * app — reads her Gmail through the connector, and hands each email to
 * scripts/paycom-email-log.ts, which classifies it here and stores the row. The
 * backfill to 2025-01-01 went through the same script.
 *
 * STORAGE. WorkspaceSetting, scope "paycom-email-log", one row per calendar month
 * (key "2026-11"), valueJson = { [gmailMessageId]: PaycomLogRow }. No schema change, a
 * month is a few hundred rows at most, and a month's row is the unit an undo file
 * restores.
 *
 * WHAT A ROW HOLDS — and what it never does:
 *   - Personal mail (her checks to approve, time off, expenses, learning, punch changes,
 *     Ask Here inquiries) is the date and the family ONLY: no subject, no body, no names
 *     (Ask Here carries an employee's name), and never a pay figure — the app carries no
 *     pay fields (Paycom owns comp).
 *   - Nothing holds a body. The person, the Paycom id and the requisition are what a
 *     reader needs to find the thing in Paycom.
 *   - A row whose note was filed HR-only is HR-only itself, the same rule the profile
 *     and Recent notes follow; personal rows are HR-only too.
 */

export const LOG_SCOPE = "paycom-email-log";
export const LOG_START = "2025-01-01";

/** The kinds of Paycom email, and what the app does with each. Order is display order. */
export const FAMILIES = {
  mention: { label: "Note mention", handler: "notes scan" },
  interview: { label: "Interview invite", handler: "interview log" },
  "interview-change": { label: "Interview changed / cancelled", handler: "interview log" },
  "offer-accepted": { label: "Offer accepted", handler: "onboarding sweep" },
  "pending-offer": { label: "Pending offer", handler: "onboarding sweep" },
  "self-onboarding": { label: "Self-onboarding completed", handler: "onboarding sweep" },
  onboarding: { label: "Onboarding / checklist", handler: "onboarding sweep" },
  "background-check": { label: "Background check", handler: "onboarding sweep" },
  "job-request": { label: "Job request", handler: "none" },
  requisition: { label: "Requisition posted", handler: "none" },
  "text-message": { label: "Text message", handler: "none" },
  privacy: { label: "Candidate deletion request", handler: "none" },
  applicant: { label: "New applicant", handler: "none" },
  personal: { label: "Personal", handler: "none" },
  other: { label: "Other Paycom mail", handler: "none" }
} as const;
export type PaycomFamily = keyof typeof FAMILIES;

export const OUTCOMES = {
  "note-filed": "Filed as notes",
  "already-in-app": "Already in the app",
  "interview-recorded": "Interview recorded",
  "offer-step": "Offer step ticked",
  "sweep-pending": "Left to the sweep",
  waiting: "Waiting",
  "needs-decision": "Needs a decision",
  skipped: "Skipped"
} as const;
export type PaycomOutcome = keyof typeof OUTCOMES;

export type PaycomLogRow = {
  /** Gmail message id — the key. */
  id: string;
  threadId: string | null;
  /** When Paycom sent it (ISO). */
  at: string;
  family: PaycomFamily;
  /** Null for personal mail, always. */
  subject: string | null;
  /** The candidate / employee it is about, as Paycom names them. Null for personal mail. */
  person: string | null;
  paycomId: string | null;
  requisition: string | null;
  outcome: PaycomOutcome;
  reason: string | null;
  candidateId: string | null;
  newHireId: string | null;
  interviewIds?: string[];
  noteIds?: string[];
  /** An interview invite's When / Where / Step, as Paycom printed them. */
  interview?: { when: string | null; where: string | null; step: string | null };
  /** A note filed from it is HR-only, so the row is too. */
  hrOnly?: boolean;
  /** Front copies tagged / archived for this email. */
  front?: { tagged: number; archived: number; note?: string };
  loggedAt: string;
};

export const monthKey = (iso: string) => iso.slice(0, 7);

// ---------------------------------------------------------------- classify

/** Personal mail — subjects only, so a body is never needed to know it is personal. */
const PERSONAL = [
  /\bcheck\b.{0,30}\bapprov|approv.{0,30}\bcheck\b|new\s+check\s+(is\s+)?available/i,
  /\bpunch(es)?\b/i,
  /birthday|anniversar/i,
  /\bcourse|due\s+dates?\s+approaching/i,
  /enrollment\s+confirmation/i,
  // Paycom University sessions she teaches or attends, and manager approvals on her phone.
  /instructor|session\s+days|manager\s+on[-\s]the[-\s]go/i,
  /time[-\s]?off/i,
  /\bexpense/i,
  /learning\s+enrollment/i,
  /path\s+enrollment/i,
  /punch\s+change/i,
  /ask\s+here/i,
  /my\s+pay\s+items/i,
  /pay\s*(check|statement|stub)/i,
  /\bw-?2\b/i,
  /direct\s+deposit/i,
  /benefit/i,
  /open\s+enrollment/i,
  /time\s*card/i,
  /schedule\s+change/i,
  /performance\s+review/i,
  /goal/i,
  /password|security\s+code|verification\s+code|login|sign[-\s]?in\s+alert/i,
  // Her own documents and company messages to read and acknowledge.
  /acknowledg|documents\s+assigned|mycom\s+communication/i
];

/** Which family an email belongs to. Body is optional: personal mail is decided on the subject. */
export function classifyPaycomEmail(subject: string, body: string | null): PaycomFamily {
  const s = subject
    .replace(/&amp;/g, "&")
    .replace(/^\s*((fwd?|fw)\s*:|\[external\])\s*/gi, "")
    .trim();
  const b = body ?? "";
  if (/you\s*['’]?\s*ve\s+been\s+mentioned/i.test(s)) return "mention";
  // Job requests carry "[PaycomOnline]" like the personal and task mails, so they go first.
  if (/job\s+request/i.test(s)) return "job-request";
  if (PERSONAL.some((p) => p.test(s))) return "personal";
  if (/^\s*offer\s+accepted\s*$/i.test(s)) return "offer-accepted";
  if (/pending\s+offer|\boffer\b/i.test(s)) return "pending-offer";
  if (/self[-\s]?onboarding/i.test(s)) return "self-onboarding";
  if (/background\s+check/i.test(s)) return "background-check";
  if (/requisition/i.test(s)) return "requisition";
  if (/text\s+message/i.test(s)) return "text-message";
  // A person asking Paycom to erase them: logged by date and kind only, never their name.
  if (/deletion\s+request/i.test(s)) return "privacy";
  // "Cancelled: HM Interview - Sagarin, Lawrence" / "Your appointment has been cancelled for".
  if (/^\s*(cancel+ed|rescheduled|updated)\s*:/i.test(s) || /interview\b.{0,40}\b(cancel|reschedul)/i.test(s) || /appointment\s+has\s+been\s+(cancel+ed|rescheduled)/i.test(b))
    return "interview-change";
  // The invite body is the stable marker: "When: ... Where: ... Candidate: Kyle Ferrin (103834)
  // Requisition: Pilatus PC-12 Captain (1634) Step: HR Interview". Phone screens carry only
  // "<Name> - <Position>" as a subject, so without a body they would land in "other".
  if (/\bWhen:\s[\s\S]+\bCandidate:\s[\s\S]+\(\d+\)/.test(b)) return "interview";
  // Invites have free-form subjects: "Kayla Bunker - PDP Phone Interview", "Interview Scheduled
  // (video)", "James Woods - G450 & GV Captain (video)", "Raymond Cardenas - CL350 First Officer
  // (in person)". The body line is the stable marker when there is a body.
  if (
    /\byou\s+have\s+been\s+invited\s+to\s+an\s+interview\b/i.test(b) ||
    /\binterview\b/i.test(s) ||
    /\([^)]*\b(video|in[-\s]?person|phone|virtual|zoom|teams)\b[^)]*\)/i.test(s)
  )
    return "interview";
  if (/checklist|onboarding|new\s+hire|\[paycomonline\]/i.test(s)) return "onboarding";
  if (/applicant|application|follow\s+up\s+questions/i.test(s)) return "applicant";
  return "other";
}

/** Pull the person / Paycom id / requisition out of a non-personal email. Never called on personal mail. */
export function extractIdentity(family: PaycomFamily, subject: string, body: string | null) {
  const text = (body ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  // "Requisition: Pilatus PC-12 Captain (1634)", "Job Title: Gulfstream G450 & GV Captain (Home Based) (1666)",
  // or the job-request notice's "Requisition ID: 1634".
  const reqTitled = text.match(/(?:Requisition|Job Title):\s*(.+?\(\d{3,5}\))(?=\s+(?:Step|Workflow|Log in|\|)|\s*$)/i)?.[1] ?? null;
  const requisition = reqTitled ?? text.match(/Requisition\s*(?:ID|#|Number)\s*:?\s*(\d{3,5})/i)?.[1] ?? null;
  if (family === "privacy") return { person: null, paycomId: null, requisition: null };
  if (family === "mention") {
    const m = text.match(/(Application|Candidate):\s*([^()]*?)\s*\((\d{3,})\)/);
    return { person: m?.[2]?.trim() || null, paycomId: m?.[3] ?? null, requisition };
  }
  if (family === "interview") {
    const c = text.match(/\bCandidate:\s*([^()|]+?)\s*\((\d{3,})\)/);
    const fromSubject = subject.match(/^\s*([A-Z][\w'’.-]+(?:\s+[A-Z][\w'’.-]+){1,3})\s+-\s+/)?.[1] ?? null;
    return { person: c?.[1]?.trim() ?? fromSubject, paycomId: c?.[2] ?? null, requisition };
  }
  if (family === "interview-change") {
    const n = text.match(/\bName:\s*([A-Z][A-Za-z'’ .-]+?),\s*([A-Z][A-Za-z'’.-]+)/) ?? subject.match(/-\s*([A-Z][A-Za-z'’ .-]+?),\s*([A-Z][A-Za-z'’.-]+)\s*$/);
    return { person: n ? `${n[2]} ${n[1]}` : null, paycomId: null, requisition };
  }
  // The offer / onboarding / text families name people as "Last, First" or "First Last (123456)".
  const paren = text.match(/([A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){1,3})\s*\((\d{5,7})\)/);
  if (paren) return { person: paren[1], paycomId: paren[2], requisition };
  const lastFirst = text.match(/\bfor\s+([A-Z][A-Za-z'’-]+),\s*([A-Z][A-Za-z'’-]+)/);
  if (lastFirst) return { person: `${lastFirst[2]} ${lastFirst[1]}`, paycomId: null, requisition };
  return { person: null, paycomId: null, requisition };
}

// ---------------------------------------------------------------- build a row

export type EmailIn = { id: string; threadId: string | null; at: string; subject: string; body: string | null };
export type RowOverrides = Partial<
  Pick<PaycomLogRow, "outcome" | "reason" | "candidateId" | "paycomId" | "person" | "interviewIds" | "noteIds" | "hrOnly" | "front">
>;

/** Why each family that the app does not act on is skipped — one sentence the page shows. */
const SKIP_REASON: Partial<Record<PaycomFamily, string>> = {
  personal: "personal",
  "job-request": "job request: ignored (his call, 2026-11-06); date and requisition kept",
  requisition: "requisition notice: the app has no step for it",
  "text-message": "a text sent through Paycom: not copied into the app",
  applicant: "applicant notice: the applicant upload brings applications in",
  "pending-offer": "pending-offer notice: the sweep deliberately skips it (not an acceptance)",
  "self-onboarding": "self-onboarding notice: no checklist step reads it",
  onboarding: "Paycom onboarding task / checklist mail: worked inside Paycom",
  "background-check": "background-check notice: the sweep reads these from employmentscreening@, not this sender",
  privacy: "a candidate's deletion request: handled in Paycom; no name kept here",
  other: "a kind of Paycom mail the app does not handle"
};

/** An invite's When / Where / Step, as Paycom prints them. */
export function inviteDetails(body: string | null): { when: string | null; where: string | null; step: string | null } {
  const text = (body ?? "").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  return {
    when: text.match(/\bWhen:\s*(.+?)\s+Where:/)?.[1]?.trim() ?? null,
    where: text.match(/\bWhere:\s*(.+?)\s+Candidate:/)?.[1]?.trim() ?? null,
    step: text.match(/\b(?:Workflow\s+)?Step:\s*(.+?)(?=\s*\||\s+Comments:|\s+MANAGE|\s+Log in|\s+\d+(st|nd|rd|th)\s+Interview|\s+Attention!|$)/)?.[1]?.trim().slice(0, 60) ?? null
  };
}

/**
 * The log row for one email. Read-only: it looks things up (the handled-mention list, the
 * onboarding checklist) but writes nothing — storing it is upsertRows.
 *
 * Offer Accepted is run through the sweep's own code (processPaycomMessage, dry run) so the
 * log says what the sweep did or would do, rather than a second opinion that can drift.
 */
export async function buildRow(email: EmailIn, overrides: RowOverrides = {}): Promise<PaycomLogRow> {
  const family = classifyPaycomEmail(email.subject, email.body);
  const loggedAt = new Date().toISOString();
  const base: PaycomLogRow = {
    id: email.id,
    threadId: email.threadId,
    at: email.at,
    family,
    subject: null,
    person: null,
    paycomId: null,
    requisition: null,
    outcome: "skipped",
    reason: SKIP_REASON[family] ?? null,
    candidateId: null,
    newHireId: null,
    loggedAt
  };
  // Personal mail: date and family, nothing else, whatever an override says.
  if (family === "personal") return base;

  const id = extractIdentity(family, email.subject, email.body);
  const row: PaycomLogRow = { ...base, subject: email.subject.replace(/&amp;/g, "&").slice(0, 200), ...id };

  if (family === "mention") {
    const { handledMentions } = await import("@/lib/paycom/note-filing");
    const handled = (await handledMentions())[email.id];
    if (handled) {
      row.paycomId = row.paycomId ?? handled.paycomId;
      row.outcome = /^filed/.test(handled.result) && !/: 0 added/.test(handled.result) ? "note-filed" : "already-in-app";
      row.reason = handled.result;
    } else {
      row.outcome = "waiting";
      row.reason = "not filed yet: the notes scan reads the application in Paycom";
    }
    if (row.paycomId) row.candidateId = await candidateForPaycomId(row.paycomId);
  } else if (family === "interview" || family === "interview-change") {
    row.outcome = "waiting";
    row.reason = "interview not recorded yet";
    const d = inviteDetails(email.body);
    if (d.when || d.step) row.interview = d;
    if (row.paycomId) row.candidateId = await candidateForPaycomId(row.paycomId);
  } else if (family === "offer-accepted") {
    Object.assign(row, await sweepVerdict(email));
  }

  for (const [k, v] of Object.entries(overrides)) if (v !== undefined) (row as Record<string, unknown>)[k] = v;
  return row;
}

async function candidateForPaycomId(paycomId: string): Promise<string | null> {
  const app = await prisma.candidateApplication.findFirst({ where: { sourceApplicationId: paycomId }, select: { candidateId: true } });
  if (app) return app.candidateId;
  const c = await prisma.candidate.findFirst({ where: { paycomPersonId: paycomId }, select: { id: true } });
  return c?.id ?? null;
}

/** What the onboarding sweep did with an Offer Accepted notice — asked of the sweep itself, read-only. */
async function sweepVerdict(email: EmailIn): Promise<Partial<PaycomLogRow>> {
  if (!email.body) return { outcome: "waiting", reason: "body not read yet" };
  const { processPaycomMessage } = await import("@/lib/paycom/notices");
  const result = await processPaycomMessage(
    {
      id: email.id,
      is_inbound: true,
      subject: email.subject,
      text: email.body,
      recipients: [{ handle: "systemmessage@paycomonline.com", role: "from" }],
      created_at: Math.floor(Date.parse(email.at) / 1000)
    },
    { dryRun: true }
  );
  const who = { person: result.hireName ?? result.personName ?? null, newHireId: result.hireId ?? null, requisition: result.requisition ?? null };
  const linked = result.hireId
    ? await prisma.newHire.findUnique({ where: { id: result.hireId }, select: { candidateId: true } })
    : null;
  const candidateId = linked?.candidateId ?? null;
  if (result.outcome === "already-done") {
    const bySweep = result.hireId
      ? await prisma.activityLog.findFirst({
          where: { entityType: "NewHire", entityId: result.hireId, description: { startsWith: 'Paycom notice ticked "candidate_signed"' } },
          select: { createdAt: true }
        })
      : null;
    return {
      ...who,
      candidateId,
      outcome: "offer-step",
      reason: bySweep
        ? `"Candidate signed offer letter" ticked by the sweep ${bySweep.createdAt.toISOString().slice(0, 10)}`
        : `"Candidate signed offer letter" is ticked (by hand, or before the sweep logged its ticks)`
    };
  }
  if (result.outcome === "would-tick")
    return { ...who, candidateId, outcome: "sweep-pending", reason: "not ticked yet: the sweep ticks it when the Front copy reaches HR Onboarding" };
  const why: Record<string, string> = {
    "no-match": "nobody on the current onboarding roster by that name (often an older hire)",
    "ambiguous-match": "two current people share the name: left for a person",
    "no-name-found": "the notice's name could not be read",
    "no-such-task": "that person's checklist has no offer-signed step",
    "unrecognised-subject": "the body did not say the offer was accepted"
  };
  return { ...who, candidateId, outcome: "skipped", reason: why[result.outcome] ?? result.outcome };
}

// ---------------------------------------------------------------- storage

export async function readMonth(month: string): Promise<Record<string, PaycomLogRow>> {
  const row = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: LOG_SCOPE, key: month } } });
  return row ? (JSON.parse(row.valueJson) as Record<string, PaycomLogRow>) : {};
}

export async function listMonths(): Promise<string[]> {
  const rows = await prisma.workspaceSetting.findMany({ where: { scope: LOG_SCOPE }, select: { key: true } });
  return rows.map((r) => r.key).sort();
}

/**
 * Merge rows into their months. Returns each touched month's PREVIOUS contents (null =
 * the month did not exist), which is what an undo file stores.
 *
 * A row already logged keeps its first loggedAt; everything else is replaced by the
 * newer row, so re-logging an email after its note is filed moves it from "waiting" to
 * "filed" rather than adding a second row.
 */
export async function upsertRows(rows: PaycomLogRow[]): Promise<Record<string, Record<string, PaycomLogRow> | null>> {
  const byMonth = new Map<string, PaycomLogRow[]>();
  for (const r of rows) byMonth.set(monthKey(r.at), [...(byMonth.get(monthKey(r.at)) ?? []), r]);
  const before: Record<string, Record<string, PaycomLogRow> | null> = {};
  for (const [month, list] of byMonth) {
    const existing = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: LOG_SCOPE, key: month } } });
    const current = existing ? (JSON.parse(existing.valueJson) as Record<string, PaycomLogRow>) : {};
    before[month] = existing ? { ...current } : null;
    for (const r of list) current[r.id] = { ...r, loggedAt: current[r.id]?.loggedAt ?? r.loggedAt };
    await prisma.workspaceSetting.upsert({
      where: { scope_key: { scope: LOG_SCOPE, key: month } },
      create: { scope: LOG_SCOPE, key: month, valueJson: JSON.stringify(current) },
      update: { valueJson: JSON.stringify(current) }
    });
  }
  return before;
}

/**
 * Change one logged email in place, by Gmail id — what a filing does once its notes are saved.
 * With no row for that id and a `fallback` email, the row is built first. Returns the months'
 * previous contents for an undo file, or null if there was nothing to patch.
 */
export async function patchRow(id: string, patch: RowOverrides, fallback?: { at: string; subject: string }) {
  for (const month of (await listMonths()).reverse()) {
    const rows = await readMonth(month);
    if (rows[id]) return upsertRows([{ ...rows[id], ...stripUndefined(patch) }]);
  }
  if (!fallback) return null;
  return upsertRows([await buildRow({ id, threadId: null, at: fallback.at, subject: fallback.subject, body: null }, patch)]);
}

const stripUndefined = <T extends object>(o: T) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

/** Put months back exactly as an undo file recorded them. */
export async function restoreMonths(before: Record<string, Record<string, PaycomLogRow> | null>): Promise<string[]> {
  const done: string[] = [];
  for (const [month, value] of Object.entries(before)) {
    if (value === null) {
      await prisma.workspaceSetting.deleteMany({ where: { scope: LOG_SCOPE, key: month } });
      done.push(`${month}: removed`);
    } else {
      await prisma.workspaceSetting.upsert({
        where: { scope_key: { scope: LOG_SCOPE, key: month } },
        create: { scope: LOG_SCOPE, key: month, valueJson: JSON.stringify(value) },
        update: { valueJson: JSON.stringify(value) }
      });
      done.push(`${month}: restored ${Object.keys(value).length} rows`);
    }
  }
  return done;
}

// ---------------------------------------------------------------- the page

export type LogView = {
  rows: Array<PaycomLogRow & { candidateName: string | null }>;
  months: string[];
  familyCounts: Record<string, number>;
  outcomeCounts: Record<string, number>;
  /** Rows in the month shown (every month when none is chosen), as this viewer may see them. */
  total: number;
  /** Rows in the whole log, every month, as this viewer may see them. */
  logTotal: number;
  /** Whole-log rows this viewer may not see (HR-only, personal, or outside the candidate allowlist). */
  hiddenForPrivacy: number;
};

export async function getPaycomLog(options: {
  month?: string | null;
  family?: string | null;
  outcome?: string | null;
  q?: string | null;
  viewer: ViewerScope | null;
}): Promise<LogView> {
  const months = await listMonths();
  // Every month is read so the headline can give the whole log's total, not just the month shown.
  const settings = await prisma.workspaceSetting.findMany({
    where: { scope: LOG_SCOPE },
    select: { key: true, valueJson: true }
  });
  // The profile's own rule (lib/data/candidates.ts, lib/data/recent-notes.ts): no viewer is not HR.
  const isHr = Boolean(options.viewer?.isHr);
  const everyRow = settings.flatMap((s) => Object.values(JSON.parse(s.valueJson) as Record<string, PaycomLogRow>).map((r) => ({ r, month: s.key })));
  // HR-only and personal rows need the HR permission; the candidate allowlist applies to the rest.
  const visible = everyRow.filter(({ r }) => (isHr || (!r.hrOnly && r.family !== "personal")) && (!r.candidateId || isCandidateVisible(options.viewer, r.candidateId)));
  const hiddenForPrivacy = everyRow.length - visible.length;
  const logTotal = visible.length;
  const all = visible.filter(({ month }) => !options.month || month === options.month).map(({ r }) => r);

  const familyCounts: Record<string, number> = {};
  for (const r of all) familyCounts[r.family] = (familyCounts[r.family] ?? 0) + 1;
  const q = options.q?.trim().toLowerCase() ?? "";
  const shown = all
    .filter((r) => !options.family || r.family === options.family)
    .filter((r) => !q || [r.person, r.paycomId, r.subject, r.requisition, r.reason].some((v) => v?.toLowerCase().includes(q)));
  const outcomeCounts: Record<string, number> = {};
  for (const r of shown) outcomeCounts[r.outcome] = (outcomeCounts[r.outcome] ?? 0) + 1;
  const filtered = shown.filter((r) => !options.outcome || r.outcome === options.outcome).sort((a, b) => b.at.localeCompare(a.at));

  const ids = [...new Set(filtered.map((r) => r.candidateId).filter((v): v is string => Boolean(v)))];
  const names = new Map(
    (ids.length ? await prisma.candidate.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : []).map((c) => [c.id, c.displayName])
  );
  return {
    rows: filtered.map((r) => ({ ...r, candidateName: r.candidateId ? (names.get(r.candidateId) ?? null) : null })),
    months,
    familyCounts,
    outcomeCounts,
    total: all.length,
    logTotal,
    hiddenForPrivacy
  };
}
