import { prisma } from "@/lib/prisma";
import { getMessages, addComment } from "@/lib/front";
import { sanitizeRichText, richTextToPlain } from "@/lib/richtext/sanitize";
import { stripReplyQuote } from "@/lib/notifications/mentions";

/**
 * Turn a reply to a mention-notification email into a candidate note.
 *
 * "You can reply to this email with any feedback you have and it will be
 * added to their profile" — the promise made in the email itself. Routing is
 * by Front conversation id: notifyMentions records one MentionNotification
 * row per email it sends, so a reply on that exact thread is traceable back
 * to the candidate (and the write-up) it was about, with no guessing.
 *
 * The candidate record is live and shared, and a reply is arbitrary
 * human-written text run through automated quote-stripping — so the note is
 * clearly SOURCED ("Front reply") rather than indistinguishable from one typed
 * directly on the profile, and an empty result after stripping (someone
 * replied with nothing new, just the quote) writes nothing at all.
 */
export type MentionReplyResult =
  | { outcome: "noted"; noteId: string; candidateName: string }
  | { outcome: "no-new-content" }
  | { outcome: "not-a-reply" };

export async function processMentionReply(conversationId: string): Promise<MentionReplyResult | null> {
  const tracked = await prisma.mentionNotification.findUnique({
    where: { conversationId },
    select: {
      candidateId: true,
      recipientEmail: true,
      candidate: { select: { displayName: true } }
    }
  });
  if (!tracked) return null;

  const messages = await getMessages(conversationId);
  // One message means nobody has replied yet — this webhook call is about the
  // notification being SENT, not a reply arriving. Nothing to do.
  if (messages.length < 2) return { outcome: "not-a-reply" };

  // Front returns messages NEWEST-FIRST (confirmed against real production
  // data from conversation cnv_1hmu0uhm) — index 0 is the reply, not the tail.
  const latest = messages[0] as unknown as {
    body?: string;
    text?: string;
    author?: { email?: string };
    recipients?: Array<{ role?: string; handle?: string }>;
  };
  const rawHtml = latest.body ?? latest.text ?? "";
  const stripped = stripReplyQuote(rawHtml);
  const sanitized = sanitizeRichText(stripped);
  const plain = richTextToPlain(sanitized);
  if (plain.trim().length < 1) return { outcome: "no-new-content" };

  const senderEmail =
    latest.author?.email ?? latest.recipients?.find((r) => r.role === "from")?.handle ?? null;
  const author = senderEmail
    ? await prisma.user.findUnique({ where: { email: senderEmail.toLowerCase() }, select: { id: true } })
    : null;

  const note = await prisma.candidateNote.create({
    data: {
      candidateId: tracked.candidateId,
      body: plain.slice(0, 20000),
      bodyHtml: sanitized.slice(0, 60000),
      source: "Front reply",
      sourceRef: conversationId,
      authorId: author?.id ?? null
    }
  });

  // Courtesy confirmation on the thread — never blocks or fails the note.
  try {
    await addComment(conversationId, `SkyShare Talent-Ops added this reply to ${tracked.candidate.displayName}'s profile.`);
  } catch {
    /* the note is already saved; a failed comment is not worth retrying */
  }

  return { outcome: "noted", noteId: note.id, candidateName: tracked.candidate.displayName };
}
