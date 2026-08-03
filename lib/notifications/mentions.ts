import { prisma } from "@/lib/prisma";
import { getChannelId } from "@/lib/front/config";
import { sendEmail } from "@/lib/front/messages";

/**
 * Email a teammate that they were @-mentioned on a candidate, and remember
 * the thread so a REPLY to it can be routed back onto that candidate's notes.
 *
 * INTERNAL ONLY, and that is what makes auto-send acceptable here. The
 * draft-first default in lib/front/messages.ts exists because a candidate or
 * new hire is a real person with no test inbox — this never reaches one. Every
 * recipient is a mentioned teammate's own @skyshare.com address, the same
 * shape of internal traffic as the nightly hrotasks@ digest, which already
 * sends directly.
 *
 * Sent from hrotasks@ (the existing automation mailbox) rather than the
 * mentioning person's own address, so a reply-all does not surprise them by
 * appearing to come from a colleague, and so a REPLY lands in the shared HR
 * Onboarding inbox where the webhook can read it — not a personal mailbox it
 * has no access to.
 *
 * NEVER throws. A mention notification is a courtesy on top of the note or
 * interview that was just saved — its failure must not undo or block that
 * save. Errors are logged so a systemic failure (a revoked token, Front down)
 * is still visible.
 */

export type MentionContext = "note" | "interview";

/**
 * Present anywhere in the sent body. A reply from any mail client quotes the
 * original message SOMEWHERE, so when that reply comes back in, cutting the
 * text at the first occurrence of this exact string reliably separates what
 * the person actually typed from the quoted original — see stripReplyQuote in
 * app/api/front/webhook/route.ts. Kept as an HTML comment so it never appears
 * to the reader; matched as plain substring so it survives whatever an email
 * client does to the surrounding markup.
 */
export const MENTION_REPLY_BOUNDARY = "skyshare-mention-thread-boundary";

/**
 * Boundary patterns common email clients wrap around a quoted original
 * message, used as a FALLBACK if our own HTML-comment marker got stripped by
 * whatever client the reply came through. Ordered by how early they tend to
 * appear doesn't matter — every match is tried and the EARLIEST one found in
 * the text wins, so a reply is cut at the first sign of quoted content
 * regardless of which pattern caught it.
 */
const QUOTE_BOUNDARY_PATTERNS = [
  /<div[^>]*class="[^"]*gmail_quote[^"]*"/i,
  /<blockquote/i,
  /-{2,}\s*Original Message\s*-{2,}/i,
  /\bOn\b[\s\S]{0,120}?\bwrote:/i,
  /From:\s*[\s\S]{0,120}?Sent:/i,
  // Front itself appends a signature block to a reply typed IN Front — not a
  // quote of the original at all, but a contact card (name, title, phone).
  // Found on the very first real reply this shipped to: a one-word "received"
  // followed by a full front-signature table, which the OTHER patterns here
  // have no reason to catch since there is no quoted original in a Front-native
  // reply to begin with.
  /<div[^>]*class="[^"]*front-signature[^"]*"/i,
  // Our own sentence, as a last-resort net — if even the HTML comment marker
  // got stripped, the visible text of the original invite is still almost
  // certainly quoted somewhere below the reply.
  /You were mentioned by/i
];

/**
 * Cut a reply's raw HTML down to just what the person actually typed, by
 * finding the EARLIEST point where the original message (quoted by whatever
 * mail client they used) begins.
 *
 * Deliberately conservative: if NONE of the boundaries are found (an unusual
 * client, or someone bottom-posted instead of replying above the quote), the
 * whole message is returned rather than guessing — sanitizeRichText and the
 * length cap downstream keep that safe, and a human reviewing an odd-looking
 * note is a far better outcome than silently eating a real reply.
 */
export function stripReplyQuote(rawHtml: string): string {
  // Search for "<!-- marker" (the opening comment syntax included), not the
  // bare marker text — searching for the text alone finds the right position
  // but leaves the dangling "<!--" sitting in the kept portion, which then
  // shows up as a stray HTML artifact in the note.
  const markerIdx = rawHtml.indexOf(`<!-- ${MENTION_REPLY_BOUNDARY}`);
  // The plain-text email variant has no comment syntax at all — just "[marker]".
  const plainMarkerIdx = rawHtml.indexOf(`[${MENTION_REPLY_BOUNDARY}]`);
  const cutAt = markerIdx !== -1 ? markerIdx : plainMarkerIdx;
  const cut = cutAt !== -1 ? rawHtml.slice(0, cutAt) : rawHtml;

  let earliest = cut.length;
  for (const pattern of QUOTE_BOUNDARY_PATTERNS) {
    const match = pattern.exec(cut);
    if (match && match.index < earliest) earliest = match.index;
  }
  return cut.slice(0, earliest);
}

