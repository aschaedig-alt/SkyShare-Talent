import { logActivity } from "@/lib/activity/logger";
import type { GuardDecision } from "./send-guard";

/**
 * RECORD EVERY EMAIL THAT DID NOT REACH ITS REAL RECIPIENT.
 *
 * THE PROBLEM THIS SOLVES. A redirected send is invisible by design: it
 * succeeds, nothing errors, and the only person who finds out is whoever
 * happens to read the test inbox. The user's own words for the risk are "two
 * months from now there is something that is supposed to be going to the actual
 * user that is instead going in as a test and I just don't realize it."
 *
 * WHY THE ACTIVITY LOG AND NOT A CONSOLE LINE. Local dev and production point
 * at the SAME database (see CLAUDE.md), so a row written from a developer's
 * laptop is immediately visible on the live site at Settings → Activity. That
 * is the whole trick: the machine that did the redirecting is not the machine
 * anyone looks at, and the shared database is the only thing that bridges them.
 * A console line dies with the terminal; this survives.
 *
 * Real sends are NOT logged here. Only the two cases where a human's
 * expectation and reality could diverge:
 *   - redirected: a real person was expected to receive it and did not.
 *   - blocked:    nothing was sent at all.
 * Logging successful production sends would bury those two in noise, and Front
 * already records what it actually sent.
 */

export const EMAIL_REDIRECTED_TO_TEST = "EMAIL_REDIRECTED_TO_TEST";
export const EMAIL_SEND_BLOCKED = "EMAIL_SEND_BLOCKED";

/** Cap what goes in the description so one bulk send cannot write a novel. */
function summarize(recipients: string[]): string {
  if (recipients.length === 0) return "no recipients";
  if (recipients.length <= 4) return recipients.join(", ");
  return `${recipients.slice(0, 4).join(", ")} and ${recipients.length - 4} more`;
}

/**
 * Write the decision to the activity log, if it is one worth knowing about.
 *
 * NEVER THROWS AND NEVER BLOCKS THE SEND. Logging is a safety net, and a safety
 * net that can break the thing it protects is worse than none — if the write
 * fails the email still goes. logActivity already swallows its own errors; the
 * catch here covers the rest.
 */
export async function recordGuardDecision(
  decision: GuardDecision,
  context: { subject: string; kind: "send" | "draft" }
): Promise<void> {
  if (decision.mode === "production" || decision.mode === "internal") return;

  try {
    if (decision.mode === "redirected") {
      await logActivity({
        activityType: EMAIL_REDIRECTED_TO_TEST,
        description:
          `TEST EMAIL — this ${context.kind} did NOT reach ${summarize(decision.intended)}. ` +
          `It went to ${decision.testInbox} instead, because it was sent from a development machine rather than the live site. ` +
          `Subject: "${context.subject}". If this was meant to reach the real recipient, send it again from the website.`,
        entityType: "front-email",
        metadata: {
          mode: decision.mode,
          intendedRecipients: decision.intended,
          divertedTo: decision.testInbox,
          subject: context.subject,
          kind: context.kind
        }
      });
      return;
    }

    await logActivity({
      activityType: EMAIL_SEND_BLOCKED,
      description:
        `EMAIL BLOCKED — this ${context.kind} to ${summarize(decision.intended)} was not sent at all. ` +
        `It came from a development machine with no test inbox configured. Subject: "${context.subject}".`,
      entityType: "front-email",
      metadata: {
        mode: decision.mode,
        intendedRecipients: decision.intended,
        subject: context.subject,
        kind: context.kind
      }
    });
  } catch {
    /* never let the safety net break the send */
  }
}

export type TestEmailAlert = {
  at: string;
  mode: string;
  subject: string;
  intendedRecipients: string[];
  divertedTo?: string;
  kind: string;
};

/**
 * Every test-redirected or blocked email since a given time, newest first —
 * what the daily work report reads to tell the team "these did not actually go
 * out". Returns [] on any failure, since a reporting query must never be the
 * reason a report does not get sent.
 */
export async function getTestEmailAlerts(since: Date): Promise<TestEmailAlert[]> {
  try {
    const { prisma } = await import("@/lib/prisma");
    const rows = await prisma.activityLog.findMany({
      where: {
        activityType: { in: [EMAIL_REDIRECTED_TO_TEST, EMAIL_SEND_BLOCKED] },
        createdAt: { gte: since }
      },
      orderBy: { createdAt: "desc" },
      select: { activityType: true, createdAt: true, metadata: true },
      take: 200
    });
    return rows.map((r) => {
      let meta: Record<string, unknown> = {};
      try {
        meta = r.metadata ? (JSON.parse(r.metadata) as Record<string, unknown>) : {};
      } catch {
        /* a malformed blob should not lose the row — the type and time still matter */
      }
      return {
        at: r.createdAt.toISOString(),
        mode: r.activityType === EMAIL_SEND_BLOCKED ? "blocked" : "redirected",
        subject: typeof meta.subject === "string" ? meta.subject : "(unknown subject)",
        intendedRecipients: Array.isArray(meta.intendedRecipients) ? (meta.intendedRecipients as string[]) : [],
        divertedTo: typeof meta.divertedTo === "string" ? meta.divertedTo : undefined,
        kind: typeof meta.kind === "string" ? meta.kind : "send"
      };
    });
  } catch {
    return [];
  }
}
