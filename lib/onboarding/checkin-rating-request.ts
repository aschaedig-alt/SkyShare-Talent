import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrientationChannelId } from "@/lib/front/config";
import { sendEmail, type SentMessage } from "@/lib/front/messages";
import { guardDecision } from "@/lib/front/send-guard";
import { cleanEditedBody } from "@/lib/front/sanitize-body";
import { resolveSupervisors } from "@/lib/front/orientation-email";
import { RATED_TASK_KEYS, parseAnswers, ratedCheckin, type RatedCheckin, type RaterAnswers } from "@/lib/onboarding/checkin-rating";
import { checkCheckinRatingInput, saveAveragedCheckinRating, saveCheckinRating } from "@/lib/onboarding/save-checkin-rating";
import {
  RATING_LINK_DAYS,
  RATING_LINK_PATH,
  defaultBulkRatingBodyHtml,
  defaultBulkRatingSubject,
  defaultRatingBodyHtml,
  defaultRatingSubject,
  looksLikeEmail,
  ratingGreetingHtml,
  ratingLinkBlockHtml,
  ratingLinksBlockHtml,
  type RatingCancelReason,
  type RatingRecipientMode,
  type RatingRecipientOption,
  type RatingRequestSend,
  type RatingRequestState,
  type RatingRequestView
} from "@/lib/onboarding/checkin-rating-request-shared";

// The no-login check-in rating link: storage, token checks, and the send. Feedback
// cmwcq16o7; the client-safe half (types, email wording) is
// checkin-rating-request-shared.ts. Sent at the 90-day, 6-month and 12-month
// check-ins (his call, Nov 13 2026) - one request per person PER CHECK-IN.
//
// STORAGE: one WorkspaceSetting blob, one entry per person per check-in, so this
// ships without a schema change against the shared live database (the same trade
// every send record in lib/front makes). The 90-day entry is keyed by the hireId
// alone - the shape it had before the 6- and 12-month check-ins existed, so the
// records already sent keep working untouched - and the others by
// "<hireId>@<dayMark>" (recKey). A new request for the same person and check-in
// replaces the old record, whose link has by then been revoked anyway.
//
// THE TOKEN: 12 random bytes, base64url, like the /welcome share token and the
// report share links. Stored in the clear because "resend the same link" has to be
// able to put it in an email again; it guards one form that accepts one rating.
//
// "THE EMPLOYEE LEFT" IS CHECKED ON EVERY READ, not hooked into the write paths.
// A hire leaves through at least five doors (the Post-onboard status select, the
// hire page PATCH, bulk archive, the roster import, Employees), and a hook on each
// is a hook somebody forgets on the sixth. Instead every read - the public page,
// the submit, and the Post-onboard tab's status load - looks at the hire as it is
// now, and the first read that sees them gone records the cancellation, so it
// sticks even if they are later restored. The link is therefore dead from the
// moment they leave, whichever door they left by.

const SCOPE = "onboarding";
const KEY = "checkin-rating-requests";
const DAY_MS = 86_400_000;

/** hrotasks@ is copied on every hand-built send, same as the others in lib/front. */
const CC = ["hrotasks@skyshare.com"];

type StoredRequest = Omit<RatingRequestView, "hireName" | "state" | "dayMark" | "extra" | "others"> & {
  token: string;
  /** Absent on records made before the 6- and 12-month check-ins: those are 90-day. */
  dayMark?: number;
  /** Set by a submission through the link. */
  completed?: boolean;
  /** A second supervisor's link, stored under extraKey (Nov 25 2026). */
  extra?: boolean;
  /**
   * This supervisor's answers, kept on the request while another link in the same
   * check-in is still waiting. The average is saved from these once none is
   * (maybeFinalizeGroup). Absent on one-link check-ins, which save straight away.
   */
  answers?: RaterAnswers;
};

type RequestMap = Record<string, StoredRequest>;

/** Where a person's request for one check-in lives in the map. */
export function recKey(hireId: string, dayMark: number): string {
  return dayMark === 90 ? hireId : `${hireId}@${dayMark}`;
}
/**
 * A second supervisor's link for the same person and check-in (Aimee, Nov 25
 * 2026: one review to the chief pilot AND the assistant chief pilot). Keyed by
 * their address, so each supervisor has at most one link per check-in and a
 * resend to them reuses it. "~" never appears in a cuid or in recKey.
 */
function extraKey(hireId: string, dayMark: number, email: string): string {
  return `${recKey(hireId, dayMark)}~${email.trim().toLowerCase()}`;
}
const markOf = (rec: StoredRequest) => rec.dayMark ?? 90;

/** Every key in the map for one person's check-in: the main link and any second supervisor's. */
function groupKeys(all: RequestMap, hireId: string, dayMark: number): string[] {
  return Object.keys(all).filter((k) => all[k].hireId === hireId && markOf(all[k]) === dayMark);
}
/** The one-link key first, then the others, oldest first - the order every screen lists them in. */
function sortGroup(all: RequestMap, keys: string[]): string[] {
  return [...keys].sort((a, b) => Number(Boolean(all[a].extra)) - Number(Boolean(all[b].extra)) || all[a].firstSentAt.localeCompare(all[b].firstSentAt));
}

async function readAll(): Promise<RequestMap> {
  const row = await prisma.workspaceSetting.findUnique({ where: { scope_key: { scope: SCOPE, key: KEY } }, select: { valueJson: true } });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as RequestMap) : {};
  } catch {
    return {};
  }
}

async function writeAll(all: RequestMap): Promise<void> {
  const valueJson = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson },
    update: { valueJson }
  });
}

