import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getOrientationChannelId } from "@/lib/front/config";
import { sendEmail } from "@/lib/front/messages";
import { guardDecision } from "@/lib/front/send-guard";
import { cleanEditedBody } from "@/lib/front/sanitize-body";
import {
  SIGNOFF_DEPARTMENTS,
  SIGNOFF_LINK_DAYS,
  SIGNOFF_LINK_PATH,
  defaultSignoffBodyHtml,
  defaultSignoffSubject,
  looksLikeEmail,
  signoffGreetingHtml,
  signoffLinkBlockHtml,
  type SignoffAnswers,
  type SignoffRequestState,
  type SignoffRequestView
} from "@/lib/quality-of-hire/signoff-questions";

// The definitions sign-off, in Journey (his ask, Nov 21 2026: "could it be an
// internal form like the manager 3, 6, 12 month reviews instead?"). The same shape
// as the check-in rating link (lib/onboarding/checkin-rating-request.ts): HR emails
// one person a tokenized no-login link (/signoff/<token>) that opens ONE form, for
// the departments HR ticked, and accepts ONE submission.
//
// STORAGE: one WorkspaceSetting blob keyed by request id, like every send record in
// lib/front - no schema change against the shared live database. The answers live
// on the request they came in on. A dozen or two requests, so the blob stays small.

const SCOPE = "quality-of-hire";
const KEY = "signoff-requests";
const DAY_MS = 86_400_000;
const CC = ["hrotasks@skyshare.com"];

type StoredSend = { at: string; to: string; toName: string | null; by: string | null; mode: string; edited: boolean; conversationId?: string | null };
type StoredRequest = {
  id: string;
  token: string;
  to: string;
  toName: string | null;
  departments: string[];
  firstSentAt: string;
  lastSentAt: string;
  expiresAt: string;
  sends: StoredSend[];
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  answers: SignoffAnswers | null;
};
type RequestMap = Record<string, StoredRequest>;

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

/** Read-modify-write one record against a fresh read. Sends and submissions are one-at-a-time human actions. */
async function updateOne(id: string, change: (cur: StoredRequest | undefined) => StoredRequest | null | undefined): Promise<void> {
  const all = await readAll();
  const next = change(all[id]);
  if (next === undefined) return;
  if (next === null) delete all[id];
  else all[id] = next;
  await writeAll(all);
}

const newToken = () => randomBytes(12).toString("base64url");
const newId = () => `so_${randomBytes(6).toString("hex")}`;
function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function stateOf(r: StoredRequest, now = Date.now()): SignoffRequestState {
  if (r.completedAt) return "COMPLETED";
  if (r.cancelledAt) return "CANCELLED";
  if (new Date(r.expiresAt).getTime() < now) return "EXPIRED";
  return "PENDING";
}

function toView(r: StoredRequest): SignoffRequestView {
  return {
    id: r.id,
    to: r.to,
    toName: r.toName,
    departments: r.departments,
    state: stateOf(r),
    firstSentAt: r.firstSentAt,
    lastSentAt: r.lastSentAt,
    expiresAt: r.expiresAt,
    sendCount: r.sends.length,
    completedAt: r.completedAt,
    cancelledAt: r.cancelledAt,
    answers: r.answers
  };
}

/** Every request, newest first - Reports > Sign-off (admins only). */
export async function listSignoffRequests(): Promise<SignoffRequestView[]> {
  const all = await readAll();
  return Object.values(all)
    .map(toView)
    .sort((a, b) => (a.lastSentAt < b.lastSentAt ? 1 : -1));
}

/** The absolute origin the link is built on; localhost is refused for a real send (same rule as the check-in link). */
function resolveOrigin(realSend: boolean): string {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base = process.env.NEXTAUTH_URL ?? (productionHost ? `https://${productionHost}` : "https://skyshare-journey.vercel.app");
  if (realSend && /localhost|127\.0\.0\.1|\[::1\]/i.test(base)) {
    throw new Error("This machine resolves the site to localhost, so the link would only open here. Send it from the deployed site instead.");
  }
  return base.replace(/\/+$/, "");
}

export type SendSignoffInput = {
  /** Resend an existing request (same link while it is open); null = a new one. */
  id: string | null;
  to: string;
  toName: string | null;
  departments: string[];
  subject: string | null;
  /** Null = the app's default wording, untouched. */
  bodyHtml: string | null;
  actor: string | null;
};
export type SendSignoffResult = { ok: true; request: SignoffRequestView; warnings: string[] } | { ok: false; error: string };

