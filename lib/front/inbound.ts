import { frontFetch, frontFetchBinary, paginate } from "./client";

// Read side of the pipeline: pull conversations + their messages so downstream code
// (orientation replies, travel confirmations, sourcing, Paycom) can process them.
// Processing marks a thread with a tag/comment so it isn't handled twice — never a
// delete. Pull-based today; an event-driven version would be a Front rule -> webhook
// plus the Application-triggers scope, which the token already carries.

export type FrontConversation = {
  id: string;
  subject?: string;
  status?: string;
  [k: string]: unknown;
};

export type FrontMessage = {
  id: string;
  is_inbound?: boolean;
  subject?: string;
  body?: string;
  text?: string;
  author?: { email?: string };
  recipients?: Array<{ handle: string; role: string }>;
  attachments?: Array<{ id: string; filename: string; url: string; size: number }>;
  [k: string]: unknown;
};

/** Iterate conversations, optionally narrowed by Front's search DSL (e.g.
 *  `inbox:HR tag:travel`). Follows pagination to the end. */
export function iterateConversations(
  query?: string
): AsyncGenerator<FrontConversation> {
  const start = query
    ? `/conversations/search/${encodeURIComponent(query)}`
    : "/conversations";
  return paginate<FrontConversation>(start);
}

/** All messages in a thread (bodies live here, not on the conversation). */
export async function getMessages(
  conversationId: string
): Promise<FrontMessage[]> {
  const results: FrontMessage[] = [];
  for await (const m of paginate<FrontMessage>(
    `/conversations/${conversationId}/messages`
  )) {
    results.push(m);
  }
  return results;
}

/** Tag a thread as processed/routed so it isn't picked up again. */
export async function addTags(
  conversationId: string,
  tagIds: string[]
): Promise<void> {
  if (tagIds.length === 0) return;
  await frontFetch(`/conversations/${conversationId}/tags`, {
    method: "POST",
    body: JSON.stringify({ tag_ids: tagIds }),
  });
}

export type FrontTag = { id: string; name: string };

/**
 * Every tag in the account. Cached for the life of the process — tags are
 * created by hand and effectively never change, and this is called once per
 * message otherwise.
 */
let tagCache: FrontTag[] | null = null;

export async function listTags(force = false): Promise<FrontTag[]> {
  if (tagCache && !force) return tagCache;
  const page = (await frontFetch("/tags")) as { _results?: FrontTag[] };
  tagCache = (page._results ?? []).map((t) => ({ id: t.id, name: t.name }));
  return tagCache;
}

/**
 * Turn tag NAMES into ids.
 *
 * Name-based on purpose: it means someone can create a tag in Front and have the
 * automation start using it without anyone copying an opaque id into the code.
 * Matching is case-insensitive and trims, because a tag typed by hand rarely
 * matches a string literal exactly.
 *
 * Names with no matching tag come back in `missing` rather than throwing — a tag
 * that has not been created yet must never cost us the checklist update, which is
 * the part that actually matters.
 */
export async function resolveTagIds(names: string[]): Promise<{ ids: string[]; missing: string[] }> {
  const tags = await listTags();
  const byName = new Map(tags.map((t) => [t.name.trim().toLowerCase(), t.id]));
  const ids: string[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const id = byName.get(name.trim().toLowerCase());
    if (id) ids.push(id);
    else missing.push(name);
  }
  return { ids, missing };
}

/** Leave an internal note on a thread (audit trail of what the automation did). */
export async function addComment(
  conversationId: string,
  body: string,
  authorId?: string
): Promise<void> {
  await frontFetch(`/conversations/${conversationId}/comments`, {
    method: "POST",
    body: JSON.stringify({ body, ...(authorId ? { author_id: authorId } : {}) }),
  });
}

/** Download an inbound attachment's bytes (needs the Attachments-Read scope). */
export function downloadAttachment(url: string): Promise<ArrayBuffer> {
  return frontFetchBinary(url);
}