/** Read-modify-write one record. Sends and submissions are one-at-a-time human actions. */
async function updateOne(key: string, change: (cur: StoredRequest | undefined) => StoredRequest | null | undefined): Promise<void> {
  const all = await readAll();
  const next = change(all[key]);
  if (next === undefined) return;
  if (next === null) delete all[key];
  else all[key] = next;
  await writeAll(all);
}

function newToken(): string {
  return randomBytes(12).toString("base64url");
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------------------
// The employee as they are now.

const HIRE_SELECT = {
  id: true,
  name: true,
  position: true,
  startDate: true,
  stage: true,
  employmentStatus: true,
  canceled: true,
  terminationDate: true,
  tasks: { where: { key: { in: RATED_TASK_KEYS } }, select: { key: true, status: true } }
} as const;

type HireNow = {
  id: string;
  name: string;
  position: string | null;
  startDate: Date | null;
  stage: string;
  employmentStatus: string;
  canceled: boolean;
  terminationDate: Date | null;
  tasks: { key: string; status: string }[];
};

/**
 * Has this person left, in the sense that this check-in's rating should no longer
 * be asked for? Null when they have not; otherwise the plain words for why.
 *
 * Terminated, or cancelled as a hire, always counts. ARCHIVED counts only while
 * THIS check-in is still open: finishing every check-in also archives a person
 * (maybeArchiveOnCheckinsComplete) and they are a current employee then, not gone -
 * a manager's link must not die because HR ticked the last box by hand.
 */
export function leftReason(hire: Pick<HireNow, "stage" | "employmentStatus" | "canceled" | "tasks" | "terminationDate">, checkin: RatedCheckin): string | null {
  if (hire.employmentStatus === "TERMINATED") {
    const day = hire.terminationDate
      ? ` ${hire.terminationDate.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
      : "";
    return `Marked terminated${day ? `, last day${day}` : ""}`;
  }
  if (hire.canceled) return "Hire cancelled";
  // An anytime check-in is for people past their first year, most of whom are
  // archived by then - archived is a current employee for it, never "left".
  if (checkin.anytime) return null;
  const checkinOpen = !hire.tasks.some((t) => t.key === checkin.taskKey && (t.status === "DONE" || t.status === "NA"));
  if (hire.stage === "ARCHIVED" && checkinOpen) return "Archived";
  return null;
}

function stateOf(rec: StoredRequest, ratedInApp: boolean, now = Date.now()): RatingRequestState {
  if (rec.completed) return "COMPLETED";
  if (rec.cancelledAt) return "CANCELLED";
  if (ratedInApp) return "RATED_IN_APP";
  if (new Date(rec.expiresAt).getTime() < now) return "EXPIRED";
  return "PENDING";
}

function toView(rec: StoredRequest, hireName: string, state: RatingRequestState): RatingRequestView {
  return {
    hireId: rec.hireId,
    dayMark: markOf(rec),
    hireName,
    state,
    to: rec.to,
    toName: rec.toName,
    firstSentAt: rec.firstSentAt,
    lastSentAt: rec.lastSentAt,
    expiresAt: rec.expiresAt,
    sends: rec.sends ?? [],
    completedAt: rec.completedAt ?? null,
    completedByName: rec.completedByName ?? null,
    cancelledAt: rec.cancelledAt ?? null,
    cancelledBy: rec.cancelledBy ?? null,
    cancelReason: rec.cancelReason ?? null,
    cancelDetail: rec.cancelDetail ?? null,
    acknowledgedAt: rec.acknowledgedAt ?? null,
    extra: Boolean(rec.extra),
    others: []
  };
}

/**
 * Cancel (in memory) every open request in `all` whose employee has left, and
 * return the hires as they are now plus the map keys it cancelled. NEVER WRITES:
 * the caller persists, because a caller may hand in a one-record slice of the map
 * and writing that back would wipe every other request.
 */
async function settle(all: RequestMap): Promise<{ hires: Map<string, HireNow>; rated: Set<string>; cancelled: string[] }> {
  const keys = Object.keys(all);
  if (!keys.length) return { hires: new Map(), rated: new Set(), cancelled: [] };
  const ids = [...new Set(keys.map((k) => all[k].hireId))];
  const [hires, ratings] = await Promise.all([
    prisma.newHire.findMany({ where: { id: { in: ids } }, select: HIRE_SELECT }),
    // Every day mark, anytime check-ins included (each request is matched to its own mark below).
    prisma.hireCheckinRating.findMany({ where: { newHireId: { in: ids } }, select: { newHireId: true, dayMark: true, updatedAt: true, enteredBy: true } })
  ]);
  const byId = new Map(hires.map((h) => [h.id, h as HireNow]));
  // Rated in the app AFTER the request went out - an older rating is what the
  // request was sent to replace or confirm, so it must not close the link.
  // Only an IN-APP rating counts: a rating saved by a link ("Rating link (...)")
  // is one supervisor's or the group's average, and must not close the other
  // supervisor's link that is still waiting (Nov 25 2026).
  const rated = new Set<string>();
  for (const r of ratings) {
    if (r.enteredBy?.startsWith("Rating link")) continue;
    for (const k of groupKeys(all, r.newHireId, r.dayMark)) {
      if (r.updatedAt.getTime() > new Date(all[k].firstSentAt).getTime()) rated.add(k);
    }
  }

  const now = new Date().toISOString();
  const cancelled: string[] = [];
  for (const k of keys) {
    const rec = all[k];
    if (rec.completed || rec.cancelledAt) continue;
    const hire = byId.get(rec.hireId);
    const checkin = ratedCheckin(markOf(rec));
    const why = !hire ? "Employee record deleted" : checkin ? leftReason(hire, checkin) : null;
    if (!why) continue;
    all[k] = { ...rec, cancelledAt: now, cancelledBy: null, cancelReason: "LEFT", cancelDetail: why };
    cancelled.push(k);
  }
  return { hires: byId, rated, cancelled };
}

/**
 * The requests the Post-onboard tab shows: every check-in request for the listed
 * hires, plus every un-dismissed "employee left" cancellation - those people have
 * usually left the Post-onboard list by then, so the tab says it in a notice.
 */
export async function getRatingRequestViews(hireIds: string[]): Promise<{ requests: RatingRequestView[]; leftNotices: RatingRequestView[] }> {
  const all = await readAll();
  const { hires, rated, cancelled } = await settle(all);
  // Persisted one record at a time against a FRESH read, so a send that landed
  // between this read and now is not overwritten by the stale copy.
  for (const k of cancelled) {
    await updateOne(k, (cur) => (cur && cur.token === all[k].token && !cur.cancelledAt && !cur.completed ? all[k] : undefined));
  }
  const wanted = new Set(hireIds);
  const views = new Map<string, RatingRequestView>();
  const leftNotices: RatingRequestView[] = [];
  for (const [k, rec] of Object.entries(all)) {
    const name = hires.get(rec.hireId)?.name ?? "A former employee";
    const view = toView(rec, name, stateOf(rec, rated.has(k)));
    views.set(k, view);
    // One notice per person and check-in, from its main link.
    if (!rec.extra && view.state === "CANCELLED" && view.cancelReason === "LEFT" && !view.acknowledgedAt) leftNotices.push(view);
  }
  // ONE view per person and check-in - the main link, with any second supervisor's
  // link under `others` - because every screen keys requests by person + check-in.
  const requests: RatingRequestView[] = [];
  const seen = new Set<string>();
  for (const rec of Object.values(all)) {
    const g = `${rec.hireId}|${markOf(rec)}`;
    if (!wanted.has(rec.hireId) || seen.has(g)) continue;
    seen.add(g);
    const [main, ...rest] = sortGroup(all, groupKeys(all, rec.hireId, markOf(rec)));
    requests.push({ ...views.get(main)!, others: rest.map((k) => views.get(k)!) });
  }
  return { requests, leftNotices };
}

/** The one view the screens show for a person's check-in, read fresh. Null when nothing was ever sent. */
async function groupView(hireId: string, dayMark: number): Promise<RatingRequestView | null> {
  const { requests } = await getRatingRequestViews([hireId]);
  return requests.find((r) => r.dayMark === dayMark) ?? null;
}

/**
 * Every check-in request, for Reports > Check-ins. READ ONLY: the same views as
 * getRatingRequestViews, with "employee left" worked out in memory and NOT saved -
 * a report render must never write the shared store. (Post-onboard's next load
 * persists those cancellations as it always has.)
 */
export async function readAllRatingRequestViews(): Promise<RatingRequestView[]> {
  const all = await readAll();
  const { hires, rated } = await settle(all);
  return Object.entries(all).map(([k, rec]) => toView(rec, hires.get(rec.hireId)?.name ?? "A former employee", stateOf(rec, rated.has(k))));
}

// ---------------------------------------------------------------------------
// The public side: /rate/<token>.

export type RatingLinkLookup =
  | { found: false }
  | {
      found: true;
      state: RatingRequestState;
      hireId: string;
      dayMark: number;
      employeeName: string;
      position: string | null;
      startDate: string | null;
      managerName: string | null;
      expiresAt: string;
    };

/**
 * Who this link is for, which check-in, and whether it still works. FAILS
 * CLOSED: an unknown or malformed token is simply not found, and nothing about
 * any other request is read.
 */
export async function lookupRatingLink(token: string | undefined | null): Promise<RatingLinkLookup> {
  const t = (token ?? "").trim();
  if (!/^[A-Za-z0-9_-]{12,64}$/.test(t)) return { found: false };
  const all = await readAll();
  const entry = Object.entries(all).find(([, r]) => typeof r.token === "string" && sameToken(r.token, t));
  if (!entry) return { found: false };
  const [key, rec] = entry;
  // Settle only this one record, but through the same code as the tab.
  const one: RequestMap = { [key]: rec };
  const { hires, rated, cancelled } = await settle(one);
  if (cancelled.length) {
    // Cancelled on this read: persist into the FULL map, this one record only.
    await updateOne(key, (cur) => (cur && cur.token === rec.token ? one[key] : undefined));
  }
  const fresh = one[key];
  const hire = hires.get(rec.hireId);
  return {
    found: true,
    state: stateOf(fresh, rated.has(key)),
    hireId: rec.hireId,
    dayMark: markOf(rec),
    employeeName: hire?.name ?? "this employee",
    position: hire?.position ?? null,
    startDate: hire?.startDate ? hire.startDate.toISOString() : null,
    managerName: fresh.toName,
    expiresAt: fresh.expiresAt
  };
}

/** The map key a token lives under, or null. */
function keyForToken(all: RequestMap, token: string): string | null {
  return Object.keys(all).find((k) => typeof all[k].token === "string" && sameToken(all[k].token, token)) ?? null;
}

export type SubmitRatingLinkResult = { ok: true } | { ok: false; status: number; message: string };

/**
 * The manager's submit, for a link already checked as PENDING by lookupRatingLink.
 *
 * ONE LINK for this check-in (every check-in before Nov 25 2026): the rating saves
 * straight away and the check-in is ticked done, exactly as it always has.
 *
 * TWO SUPERVISORS: this supervisor's answers are kept on their own request, and
 * the AVERAGE is saved once no other link in the group is still waiting
 * (maybeFinalizeGroup) - so the check-in is ticked done when both have rated.
 */
export async function submitRatingLink(input: {
  token: string;
  hireId: string;
  dayMark: number;
  answers: unknown;
  managerName: string | null;
  notes: string | null;
}): Promise<SubmitRatingLinkResult> {
  const all = await readAll();
  const key = keyForToken(all, input.token);
  if (!key) return { ok: false, status: 404, message: "This link isn't valid." };
  const others = groupKeys(all, input.hireId, input.dayMark).filter((k) => k !== key && !all[k].cancelledAt);

  if (!others.length) {
    const result = await saveCheckinRating({
      newHireId: input.hireId,
      dayMark: input.dayMark,
      answers: input.answers,
      managerName: input.managerName,
      notes: input.notes,
      enteredBy: `Rating link${input.managerName ? ` (${input.managerName})` : ""}`
    });
    if (!result.ok) return result as { ok: false; status: number; message: string };
    await updateOne(key, (cur) =>
      cur && sameToken(cur.token, input.token) ? { ...cur, completed: true, completedAt: new Date().toISOString(), completedByName: input.managerName } : undefined
    );
    return { ok: true };
  }

  const check = checkCheckinRatingInput({ answers: input.answers, notes: input.notes });
  if (!check.ok) return { ok: false, status: 400, message: (check as { message: string }).message };
  const parsed = parseAnswers(input.answers);
  if (!parsed.ok) return { ok: false, status: 400, message: (parsed as { message: string }).message };
  const nowIso = new Date().toISOString();
  await updateOne(key, (cur) =>
    cur && sameToken(cur.token, input.token)
      ? {
          ...cur,
          completed: true,
          completedAt: nowIso,
          completedByName: input.managerName,
          answers: {
            name: input.managerName ?? cur.toName,
            email: cur.to,
            ratingsJson: parsed.ratingsJson,
            wouldHireAgain: parsed.wouldHireAgain,
            notes: input.notes?.trim() || null,
            at: nowIso
          }
        }
      : undefined
  );
  await maybeFinalizeGroup(input.hireId, input.dayMark);
  return { ok: true };
}

/**
 * Save the average for a two-supervisor check-in once no link in it is still
 * waiting. Called after a submit and after a cancel (cancelling the supervisor who
 * never answered is how HR closes it with one rating). An EXPIRED link does not
 * hold it up; if HR resends it and it is answered later, the average is saved
 * again with both. Does nothing for a group with no kept answers - including every
 * one-link check-in, whose rating was saved at submit.
 */
async function maybeFinalizeGroup(hireId: string, dayMark: number): Promise<void> {
  const all = await readAll();
  const keys = sortGroup(all, groupKeys(all, hireId, dayMark));
  if (keys.some((k) => stateOf(all[k], false) === "PENDING")) return;
  const answered = keys.map((k) => all[k]).filter((r) => r.completed && r.answers);
  if (!answered.length) return;
  await saveAveragedCheckinRating(
    hireId,
    dayMark,
    answered.map((r) => r.answers as RaterAnswers)
  );
}

// ---------------------------------------------------------------------------
// HR side: who to send to, send / resend, cancel, dismiss.

/** The hire's supervisors that have an address, primary first. */
export async function ratingRecipientOptions(
  hireId: string,
  dayMark: number
): Promise<{ employeeName: string; options: RatingRecipientOption[]; leftReason: string | null } | null> {
  const checkin = ratedCheckin(dayMark);
  if (!checkin) return null;
  const hire = await prisma.newHire.findUnique({
    where: { id: hireId },
    select: {
      ...HIRE_SELECT,
      supervisorName: true,
      supervisorEmail: true,
      supervisorHire: { select: { name: true, ssEmail: true, personalEmail: true } },
      supervisor2Name: true,
      supervisor2Email: true,
      supervisor2Hire: { select: { name: true, ssEmail: true, personalEmail: true } }
    }
  });
  if (!hire) return null;
  const options: RatingRecipientOption[] = [];
  resolveSupervisors(hire).forEach((s, i) => {
    if (s.email) options.push({ name: s.name, email: s.email, source: i === 0 ? "supervisor" : "supervisor2" });
  });
  return { employeeName: hire.name, options, leftReason: leftReason(hire as HireNow, checkin) };
}

/**
 * The absolute origin the link is built on. Same order as contacts-email.ts. A
 * localhost origin is refused when the email would really reach somebody - it is
 * allowed only when the send guard is redirecting to the test inbox, where a link
 * that opens on this machine is exactly what a tester wants.
 */
function resolveOrigin(realSend: boolean): string {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = process.env.NEXTAUTH_URL ?? (productionHost ? `https://${productionHost}` : "https://skyshare-journey.vercel.app");
  if (realSend && /localhost|127\.0\.0\.1|\[::1\]/i.test(base)) {
    throw new Error("This machine resolves the site to localhost, so the rating link would only open here. Send it from the deployed site instead.");
  }
  return base.replace(/\/+$/, "");
}

export type SendRatingRequestInput = {
  hireId: string;
  /** 90, 180 or 365 - which check-in this request is for. */
  dayMark: number;
  to: string;
  toName: string | null;
  subject: string | null;
  /** Null = the app's default wording, untouched. */
  bodyHtml: string | null;
  /** "same" keeps the link already sent (only while it is pending or expired). */
  linkMode: "new" | "same";
  /**
   * True = a link for ANOTHER supervisor, beside the one already out: each rates
   * separately and the scores are averaged. False = the main link (a first send,
   * a resend, or a replacement that kills the old link).
   */
  additional?: boolean;
  actor: string | null;
};

export type SendRatingRequestResult =
  | { ok: true; request: RatingRequestView; mode: string; warnings: string[] }
  | { ok: false; error: string };

export async function sendRatingRequest(input: SendRatingRequestInput): Promise<SendRatingRequestResult> {
  const checkin = ratedCheckin(input.dayMark);
  if (!checkin) return { ok: false, error: "Which check-in? (3-month, 6-month or 12-month)" };
  const to = input.to.trim();
  if (!looksLikeEmail(to)) return { ok: false, error: "Enter the manager's email address." };
  const toName = input.toName?.replace(/\s+/g, " ").trim().slice(0, 80) || null;

  const hire = await prisma.newHire.findUnique({ where: { id: input.hireId }, select: HIRE_SELECT });
  if (!hire) return { ok: false, error: "Employee not found." };
  const gone = leftReason(hire as HireNow, checkin);
  if (gone) return { ok: false, error: `${hire.name} has left (${gone.toLowerCase()}), so there is no ${checkin.short} rating to ask for.` };

  // The hire was checked just above, so there is nothing for settle() to cancel here.
  const before = await readAll();
  const mainKey = recKey(hire.id, checkin.dayMark);
  let key = mainKey;
  if (input.additional) {
    const main = before[mainKey];
    if (!main || main.cancelledAt) return { ok: false, error: "There is no link out yet to send a second one beside - send it as the main link." };
    if (main.completed && !main.answers) return { ok: false, error: `${main.completedByName ?? "The manager"} already rated this check-in, so a second rating cannot be averaged with it.` };
    if (main.to.toLowerCase() === to.toLowerCase()) return { ok: false, error: `The main link already goes to ${to}.` };
    key = extraKey(hire.id, checkin.dayMark, to);
  } else {
    // Sending the main link to someone who already has a second-supervisor link would give them two.
    const dup = groupKeys(before, hire.id, checkin.dayMark).find((k) => k !== mainKey && before[k].to.toLowerCase() === to.toLowerCase() && !before[k].cancelledAt);
    if (dup) return { ok: false, error: `${to} already has their own link for this check-in.` };
  }
  const prev = before[key];
  const prevState = prev ? stateOf(prev, false) : null;
  if (prevState === "COMPLETED") return { ok: false, error: `${prev.completedByName ?? "The manager"} already submitted this rating.` };
  const reuse = input.linkMode === "same" && prev && (prevState === "PENDING" || prevState === "EXPIRED");
  if (input.linkMode === "same" && !reuse) return { ok: false, error: "That link no longer works, so a new one is needed." };

  const token = reuse ? prev.token : newToken();
  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + RATING_LINK_DAYS * DAY_MS).toISOString();
  const subject = input.subject?.replace(/\s+/g, " ").trim().slice(0, 200) || defaultRatingSubject(hire.name, checkin.dayMark);
  const edited = Boolean(input.bodyHtml && input.bodyHtml.trim());
  const body = edited ? cleanEditedBody(input.bodyHtml as string) : defaultRatingBodyHtml(hire.name, checkin.dayMark);

  const guard = guardDecision({ to: [to], cc: CC, subject });
  let channelId: string;
  let html: string;
  try {
    const url = `${resolveOrigin(guard.mode === "production")}${RATING_LINK_PATH}/${token}`;
    html = ratingGreetingHtml(toName) + body + ratingLinkBlockHtml(url, hire.name, expiresAt, checkin.dayMark);
    channelId = await getOrientationChannelId();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the email." };
  }

  // The link has to work BEFORE the email can land, so the record is written
  // first. A failed send puts the previous record back exactly as it was.
  const draft: StoredRequest = {
    hireId: hire.id,
    dayMark: checkin.dayMark,
    token,
    to,
    toName,
    firstSentAt: reuse ? prev.firstSentAt : nowIso,
    lastSentAt: nowIso,
    expiresAt,
    sends: [...(reuse ? prev.sends ?? [] : []), { at: nowIso, to, toName, by: input.actor, mode: guard.mode, newLink: !reuse, edited }],
    completedAt: null,
    completedByName: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    cancelDetail: null,
    acknowledgedAt: null,
    ...(key !== mainKey ? { extra: true } : {})
  };
  try {
    await updateOne(key, () => draft);
  } catch {
    return { ok: false, error: "Could not save the request, so nothing was sent." };
  }

  let sent: SentMessage;
  try {
    sent = await sendEmail(channelId, { to: [to], cc: CC, subject, body: html, archive: false });
  } catch (err) {
    await updateOne(key, () => prev ?? null).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }

  // From here the email is gone: every outcome is a success with a caveat.
  const warnings: string[] = [];
  if (guard.mode !== "production") {
    warnings.push(
      `This is not the production environment, so the email was ${guard.mode === "redirected" ? "redirected to the test inbox" : `handled as "${guard.mode}"`} rather than delivered to ${to}.`
    );
  }
  if (sent.conversationId) {
    try {
      await updateOne(key, (cur) => {
        if (!cur || cur.token !== token) return undefined;
        const sends = [...cur.sends];
        const last = sends[sends.length - 1] as RatingRequestSend | undefined;
        if (last && last.at === nowIso) sends[sends.length - 1] = { ...last, conversationId: sent.conversationId };
        return { ...cur, sends };
      });
    } catch {
      /* the conversation id is a nicety */
    }
  }
  // The whole check-in (main link plus any second supervisor's), since the screens show them together.
  const request = (await groupView(hire.id, checkin.dayMark).catch(() => null)) ?? toView(draft, hire.name, "PENDING");
  return { ok: true, request, mode: guard.mode, warnings };
}

// ---------------------------------------------------------------------------
// Bulk: one email per manager, one link per person (his ask, Nov 14 2026: "give me
// the ability to send the manager check-in in bulk when sending more than one to
// the same manager"). Each person still gets their own request record and token,
// exactly as a single send makes, so status, resend, cancel and the link page all
// work per person; only the email is shared.

//
// WHO IT GOES TO (Aimee, Nov 25 2026, feedback cmwwiir1m): the bulk send used to
// go only to each person's FIRST supervisor and to leave out anyone with a link
// already out - so when she had sent links to Britt and wanted them all to go to
// Jared (their second supervisor) instead, every one was left out and the dialog
// said nobody could be sent. Now the dialog picks who (first supervisor, second
// supervisor, BOTH - each gets their own link and the scores are averaged - or
// one address for everybody) and can replace a link already out.

export type BulkRatingOptions = {
  mode: RatingRecipientMode;
  /** Mode "other": the one address every link goes to. */
  other?: { to: string; toName: string | null } | null;
  /** Replace a link already out (that link stops working) instead of leaving the person out. */
  replaceOpen?: boolean;
};

export type BulkRatingPlanItem = {
  hireId: string;
  name: string;
  /** A second supervisor's link, beside the main one. */
  extra: boolean;
  /** Who the link this one replaces went to, when it replaces one. */
  replacing: string | null;
};
export type BulkRatingGroup = { to: string; toName: string | null; items: BulkRatingPlanItem[] };
export type BulkRatingPlan = { dayMark: number; groups: BulkRatingGroup[]; skipped: Array<{ hireId: string; name: string; reason: string }> };

type BulkTarget = { to: string; toName: string | null; extra: boolean; replacing: string | null };
type BulkCandidate = { name: string; reason: string } | { name: string; targets: BulkTarget[]; notes: string[] };

/** Who one person's links would go to under these options, or why they cannot be sent. */
async function bulkCandidate(hireId: string, checkin: RatedCheckin, all: RequestMap, opts: BulkRatingOptions): Promise<BulkCandidate> {
  const hire = await prisma.newHire.findUnique({
    where: { id: hireId },
    select: {
      ...HIRE_SELECT,
      supervisorName: true,
      supervisorEmail: true,
      supervisorHire: { select: { name: true, ssEmail: true, personalEmail: true } },
      supervisor2Name: true,
      supervisor2Email: true,
      supervisor2Hire: { select: { name: true, ssEmail: true, personalEmail: true } }
    }
  });
  if (!hire) return { name: hireId, reason: "not found" };
  const gone = leftReason(hire as HireNow, checkin);
  if (gone) return { name: hire.name, reason: `has left (${gone.toLowerCase()})` };
  const task = hire.tasks.find((t) => t.key === checkin.taskKey);
  if (task?.status === "DONE") return { name: hire.name, reason: `${checkin.short} already marked done` };
  if (task?.status === "NA") return { name: hire.name, reason: `${checkin.short} skipped or not applicable` };
  const rated = await prisma.hireCheckinRating.findFirst({ where: { newHireId: hire.id, dayMark: checkin.dayMark }, select: { id: true } });
  if (rated) return { name: hire.name, reason: "already rated" };

  const mainKey = recKey(hire.id, checkin.dayMark);
  const main = all[mainKey];
  if (main?.completed && !main.answers) return { name: hire.name, reason: "already rated through the link" };

  // Who, before checking what is already out.
  const sups = resolveSupervisors(hire);
  const first = sups.find((s) => s.email);
  const second = sups[1]?.email ? sups[1] : null;
  const asTarget = (s: { name: string | null; email: string | null }, extra: boolean): BulkTarget => ({
    to: (s.email as string).trim(),
    toName: s.name ?? null,
    extra,
    replacing: null
  });
  const wanted: BulkTarget[] = [];
  const notes: string[] = [];
  if (opts.mode === "other") {
    if (!opts.other || !looksLikeEmail(opts.other.to)) return { name: hire.name, reason: "type who to send it to" };
    wanted.push({ to: opts.other.to.trim(), toName: opts.other.toName, extra: false, replacing: null });
  } else if (opts.mode === "supervisor2") {
    if (!second) return { name: hire.name, reason: "no second supervisor on file" };
    wanted.push(asTarget(second, false));
  } else {
    if (!first) return { name: hire.name, reason: "no supervisor email on file - send it on its own" };
    wanted.push(asTarget(first, false));
    if (opts.mode === "both") {
      if (second && second.email?.trim().toLowerCase() !== first.email?.trim().toLowerCase()) wanted.push(asTarget(second, true));
      else notes.push(`only one supervisor on file, so only ${first.name ?? first.email} gets a link`);
    }
  }

  // What is already out, per link.
  const targets: BulkTarget[] = [];
  for (const t of wanted) {
    const key = t.extra ? extraKey(hire.id, checkin.dayMark, t.to) : mainKey;
    const prev = all[key];
    const state = prev ? stateOf(prev, false) : null;
    const who = t.toName ?? t.to;
    if (state === "COMPLETED") {
      notes.push(`${who} already rated them`);
      continue;
    }
    if (!t.extra) {
      const dup = groupKeys(all, hire.id, checkin.dayMark).find((k) => k !== mainKey && all[k].to.toLowerCase() === t.to.toLowerCase() && !all[k].cancelledAt);
      if (dup) {
        notes.push(`${who} already has their own link`);
        continue;
      }
    } else if (main && !main.cancelledAt && main.to.toLowerCase() === t.to.toLowerCase() && !targets.some((x) => !x.extra)) {
      // They hold the main link already (e.g. it was re-sent to them in place of
      // the first supervisor). Only when this same send overwrites that main link
      // (a main target is going out - the main is always checked first) does the
      // second supervisor need a link of their own.
      notes.push(`${who} already has the main link`);
      continue;
    }
    if (state === "PENDING") {
      if (!opts.replaceOpen) {
        notes.push(`a link is already out to ${prev.toName ?? prev.to}`);
        continue;
      }
      targets.push({ ...t, replacing: prev.toName ?? prev.to });
    } else targets.push(t);
  }
  if (!targets.length) return { name: hire.name, reason: notes.join("; ") || "nothing to send" };
  return { name: hire.name, targets, notes };
}

/** Who would get which links, grouped by recipient. Nothing is written. */
export async function planBulkRatingSend(
  hireIds: string[],
  dayMark: number,
  opts: BulkRatingOptions = { mode: "supervisor" }
): Promise<BulkRatingPlan | { error: string }> {
  const checkin = ratedCheckin(dayMark);
  if (!checkin) return { error: "Which check-in? (3-month, 6-month or 12-month)" };
  const all = await readAll();
  const groups = new Map<string, BulkRatingGroup>();
  const skipped: BulkRatingPlan["skipped"] = [];
  for (const id of [...new Set(hireIds)]) {
    const c = await bulkCandidate(id, checkin, all, opts);
    if ("reason" in c) {
      skipped.push({ hireId: id, name: c.name, reason: c.reason });
      continue;
    }
    // Sent to one supervisor but not the other: still listed, with why.
    c.notes.forEach((n, i) => skipped.push({ hireId: `${id}#${i}`, name: c.name, reason: n }));
    for (const t of c.targets) {
      const k = t.to.toLowerCase();
      const g = groups.get(k) ?? { to: t.to, toName: t.toName, items: [] };
      g.items.push({ hireId: id, name: c.name, extra: t.extra, replacing: t.replacing });
      groups.set(k, g);
    }
  }
  return { dayMark, groups: [...groups.values()].sort((a, b) => b.items.length - a.items.length), skipped };
}

export type SendBulkRatingInput = {
  hireIds: string[];
  dayMark: number;
  to: string;
  toName: string | null;
  subject: string | null;
  bodyHtml: string | null;
  actor: string | null;
  options: BulkRatingOptions;
};

/** Send one recipient one email with a link for each person. Every person is re-checked first, with the options the plan used. */
export async function sendBulkRatingRequests(
  input: SendBulkRatingInput
): Promise<{ ok: true; requests: RatingRequestView[]; skipped: Array<{ name: string; reason: string }>; mode: string; warnings: string[] } | { ok: false; error: string }> {
  const checkin = ratedCheckin(input.dayMark);
  if (!checkin) return { ok: false, error: "Which check-in? (3-month, 6-month or 12-month)" };
  const to = input.to.trim();
  if (!looksLikeEmail(to)) return { ok: false, error: "That manager has no usable email address." };
  const toName = input.toName?.replace(/\s+/g, " ").trim().slice(0, 80) || null;

  const before = await readAll();
  const people: Array<{ hireId: string; name: string; extra: boolean }> = [];
  const skipped: Array<{ name: string; reason: string }> = [];
  for (const id of [...new Set(input.hireIds)]) {
    const c = await bulkCandidate(id, checkin, before, input.options);
    if ("reason" in c) {
      skipped.push({ name: c.name, reason: c.reason });
      continue;
    }
    const t = c.targets.find((x) => x.to.toLowerCase() === to.toLowerCase());
    if (t) people.push({ hireId: id, name: c.name, extra: t.extra });
    else skipped.push({ name: c.name, reason: `their link now goes to ${c.targets.map((x) => x.toName ?? x.to).join(" and ")}` });
  }
  if (people.length === 0) return { ok: false, error: `Nothing to send: ${skipped.map((s) => `${s.name} - ${s.reason}`).join("; ") || "no one selected"}.` };

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + RATING_LINK_DAYS * DAY_MS).toISOString();
  const names = people.map((p) => p.name);
  const subject = input.subject?.replace(/\s+/g, " ").trim().slice(0, 200) || defaultBulkRatingSubject(names, checkin.dayMark);
  const edited = Boolean(input.bodyHtml && input.bodyHtml.trim());
  const body = edited ? cleanEditedBody(input.bodyHtml as string) : defaultBulkRatingBodyHtml(names, checkin.dayMark);
  const guard = guardDecision({ to: [to], cc: CC, subject });
  const tokens = people.map(() => newToken());

  let channelId: string;
  let html: string;
  try {
    const origin = resolveOrigin(guard.mode === "production");
    const entries = people.map((p, i) => ({ url: `${origin}${RATING_LINK_PATH}/${tokens[i]}`, employeeName: p.name }));
    html = ratingGreetingHtml(toName) + body + ratingLinksBlockHtml(entries, expiresAt, checkin.dayMark);
    channelId = await getOrientationChannelId();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the email." };
  }

  // Every link has to work BEFORE the email lands, so all records are written in
  // one write first; a failed send puts every one back exactly as it was. A
  // replaced link is overwritten here, which is what stops the old one working.
  const drafts: StoredRequest[] = people.map((p, i) => ({
    hireId: p.hireId,
    dayMark: checkin.dayMark,
    token: tokens[i],
    to,
    toName,
    firstSentAt: nowIso,
    lastSentAt: nowIso,
    expiresAt,
    sends: [{ at: nowIso, to, toName, by: input.actor, mode: guard.mode, newLink: true, edited }],
    completedAt: null,
    completedByName: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    cancelDetail: null,
    acknowledgedAt: null,
    ...(p.extra ? { extra: true } : {})
  }));
  const keys = people.map((p) => (p.extra ? extraKey(p.hireId, checkin.dayMark, to) : recKey(p.hireId, checkin.dayMark)));
  const prevs = keys.map((k) => before[k]);
  try {
    const all = await readAll();
    keys.forEach((k, i) => (all[k] = drafts[i]));
    await writeAll(all);
  } catch {
    return { ok: false, error: "Could not save the requests, so nothing was sent." };
  }

  let sent: SentMessage;
  try {
    sent = await sendEmail(channelId, { to: [to], cc: CC, subject, body: html, archive: false });
  } catch (err) {
    try {
      const all = await readAll();
      keys.forEach((k, i) => {
        if (prevs[i]) all[k] = prevs[i];
        else delete all[k];
      });
      await writeAll(all);
    } catch {
      /* best effort */
    }
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }

  const warnings: string[] = [];
  if (guard.mode !== "production") {
    warnings.push(`This is not the production environment, so the email was ${guard.mode === "redirected" ? "redirected to the test inbox" : `handled as "${guard.mode}"`} rather than delivered to ${to}.`);
  }
  if (sent.conversationId) {
    try {
      const all = await readAll();
      keys.forEach((k, i) => {
        const cur = all[k];
        if (cur && cur.token === tokens[i]) all[k] = { ...cur, sends: cur.sends.map((s) => (s.at === nowIso ? { ...s, conversationId: sent.conversationId } : s)) };
      });
      await writeAll(all);
    } catch {
      /* the conversation id is a nicety */
    }
  }
  // Whole check-ins (main link plus any second supervisor's), as the screens key them.
  const fresh = await getRatingRequestViews(people.map((p) => p.hireId)).catch(() => null);
  const requests = fresh ? fresh.requests.filter((r) => r.dayMark === checkin.dayMark) : drafts.map((d, i) => toView(d, people[i].name, "PENDING"));
  return { ok: true, requests, skipped, mode: guard.mode, warnings };
}

