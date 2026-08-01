import { frontFetch } from "./client";
import { guardRecipients } from "./send-guard";

// Sending vs. drafting. Recipients are real new hires / candidates, so the exported
// default is *drafting* — a teammate reviews and hits send inside Front. A true
// auto-send exists (sendEmail) but is deliberately named to make its use a conscious
// choice, and callers should confirm intent before using it. See
// .claude/skills/front-api/SKILL.md ("the environment is live and shared").
//
// THERE IS A TEST INBOX NOW, and it is enforced here rather than left to callers:
// payload() below is the single point every draft and every send passes through, so
// guardRecipients() cannot be forgotten by a new caller. Outside production it
// redirects to FRONT_TEST_INBOX, or refuses if that is not set. In production it
// changes nothing.

export type EmailInput = {
  to: string | string[];
  subject: string;
  /** HTML body. */
  body: string;
  cc?: string[];
  bcc?: string[];
  /** Teammate id to attribute the message/draft to. */
  authorId?: string;
  /** Plain-text alternative. */
  text?: string;
  /**
   * Whether Front archives the conversation immediately on send. Front's own default
   * is to archive, which would hide sent onboarding mail from the hrotasks@ inbox the
   * team uses to track automated messages — so we default to keeping it open.
   */
  archive?: boolean;
};

/** What a send became in Front, so callers can record the thread against a hire. */
export type SentMessage = { id?: string; conversationId?: string };

function payload(input: EmailInput, extra: Record<string, unknown> = {}) {
  // Recipients and subject come from the guard, never straight from the caller —
  // in production it hands them back untouched, and everywhere else it redirects
  // to the test inbox or throws.
  const safe = guardRecipients({ to: input.to, cc: input.cc, bcc: input.bcc, subject: input.subject });
  return JSON.stringify({
    to: safe.to,
    subject: safe.subject,
    body: input.body,
    ...(input.text ? { text: input.text } : {}),
    ...(safe.cc ? { cc: safe.cc } : {}),
    ...(safe.bcc ? { bcc: safe.bcc } : {}),
    ...(input.authorId ? { author_id: input.authorId } : {}),
    ...extra,
  });
}

type Draft = { id: string; [k: string]: unknown };

/**
 * Create a draft of a NEW email from a channel. The safe default: nothing is sent
 * until a human approves it in Front. `mode: "shared"` so the whole HR team can see
 * and edit it, not just the author.
 */
export async function draftEmail(
  channelId: string,
  input: EmailInput
): Promise<Draft> {
  return frontFetch<Draft>(`/channels/${channelId}/drafts`, {
    method: "POST",
    body: payload(input, { mode: "shared" }),
  });
}

/** Create a draft REPLY onto an existing conversation (keeps the thread intact). */
export async function draftReply(
  conversationId: string,
  input: EmailInput
): Promise<Draft> {
  return frontFetch<Draft>(`/conversations/${conversationId}/drafts`, {
    method: "POST",
    body: payload(input, { mode: "shared" }),
  });
}

type SendResponse = {
  id?: string;
  _links?: { related?: { conversation?: string } };
};

function sendOptions(input: EmailInput) {
  return { options: { archive: input.archive ?? false } };
}

function toSent(res: SendResponse | undefined): SentMessage {
  // The conversation arrives as a URL; the id is its last segment.
  return {
    id: res?.id,
    conversationId: res?._links?.related?.conversation?.split("/").pop(),
  };
}

/**
 * Actually SEND a new email (no human review). This emails a real person the moment
 * it runs. Only use it for a flow the user has explicitly decided should auto-send.
 * Front answers 202 Accepted and delivers asynchronously, returning the ids of what
 * it created.
 */
export async function sendEmail(
  channelId: string,
  input: EmailInput
): Promise<SentMessage> {
  const res = await frontFetch<SendResponse>(`/channels/${channelId}/messages`, {
    method: "POST",
    body: payload(input, sendOptions(input)),
  });
  return toSent(res);
}

/** Send a REPLY into an existing conversation (no human review — same caveat). */
export async function sendReply(
  conversationId: string,
  input: EmailInput
): Promise<SentMessage> {
  const res = await frontFetch<SendResponse>(
    `/conversations/${conversationId}/messages`,
    { method: "POST", body: payload(input, sendOptions(input)) }
  );
  return toSent(res);
}
