import { prisma } from "@/lib/prisma";
import type { ApiRouteUser } from "@/lib/auth/route-auth";
import { getMessages, iterateConversations, resolveTagIdByNames, addTags, type FrontMessage } from "@/lib/front/inbound";
import { frontConversationUrl } from "@/lib/front/links";
import { JOURNEY_TAGS } from "@/lib/front/tags";
import { getTaskSendMap } from "@/lib/front/task-email";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { triageReply } from "./checkin-reply-triage";
import {
  cleanReplyText,
  effectiveLevel,
  isCheckinSubject,
  isReplyLevel,
  needsFollowUp,
  type CheckinReply,
  type CheckinReplyView,
  type ReplyLevel
} from "./checkin-reply";

// The check-in reply sweep and its store. See checkin-reply.ts for what was asked.
//
// HOW A REPLY IS FOUND. Every check-in send records the Front conversation it
// started (lib/front/task-email.ts), so the sweep reads THAT thread for inbound
// messages after the send. That is why it does not match on the subject: all 23 of
// the Nov 11 emails share "Just checking in", and a subject match cannot say whose
// reply it is. The fallback is for somebody who writes a fresh email instead of
// replying: a search for mail FROM that person's own addresses since the send,
// kept only when the thread's subject reads like a check-in.
//
// STORE. One WorkspaceSetting blob keyed by Front message id - the same
// no-migration trade the send and skip records made against the shared live
// database. The message id is what makes a re-run file nothing twice. Undo is
// deleting the blob (or one key); nothing else is written in the app.

const SCOPE = "front";
const KEY = "task-email-replies";
/** Sends older than this are no longer swept - nobody answers a check-in two months on. */
const SWEEP_DAYS = 60;
/** Per fallback search, so one chatty sender cannot eat the run. */
const SEARCH_CAP = 10;

type ReplyMap = Record<string, CheckinReply>;

/** HR only, in and out (his answer, 2026-11-11). The local-dev bypass has no viewer
 *  at all; there it counts as HR so the screens work. */
export function isHrCaller(user: ApiRouteUser): boolean {
  return user.authMode === "local-bypass" || Boolean(user.viewer?.isHr);
}

async function readAll(): Promise<ReplyMap> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return (parsed && typeof parsed === "object" ? parsed : {}) as ReplyMap;
  } catch {
    return {};
  }
}

async function writeAll(all: ReplyMap): Promise<void> {
  const value = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value }
  });
}