export async function sendSignoffRequest(input: SendSignoffInput): Promise<SendSignoffResult> {
  const to = input.to.trim();
  if (!looksLikeEmail(to)) return { ok: false, error: "Enter the manager's email address." };
  const toName = input.toName?.replace(/\s+/g, " ").trim().slice(0, 80) || null;
  const departments = [...new Set(input.departments.filter((d) => SIGNOFF_DEPARTMENTS.includes(d)))];
  if (!departments.length) return { ok: false, error: "Tick the department(s) this person signs off for." };

  const prev = input.id ? (await readAll())[input.id] : undefined;
  if (input.id && !prev) return { ok: false, error: "That request no longer exists." };
  if (prev) {
    const s = stateOf(prev);
    if (s === "COMPLETED") return { ok: false, error: `${prev.toName ?? prev.to} has already signed off.` };
    if (s === "CANCELLED") return { ok: false, error: "That request was cancelled. Send a new one instead." };
  }

  const nowIso = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SIGNOFF_LINK_DAYS * DAY_MS).toISOString();
  const token = prev ? prev.token : newToken();
  const id = prev ? prev.id : newId();
  const subject = input.subject?.replace(/\s+/g, " ").trim().slice(0, 200) || defaultSignoffSubject();
  const edited = Boolean(input.bodyHtml && input.bodyHtml.trim());
  const body = edited ? cleanEditedBody(input.bodyHtml as string) : defaultSignoffBodyHtml(departments);

  const guard = guardDecision({ to: [to], cc: CC, subject });
  let channelId: string;
  let html: string;
  try {
    const url = `${resolveOrigin(guard.mode === "production")}${SIGNOFF_LINK_PATH}/${token}`;
    html = signoffGreetingHtml(toName) + body + signoffLinkBlockHtml(url, expiresAt);
    channelId = await getOrientationChannelId();
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Could not build the email." };
  }

  // The link has to work BEFORE the email lands, so the record is written first; a
  // failed send puts the previous record back exactly as it was.
  const draft: StoredRequest = {
    id,
    token,
    to,
    toName,
    departments,
    firstSentAt: prev ? prev.firstSentAt : nowIso,
    lastSentAt: nowIso,
    expiresAt,
    sends: [...(prev?.sends ?? []), { at: nowIso, to, toName, by: input.actor, mode: guard.mode, edited }],
    completedAt: null,
    cancelledAt: null,
    cancelledBy: null,
    answers: null
  };
  try {
    await updateOne(id, () => draft);
  } catch {
    return { ok: false, error: "Could not save the request, so nothing was sent." };
  }

  let conversationId: string | null = null;
  try {
    const sent = await sendEmail(channelId, { to: [to], cc: CC, subject, body: html, archive: false });
    conversationId = sent.conversationId ?? null;
  } catch (err) {
    await updateOne(id, () => prev ?? null).catch(() => {});
    return { ok: false, error: err instanceof Error ? err.message : "Send failed." };
  }

  const warnings: string[] = [];
  if (guard.mode !== "production") {
    warnings.push(
      `This is not the production environment, so the email was ${guard.mode === "redirected" ? "redirected to the test inbox" : `handled as "${guard.mode}"`} rather than delivered to ${to}.`
    );
  }
  if (conversationId) {
    await updateOne(id, (cur) => {
      if (!cur || cur.token !== token) return undefined;
      const sends = [...cur.sends];
      const last = sends[sends.length - 1];
      if (last && last.at === nowIso) sends[sends.length - 1] = { ...last, conversationId };
      return { ...cur, sends };
    }).catch(() => warnings.push("Sent, but the Front conversation link was not recorded."));
  }
  const saved = (await readAll())[id];
  return { ok: true, request: toView(saved ?? draft), warnings };
}

export async function cancelSignoffRequest(id: string, actor: string | null): Promise<SignoffRequestView | null> {
  const cur = (await readAll())[id];
  if (!cur || stateOf(cur) === "COMPLETED" || cur.cancelledAt) return null;
  const next = { ...cur, cancelledAt: new Date().toISOString(), cancelledBy: actor };
  await updateOne(id, () => next);
  return toView(next);
}

// ---------------------------------------------------------------------------
// The public side: /signoff/<token>.

export type SignoffLinkLookup =
  | { found: false }
  | { found: true; id: string; state: SignoffRequestState; toName: string | null; departments: string[]; expiresAt: string };

export async function lookupSignoffLink(token: string | undefined | null): Promise<SignoffLinkLookup> {
  if (!token || token.length < 10 || token.length > 64) return { found: false };
  const all = await readAll();
  const rec = Object.values(all).find((r) => sameToken(r.token, token));
  if (!rec) return { found: false };
  return { found: true, id: rec.id, state: stateOf(rec), toName: rec.toName, departments: rec.departments, expiresAt: rec.expiresAt };
}

/** Save the manager's answers on their request. Only while it is open; one submission. */
export async function completeSignoff(token: string, answers: SignoffAnswers): Promise<{ ok: true } | { ok: false; error: string }> {
  const all = await readAll();
  const rec = Object.values(all).find((r) => sameToken(r.token, token));
  if (!rec) return { ok: false, error: "This link isn't valid." };
  if (stateOf(rec) !== "PENDING") return { ok: false, error: "This link is no longer open." };
  await updateOne(rec.id, (cur) => (cur && cur.token === token && stateOf(cur) === "PENDING" ? { ...cur, completedAt: new Date().toISOString(), answers } : undefined));
  return { ok: true };
}