function firstName(fullName: string | null | undefined, fallbackEmail: string): string {
  const name = (fullName ?? "").trim();
  if (name) return name.split(/\s+/)[0];
  return fallbackEmail.split("@")[0];
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function notifyMentions(input: {
  emails: string[];
  candidateId: string;
  candidateName: string;
  context: MentionContext;
  mentionedBy: string | null;
  /** Which write-up this mention came from, so a reply is traceable to it. */
  interviewId?: string;
  noteId?: string;
}): Promise<void> {
  const recipients = [...new Set(input.emails.map((e) => e.trim().toLowerCase()))].filter(Boolean);
  if (recipients.length === 0) return;

  try {
    const [recipientUsers, mentioner, application] = await Promise.all([
      prisma.user.findMany({ where: { email: { in: recipients } }, select: { email: true, name: true } }),
      input.mentionedBy
        ? prisma.user.findUnique({ where: { email: input.mentionedBy }, select: { name: true } })
        : Promise.resolve(null),
      // The role they applied for, for context — not tied to a specific
      // interview's own jobId, since the write-up form never collects one;
      // this is the same "what are we talking about" a person reading the
      // email would ask, so the most recently touched application answers it.
      prisma.candidateApplication.findFirst({
        where: { candidateId: input.candidateId, job: { isNot: null } },
        orderBy: { updatedAt: "desc" },
        select: { job: { select: { title: true } } }
      })
    ]);
    const byEmail = new Map(recipientUsers.map((u) => [u.email!.toLowerCase(), u.name]));
    const mentionerFirst = firstName(mentioner?.name, input.mentionedBy ?? "someone");
    const jobTitle = application?.job?.title ?? null;

    // NEXTAUTH_URL is the source of truth. The fallback used to be a hard-coded
    // host, which went stale the moment the Vercel project was renamed and would
    // have put a dead link in every mention email. Prefer the domain Vercel itself
    // reports for the production deployment — it follows a rename automatically —
    // and keep a literal only as a last resort.
    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const base =
      process.env.NEXTAUTH_URL ??
      (productionHost ? `https://${productionHost}` : "https://skyshare-journey.vercel.app");
    const profileUrl = `${base}/candidates/${input.candidateId}`;
    const detailUrl = `${profileUrl}?tab=${input.context === "interview" ? "interviews" : "notes"}`;
    const detailLabel = input.context === "interview" ? "View their interview notes" : "View their notes";

    const what =
      input.context === "interview"
        ? jobTitle
          ? `an interview write-up for ${escapeHtml(jobTitle)} candidate <strong>${escapeHtml(input.candidateName)}</strong>`
          : `an interview write-up for <strong>${escapeHtml(input.candidateName)}</strong>`
        : `a note for <strong>${escapeHtml(input.candidateName)}</strong>`;

    const channelId = await getChannelId("hrotasks@skyshare.com");
    for (const to of recipients) {
      const recipientFirst = firstName(byEmail.get(to), to);

      // One send per recipient rather than a single "to" list — a mention is
      // between one person and the mentioner, and CC'ing everyone mentioned on
      // a candidate turns a private nudge into a reply-all thread. It also
      // means each recipient gets their OWN conversation, so a reply from one
      // person can never be misattributed to another.
      const sent = await sendEmail(channelId, {
        to,
        subject: `You were mentioned on ${input.candidateName}`,
        // The boundary marker sits at the very TOP, immediately before "Hello"
        // — not the bottom. A reply quotes the WHOLE original message, so a
        // marker at the tail leaves everything above it (the greeting, the
        // "you were mentioned" line) sitting in the quoted block ABOVE where
        // the cut happens, and it leaks into the kept text. Putting it first
        // means "everything from here down is the quoted original" is true
        // the moment the marker is found, with nothing of ours ahead of it.
        body:
          `<!-- ${MENTION_REPLY_BOUNDARY} -->` +
          `<p>Hello ${escapeHtml(recipientFirst)},</p>` +
          `<p>You were mentioned by ${escapeHtml(mentionerFirst)} in ${what}.</p>` +
          `<p><a href="${detailUrl}">${detailLabel}</a> or <a href="${profileUrl}">view their profile</a>.</p>` +
          `<p>You can reply to this email with any feedback you have and it will be added to their profile.</p>`,
        text:
          `[${MENTION_REPLY_BOUNDARY}]\n` +
          `Hello ${recipientFirst},\n\n` +
          `You were mentioned by ${mentionerFirst} in ${input.context === "interview" ? "an interview write-up" : "a note"}` +
          `${jobTitle && input.context === "interview" ? ` for ${jobTitle} candidate` : " for"} ${input.candidateName}.\n\n` +
          `${detailLabel}: ${detailUrl}\nView their profile: ${profileUrl}\n\n` +
          `You can reply to this email with any feedback you have and it will be added to their profile.`
      });

      // Without a conversationId a reply can never be routed back — this is
      // not optional bookkeeping, it is the other half of the feature. Still
      // best-effort: one recipient's row failing must not stop the others
      // from being notified.
      if (sent.conversationId) {
        try {
          await prisma.mentionNotification.create({
            data: {
              conversationId: sent.conversationId,
              candidateId: input.candidateId,
              interviewId: input.interviewId ?? null,
              noteId: input.noteId ?? null,
              recipientEmail: to
            }
          });
        } catch (error) {
          console.error(`Could not record MentionNotification for ${to}:`, error);
        }
      } else {
        console.warn(`sendEmail returned no conversationId for mention to ${to} — a reply will not be captured.`);
      }
    }
  } catch (error) {
    console.error("Mention notification failed:", error);
  }
}
