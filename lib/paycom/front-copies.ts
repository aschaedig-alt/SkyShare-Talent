import { addTags, archiveConversation, getMessages, iterateConversations, resolveTagIds } from "@/lib/front";
import { bareSubject } from "@/lib/paycom/notices";

/**
 * Finding the Front copies of a Paycom email, so they can be tagged and archived once the
 * app has saved what the email was about.
 *
 * WHERE THE COPIES ARE. Paycom mails Aimee; the mail lands in her PRIVATE Front inbox,
 * which the company token cannot read (403 — see lib/paycom/notices.ts; a token with the
 * Private resources namespace is being arranged, untested as of 2026-11-06). He moves the
 * mention and interview emails into the shared HR Onboarding inbox by hand, and a Front
 * rule copies some Paycom mail there too. Those copies can be read, tagged and archived.
 *
 * HOW FAR BACK. To 2025-01-01, the start of the Paycom email log (his request,
 * 2026-11-06). Measured that day: the bare Paycom address term since 2025-01-01 returns
 * 2,347 conversations (oldest 2025-02-10), of which only 18 are mention threads (oldest
 * 2026-08-18) — most older mentions never reached a shared inbox at all.
 *
 * ONE LISTING PER PROCESS. Front's search cannot find a Paycom id inside a notice that
 * contains it, and quoted phrases find nothing (memory: front-search-dsl), so copies are
 * found by listing and comparing. The listing is cached for the life of the process, so a
 * backfill of hundreds of emails pays for it once; bodies are read only for the mention
 * threads, which are few.
 */

export const FRONT_SINCE = "2025-01-01";

type Indexed = { id: string; subject: string; bare: string; createdAt: number; status: string; tagNames: string[] };
let cache: { since: number; list: Indexed[] } | null = null;
const bodyCache = new Map<string, string>();

async function index(sinceIso: string = FRONT_SINCE): Promise<Indexed[]> {
  const since = Math.floor(Date.parse(`${sinceIso}T00:00:00Z`) / 1000);
  if (cache && cache.since <= since) return cache.list.filter((c) => c.createdAt >= since || c.createdAt === 0);
  const list: Indexed[] = [];
  for await (const c of iterateConversations(`systemmessage@paycomonline.com after:${since}`)) {
    const subject = c.subject ?? "";
    list.push({
      id: c.id,
      subject,
      bare: normal(subject),
      createdAt: Number((c as { created_at?: number }).created_at ?? 0),
      status: String(c.status ?? ""),
      tagNames: ((c.tags ?? []) as Array<{ name?: string }>).map((t) => (t.name ?? "").toLowerCase())
    });
  }
  cache = { since, list };
  return list;
}

/**
 * Only the mention threads: "mentioned" narrows the search to a few dozen (18 on 2026-11-06)
 * instead of every Paycom thread, which matters because the notes scan files one application
 * per process and would otherwise list ~2,300 threads each time.
 */
let mentionCache: { since: number; list: Indexed[] } | null = null;
async function mentionIndex(sinceIso: string): Promise<Indexed[]> {
  const since = Math.floor(Date.parse(`${sinceIso}T00:00:00Z`) / 1000);
  if (mentionCache && mentionCache.since <= since) return mentionCache.list;
  if (cache && cache.since <= since) return cache.list.filter((c) => /mentioned/i.test(c.subject));
  const list: Indexed[] = [];
  for await (const c of iterateConversations(`systemmessage@paycomonline.com mentioned after:${since}`)) {
    const subject = c.subject ?? "";
    list.push({
      id: c.id,
      subject,
      bare: normal(subject),
      createdAt: Number((c as { created_at?: number }).created_at ?? 0),
      status: String(c.status ?? ""),
      tagNames: ((c.tags ?? []) as Array<{ name?: string }>).map((t) => (t.name ?? "").toLowerCase())
    });
  }
  mentionCache = { since, list };
  return list;
}

const normal = (s: string) =>
  bareSubject(s.replace(/&amp;/g, "&"))
    .replace(/^\s*\[external\]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

async function bodyOf(conversationId: string): Promise<string> {
  const hit = bodyCache.get(conversationId);
  if (hit !== undefined) return hit;
  const messages = await getMessages(conversationId);
  const text = messages
    .map((m) => `${m.text ?? ""} ${(m.body ?? "").replace(/<[^>]+>/g, " ")}`)
    .join(" ")
    .replace(/\s+/g, " ");
  bodyCache.set(conversationId, text);
  return text;
}

/** The mention threads naming this application ("Application: Jane Doe (401234)") or candidate. */
export async function findMentionCopies(paycomId: string, kind: "application" | "candidate", sinceIso = FRONT_SINCE): Promise<Indexed[]> {
  const label = kind === "candidate" ? "Candidate" : "Application";
  // String.raw keeps the backslashes — a plain template literal turns "\(" into "(".
  const needle = new RegExp(String.raw`${label}:\s*[^(<]*\(${paycomId}\)`);
  const out: Indexed[] = [];
  for (const c of await mentionIndex(sinceIso)) {
    if (!/mentioned/i.test(c.subject)) continue;
    if (needle.test(await bodyOf(c.id))) out.push(c);
  }
  return out;
}

/**
 * The threads holding one Paycom email, by its subject and the minute it was sent. An invite
 * subject names the candidate and the role, so subject + time within an hour is one email.
 */
export async function findCopiesBySubject(subject: string, sentAt: string, sinceIso = FRONT_SINCE): Promise<Indexed[]> {
  const want = normal(subject);
  const at = Date.parse(sentAt) / 1000;
  return (await index(sinceIso)).filter((c) => c.bare === want && (!c.createdAt || Math.abs(c.createdAt - at) <= 3600));
}

export type CopyResult = { tagged: string[]; alreadyTagged: string[]; archived: string[]; missingTags: string[] };

/**
 * Tag the threads, then archive them. Call ONLY after the app has saved the note or interview
 * — an archived thread is out of sight, so archiving before the save can hide one that failed.
 * Archiving is a status change, never a delete; the thread stays searchable and reopens.
 */
export async function tagAndArchive(copies: Indexed[], tagNames: string[], opts: { archive: boolean }): Promise<CopyResult> {
  const { ids, missing } = await resolveTagIds(tagNames);
  const out: CopyResult = { tagged: [], alreadyTagged: [], archived: [], missingTags: missing };
  const want = tagNames.map((t) => t.toLowerCase()).filter((t) => !missing.map((m) => m.toLowerCase()).includes(t));
  for (const c of copies) {
    if (want.every((t) => c.tagNames.includes(t))) out.alreadyTagged.push(c.id);
    else if (ids.length) {
      await addTags(c.id, ids);
      c.tagNames.push(...want);
      out.tagged.push(c.id);
    }
    if (opts.archive && c.status !== "archived") {
      await archiveConversation(c.id);
      c.status = "archived";
      out.archived.push(c.id);
    }
  }
  return out;
}
