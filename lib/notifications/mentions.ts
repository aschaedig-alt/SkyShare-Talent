import { getChannelId } from "@/lib/front/config";
import { sendEmail } from "@/lib/front/messages";

/**
 * Email a teammate that they were @-mentioned on a candidate.
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
 * appearing to come from a colleague.
 *
 * NEVER throws. A mention notification is a courtesy on top of the note or
 * interview that was just saved — its failure must not undo or block that
 * save. Errors are logged so a systemic failure (a revoked token, Front down)
 * is still visible.
 */

export type MentionContext = "note" | "interview";

export async function notifyMentions(input: {
  emails: string[];
  candidateId: string;
  candidateName: string;
  context: MentionContext;
  mentionedBy: string | null;
}): Promise<void> {
  const recipients = [...new Set(input.emails.map((e) => e.trim().toLowerCase()))].filter(Boolean);
  if (recipients.length === 0) return;

  const url = `${process.env.NEXTAUTH_URL ?? "https://skyshare-talent.vercel.app"}/candidates/${input.candidateId}`;
  const what = input.context === "interview" ? "an interview write-up" : "a note";
  const by = input.mentionedBy ? ` by ${input.mentionedBy}` : "";

  try {
    const channelId = await getChannelId("hrotasks@skyshare.com");
    for (const to of recipients) {
      // One send per recipient rather than a single "to" list — a mention is
      // between one person and the mentioner, and CC'ing everyone mentioned on
      // a candidate turns a private nudge into a reply-all thread.
      await sendEmail(channelId, {
        to,
        subject: `You were mentioned on ${input.candidateName}`,
        body: `<p>You were mentioned${by} in ${what} for <strong>${escapeHtml(input.candidateName)}</strong>.</p><p><a href="${url}">Open the candidate</a></p>`,
        text: `You were mentioned${by} in ${what} for ${input.candidateName}.\n${url}`
      });
    }
  } catch (error) {
    console.error("Mention notification failed:", error);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