/** Cancel one record in memory. False when it was already finished. */
function cancelInPlace(all: RequestMap, key: string, actor: string | null, reason: RatingCancelReason, at: string): boolean {
  const cur = all[key];
  if (!cur || cur.completed || cur.cancelledAt) return false;
  all[key] = { ...cur, cancelledAt: at, cancelledBy: actor, cancelReason: reason, cancelDetail: null };
  return true;
}

/**
 * Cancel a person's open links for one check-in - every one, or only the one to
 * `to` (a two-supervisor check-in lists each link with its own Cancel). If the
 * other supervisor has already answered, cancelling the one who has not is how
 * HR closes the check-in with one rating: their answers are saved then.
 */
export async function cancelRatingRequest(
  hireId: string,
  dayMark: number,
  actor: string | null,
  reason: RatingCancelReason = "MANUAL",
  to: string | null = null
): Promise<RatingRequestView | null> {
  const all = await readAll();
  const at = new Date().toISOString();
  const keys = groupKeys(all, hireId, dayMark).filter((k) => !to || all[k].to.toLowerCase() === to.trim().toLowerCase());
  const changed = keys.filter((k) => cancelInPlace(all, k, actor, reason, at));
  if (!changed.length) return null;
  await writeAll(all);
  await maybeFinalizeGroup(hireId, dayMark);
  return groupView(hireId, dayMark);
}