async function toViews(list: CheckinReply[]): Promise<CheckinReplyView[]> {
  const ids = [...new Set(list.map((r) => r.hireId))];
  const hires = ids.length ? await prisma.newHire.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(hires.map((h) => [h.id, h.name]));
  return list
    .map((r) => ({ ...r, level: effectiveLevel(r), hireName: names.get(r.hireId) ?? null, frontUrl: frontConversationUrl(r.conversationId) }))
    .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

/** Replies for these people (the Post-onboard grid). */
export async function getRepliesForHires(hireIds: string[]): Promise<CheckinReplyView[]> {
  const want = new Set(hireIds);
  return toViews(Object.values(await readAll()).filter((r) => want.has(r.hireId)));
}

/** Needs action / talk to HR, not yet handled (the dashboard worklist). */
export async function getOpenReplies(): Promise<CheckinReplyView[]> {
  return toViews(Object.values(await readAll()).filter((r) => needsFollowUp(effectiveLevel(r)) && !r.handledAt));
}

/** HR's call on one reply: handled or not, and optionally a different level. */
export async function updateReply(
  messageId: string,
  change: { handled?: boolean; note?: string | null; level?: ReplyLevel | null },
  by: string | null
): Promise<CheckinReplyView | null> {
  // Re-read right before the write so a sweep that filed something a moment ago is kept.
  const all = await readAll();
  const r = all[messageId];
  if (!r) return null;
  if (change.handled === true) {
    r.handledAt = new Date().toISOString();
    r.handledBy = by;
    if (change.note !== undefined) r.handledNote = change.note;
  } else if (change.handled === false) {
    r.handledAt = null;
    r.handledBy = null;
    r.handledNote = null;
  }
  if (change.level !== undefined) {
    if (change.level === null || change.level === r.triage.level) {
      r.levelOverride = null;
      r.overrideBy = null;
    } else if (isReplyLevel(change.level)) {
      r.levelOverride = change.level;
      r.overrideBy = by;
    }
  }
  all[messageId] = r;
  await writeAll(all);
  return (await toViews([r]))[0];
}

// ---------------------------------------------------------------------------
// The sweep

function sender(m: FrontMessage): { email: string | null; name: string | null } {
  const from = (m.recipients ?? []).find((x) => x.role === "from") as { handle?: string; name?: string | null } | undefined;
  return { email: from?.handle?.trim().toLowerCase() || m.author?.email?.toLowerCase() || null, name: from?.name?.trim() || null };
}

function createdAt(m: FrontMessage): number {
  const v = (m as { created_at?: number }).created_at;
  return typeof v === "number" ? v * 1000 : 0;
}

export type ReplyScanItem = {
  hireName: string;
  taskKey: string;
  messageId: string;
  conversationId: string;
  foundBy: "thread" | "search";
  receivedAt: string;
  fromEmail: string | null;
  fromSomeoneElse: boolean;
  level: ReplyLevel;
  category: string;
  summary: string;
  suggestedStep: string | null;
  textPreview: string;
};

export type ReplyScanReport = {
  apply: boolean;
  sendsChecked: number;
  threadsRead: number;
  searchesRun: number;
  alreadyFiled: number;
  found: ReplyScanItem[];
  errors: string[];
};

/**
 * Sweep every recent check-in send for replies.
 *
 * apply:false reads Front and runs the triage but writes nothing - not the blob,
 * not a Front tag - and returns what it would file. apply:true files the new ones
 * and tags their threads "[automated]".
 */
export async function scanCheckinReplies(opts: { apply: boolean }): Promise<ReplyScanReport> {
  const report: ReplyScanReport = { apply: opts.apply, sendsChecked: 0, threadsRead: 0, searchesRun: 0, alreadyFiled: 0, found: [], errors: [] };
  const sends = await getTaskSendMap();
  const filed = await readAll();
  const filedIds = new Set(Object.keys(filed));
  const cutoff = Date.now() - SWEEP_DAYS * 86_400_000;

  const recent = Object.entries(sends)
    .map(([composite, rec]) => {
      const at = composite.indexOf(":");
      return { hireId: composite.slice(0, at), taskKey: composite.slice(at + 1), rec };
    })
    .filter(
      (s) =>
        s.taskKey.startsWith("checkin_") &&
        s.rec?.conversationId &&
        // A redirected test send went to the test inbox, so a reply on it is not the person's.
        (s.rec.mode ?? "production") === "production" &&
        new Date(s.rec.sentAt).getTime() >= cutoff
    );
  report.sendsChecked = recent.length;
  if (!recent.length) return report;

  const hires = await prisma.newHire.findMany({
    where: { id: { in: [...new Set(recent.map((s) => s.hireId))] } },
    select: { id: true, name: true, position: true, personalEmail: true, ssEmail: true }
  });
  const hireById = new Map(hires.map((h) => [h.id, h]));
  const fresh: CheckinReply[] = [];

  for (const s of recent) {
    const hire = hireById.get(s.hireId);
    if (!hire) continue;
    const own = new Set([hire.personalEmail, hire.ssEmail].filter((e): e is string => Boolean(e)).map((e) => e.trim().toLowerCase()));
    const sentMs = new Date(s.rec.sentAt).getTime();
    const candidates: Array<{ m: FrontMessage; conversationId: string; foundBy: "thread" | "search" }> = [];

    try {
      report.threadsRead++;
      for (const m of await getMessages(s.rec.conversationId as string)) {
        if (m.is_inbound && createdAt(m) > sentMs) candidates.push({ m, conversationId: s.rec.conversationId as string, foundBy: "thread" });
      }
    } catch (e) {
      report.errors.push(`${hire.name}: could not read the thread (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }

    // Fallback: only when the thread itself has nothing, so a normal reply costs no search.
    const alreadyHas = Object.values(filed).some((r) => r.hireId === s.hireId && r.taskKey === s.taskKey);
    if (!candidates.length && !alreadyHas && own.size) {
      const q = `${[...own].map((e) => `from:${e}`).join(" OR ")} after:${Math.floor(sentMs / 1000)}`;
      try {
        report.searchesRun++;
        let n = 0;
        for await (const conv of iterateConversations(q)) {
          if (++n > SEARCH_CAP) break;
          if (conv.id === s.rec.conversationId || !isCheckinSubject(conv.subject)) continue;
          for (const m of await getMessages(conv.id)) {
            const who = sender(m).email;
            if (m.is_inbound && createdAt(m) > sentMs && who && own.has(who)) candidates.push({ m, conversationId: conv.id, foundBy: "search" });
          }
        }
      } catch (e) {
        report.errors.push(`${hire.name}: fallback search failed (${e instanceof Error ? e.message : String(e)})`);
      }
    }

    for (const c of candidates) {
      if (filedIds.has(c.m.id)) {
        report.alreadyFiled++;
        continue;
      }
      filedIds.add(c.m.id);
      const text = cleanReplyText(c.m.text);
      const from = sender(c.m);
      const triage = await triageReply({ text, firstName: splitCandidateName(hire.name).firstName, position: hire.position });
      const reply: CheckinReply = {
        messageId: c.m.id,
        conversationId: c.conversationId,
        hireId: hire.id,
        taskKey: s.taskKey,
        receivedAt: new Date(createdAt(c.m)).toISOString(),
        fromEmail: from.email,
        fromName: from.name,
        fromSomeoneElse: Boolean(from.email && !own.has(from.email)),
        foundBy: c.foundBy,
        subject: c.m.subject ?? null,
        text,
        triage,
        filedAt: new Date().toISOString()
      };
      fresh.push(reply);
      report.found.push({
        hireName: hire.name,
        taskKey: s.taskKey,
        messageId: reply.messageId,
        conversationId: reply.conversationId,
        foundBy: reply.foundBy,
        receivedAt: reply.receivedAt,
        fromEmail: reply.fromEmail,
        fromSomeoneElse: reply.fromSomeoneElse,
        level: triage.level,
        category: triage.category,
        summary: triage.summary,
        suggestedStep: triage.suggestedStep,
        textPreview: text.slice(0, 160)
      });
    }
  }

  if (opts.apply && fresh.length) {
    // Re-read so anything HR marked handled during this run is not overwritten.
    const latest = await readAll();
    for (const r of fresh) if (!latest[r.messageId]) latest[r.messageId] = r;
    await writeAll(latest);
    try {
      const tagId = await resolveTagIdByNames([JOURNEY_TAGS.automated]);
      if (tagId) for (const conv of new Set(fresh.map((r) => r.conversationId))) await addTags(conv, [tagId]);
    } catch (e) {
      // The reply is filed; a missing tag only costs the "a robot touched this" marker.
      report.errors.push(`tagging failed (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return report;
}
