import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrientationChannelId } from "@/lib/front/config";
import { sendEmail, type SentMessage } from "@/lib/front/messages";
import { guardDecision } from "@/lib/front/send-guard";
import { cleanEditedBody } from "@/lib/front/sanitize-body";
import { resolveSupervisors } from "@/lib/front/orientation-email";
import { RATED_DAY_MARKS, RATED_TASK_KEYS, ratedCheckin, type RatedCheckin } from "@/lib/onboarding/checkin-rating";
import {
  RATING_LINK_DAYS,
  RATING_LINK_PATH,
  defaultRatingBodyHtml,
  defaultRatingSubject,
  looksLikeEmail,
  ratingGreetingHtml,
  ratingLinkBlockHtml,
  type RatingCancelReason,
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

type StoredRequest = Omit<RatingRequestView, "hireName" | "state" | "dayMark"> & {
  token: string;
  /** Absent on records made before the 6- and 12-month check-ins: those are 90-day. */
  dayMark?: number;
  /** Set by a submission through the link. */
  completed?: boolean;
};

type RequestMap = Record<string, StoredRequest>;

/** Where a person's request for one check-in lives in the map. */
export function recKey(hireId: string, dayMark: number): string {
  return dayMark === 90 ? hireId : `${hireId}@${dayMark}`;
}
const markOf = (rec: StoredRequest) => rec.dayMark ?? 90;

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
    acknowledgedAt: rec.acknowledgedAt ?? null
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
    prisma.hireCheckinRating.findMany({ where: { newHireId: { in: ids }, dayMark: { in: RATED_DAY_MARKS } }, select: { newHireId: true, dayMark: true, updatedAt: true } })
  ]);
  const byId = new Map(hires.map((h) => [h.id, h as HireNow]));
  // Rated in the app AFTER the request went out - an older rating is what the
  // request was sent to replace or confirm, so it must not close the link.
  const rated = new Set<string>();
  for (const r of ratings) {
    const k = recKey(r.newHireId, r.dayMark);
    if (all[k] && r.updatedAt.getTime() > new Date(all[k].firstSentAt).getTime()) rated.add(k);
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
  const requests: RatingRequestView[] = [];
  const leftNotices: RatingRequestView[] = [];
  for (const [k, rec] of Object.entries(all)) {
    const name = hires.get(rec.hireId)?.name ?? "A former employee";
    const view = toView(rec, name, stateOf(rec, rated.has(k)));
    if (wanted.has(rec.hireId)) requests.push(view);
    if (view.state === "CANCELLED" && view.cancelReason === "LEFT" && !view.acknowledgedAt) leftNotices.push(view);
  }
  return { requests, leftNotices };
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

/** Mark the link used. Called only after the rating saved. */
export async function completeRatingLink(hireId: string, dayMark: number, token: string, typedName: string | null): Promise<void> {
  await updateOne(recKey(hireId, dayMark), (cur) =>
    cur && sameToken(cur.token, token) ? { ...cur, completed: true, completedAt: new Date().toISOString(), completedByName: typedName } : undefined
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
  actor: string | null;
};

export type SendRatingRequestResult =
  | { ok: true; request: RatingRequestView; mode: string; warnings: string[] }
  | { ok: false; error: string };

export async function sendRatingRequest(input: SendRatingRequestInput): Promise<SendRatingRequestResult> {
  const checkin = ratedCheckin(input.dayMark);
  if (!checkin) return { ok: false, error: "Which check-in? (90-day, 6-month or 12-month)" };
  const to = input.to.trim();
  if (!looksLikeEmail(to)) return { ok: false, error: "Enter the manager's email address." };
  const toName = input.toName?.replace(/\s+/g, " ").trim().slice(0, 80) || null;

  const hire = await prisma.newHire.findUnique({ where: { id: input.hireId }, select: HIRE_SELECT });
  if (!hire) return { ok: false, error: "Employee not found." };
  const gone = leftReason(hire as HireNow, checkin);
  if (gone) return { ok: false, error: `${hire.name} has left (${gone.toLowerCase()}), so there is no ${checkin.short} rating to ask for.` };

  const key = recKey(hire.id, checkin.dayMark);
  // The hire was checked just above, so there is nothing for settle() to cancel here.
  const prev = (await readAll())[key];
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
    acknowledgedAt: null
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
  return { ok: true, request: toView(draft, hire.name, "PENDING"), mode: guard.mode, warnings };
}

export async function cancelRatingRequest(hireId: string, dayMark: number, actor: string | null, reason: RatingCancelReason = "MANUAL"): Promise<RatingRequestView | null> {
  const box: { rec?: StoredRequest } = {};
  await updateOne(recKey(hireId, dayMark), (cur) => {
    if (!cur || cur.completed || cur.cancelledAt) return undefined;
    box.rec = { ...cur, cancelledAt: new Date().toISOString(), cancelledBy: actor, cancelReason: reason, cancelDetail: null };
    return box.rec;
  });
  if (!box.rec) return null;
  const hire = await prisma.newHire.findUnique({ where: { id: hireId }, select: { name: true } });
  return toView(box.rec, hire?.name ?? "", "CANCELLED");
}

/** Dismiss the "employee left" notice. The record stays, for the history. */
export async function acknowledgeRatingRequest(hireId: string, dayMark: number): Promise<void> {
  await updateOne(recKey(hireId, dayMark), (cur) => (cur && !cur.acknowledgedAt ? { ...cur, acknowledgedAt: new Date().toISOString() } : undefined));
}