/**
 * Bulk cancel (Aimee, Nov 25 2026, feedback cmwwilqem: "i also need to be able to
 * cancel sent incomplete requests in bulk"): every link not yet answered for the
 * ticked people at one check-in - waiting or expired - stops working, in one write.
 */
export async function cancelRatingRequestsBulk(
  hireIds: string[],
  dayMark: number,
  actor: string | null
): Promise<{ cancelled: number; people: number; requests: RatingRequestView[] }> {
  const all = await readAll();
  const at = new Date().toISOString();
  let cancelled = 0;
  const touched = new Set<string>();
  for (const id of new Set(hireIds)) {
    for (const k of groupKeys(all, id, dayMark)) {
      if (cancelInPlace(all, k, actor, "MANUAL", at)) {
        cancelled++;
        touched.add(id);
      }
    }
  }
  if (!cancelled) return { cancelled: 0, people: 0, requests: [] };
  await writeAll(all);
  for (const id of touched) await maybeFinalizeGroup(id, dayMark);
  const { requests } = await getRatingRequestViews([...touched]);
  return { cancelled, people: touched.size, requests: requests.filter((r) => r.dayMark === dayMark) };
}

/** Dismiss the "employee left" notice. The record stays, for the history. */
export async function acknowledgeRatingRequest(hireId: string, dayMark: number): Promise<void> {
  await updateOne(recKey(hireId, dayMark), (cur) => (cur && !cur.acknowledgedAt ? { ...cur, acknowledgedAt: new Date().toISOString() } : undefined));
}
