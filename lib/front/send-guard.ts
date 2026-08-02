/**
 * Stop a non-production copy of this app from emailing real people.
 *
 * THE PROBLEM. Local dev and Vercel Preview both carry a real FRONT_API_TOKEN
 * pointed at the real hrotasks@ mailbox, and until this existed there was no
 * environment check anywhere in lib/front — messages.ts said so in its own header
 * comment: "There is no test inbox and recipients are real new hires." So running
 * an orientation send from a laptop put a real message in a real new hire's inbox,
 * with nothing to distinguish it from the genuine one.
 *
 * This is the same shape of hazard as the database and the file storage: localhost
 * points at the live shared thing, so "just testing" is not a state this app has.
 * See CLAUDE.md.
 *
 * THE RULE. Outside production, every recipient is replaced by FRONT_TEST_INBOX and
 * the subject is tagged with who it WOULD have gone to. If that variable is not set,
 * the send is REFUSED. Refusing is the safe default: quietly dropping the message
 * would look like a successful send, and a test that appears to work is how somebody
 * concludes the real flow is fine.
 *
 * It guards drafts as well as sends. A draft emails nobody, but it still lands in the
 * shared hrotasks@ mailbox the team works out of, where a teammate could send it.
 *
 * THE ONE EXCEPTION. Some mail this app sends is not addressed to a person at all —
 * the daily "what changed" report goes to an internal automation mailbox, and it is
 * SUPPOSED to run from a laptop on a schedule. Redirecting that to a tester's inbox
 * means the team silently stops receiving it. So a message whose recipients are ALL
 * on INTERNAL_AUTOMATION_RECIPIENTS passes through untouched.
 *
 * NOT A DOMAIN CHECK, and this is the whole point: new hires are issued
 * @skyshare.com addresses and the orientation template mails them there, so
 * "internal domain" would disarm the guard for the exact flow it exists to protect.
 * The list is explicit addresses, and ONE real person anywhere in to/cc/bcc sends the
 * whole message back down the guarded path.
 */

export type GuardedRecipients = {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
};

/**
 * Is this the real production deployment?
 *
 * VERCEL_ENV is the only thing that separates production from preview: a Preview
 * build has NODE_ENV="production" too, which is why the existing isHostedRuntime()
 * in lib/files/file-security.ts cannot be reused here — it answers "is this hosted",
 * and a preview deployment is hosted.
 */
export function isProductionEmailEnv(): boolean {
  const vercel = process.env.VERCEL_ENV?.toLowerCase();
  if (vercel) return vercel === "production";
  // Not on Vercel (a laptop, a container): fall back to the app's own label, and
  // treat anything unset as NOT production. Defaulting the other way would make an
  // unconfigured environment the dangerous one.
  return process.env.NEXT_PUBLIC_APP_ENV?.toLowerCase() === "production";
}

/**
 * Mailboxes that are automation endpoints rather than people — safe to reach from a
 * non-production run because nothing here is a candidate, a new hire or an outside
 * party, and the mail sent to them (the daily report) is worthless if it is diverted.
 *
 * ADDING TO THIS LIST WIDENS WHAT A LAPTOP CAN EMAIL. Only add an address that is a
 * shared internal mailbox the team already owns. Never add a person's address, and
 * never relax this to a domain test — new hires hold @skyshare.com addresses.
 */
export const INTERNAL_AUTOMATION_RECIPIENTS: readonly string[] = [
  "hrotasks@skyshare.com",
];

/** Pull the bare address out of either "a@b.com" or "Name <a@b.com>". */
function bareAddress(recipient: string): string {
  const angled = recipient.match(/<([^>]+)>/);
  return (angled ? angled[1] : recipient).trim().toLowerCase();
}

const isInternalAutomation = (recipient: string): boolean =>
  INTERNAL_AUTOMATION_RECIPIENTS.includes(bareAddress(recipient));

export class FrontSendBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FrontSendBlockedError";
  }
}

const list = (v: string | string[] | undefined): string[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

/**
 * Rewrite a message's recipients for the current environment.
 *
 * In production this is the identity function — it must not change a single
 * character of a real send.
 *
 * @throws FrontSendBlockedError outside production when FRONT_TEST_INBOX is unset.
 */
export function guardRecipients(input: { to: string | string[]; cc?: string[]; bcc?: string[]; subject: string }): GuardedRecipients {
  const to = list(input.to);
  if (isProductionEmailEnv()) {
    return { to, ...(input.cc ? { cc: input.cc } : {}), ...(input.bcc ? { bcc: input.bcc } : {}), subject: input.subject };
  }

  const testInbox = process.env.FRONT_TEST_INBOX?.trim();
  const intended = [...to, ...list(input.cc), ...list(input.bcc)];

  // Every recipient is an automation mailbox: nobody real is reachable, so let it
  // through unchanged. Requires ALL of them — a single person in cc means this is
  // mail to a human that merely copies a mailbox, and it stays guarded.
  if (intended.length > 0 && intended.every(isInternalAutomation)) {
    return {
      to,
      ...(input.cc ? { cc: input.cc } : {}),
      ...(input.bcc ? { bcc: input.bcc } : {}),
      subject: input.subject,
    };
  }

  if (!testInbox) {
    throw new FrontSendBlockedError(
      `Refusing to email ${intended.length} real recipient${intended.length === 1 ? "" : "s"} (${intended.join(", ") || "none"}) from a non-production environment. ` +
        `This app's Front token points at the live hrotasks@ mailbox, so this would have reached them for real. ` +
        `Set FRONT_TEST_INBOX in .env.local to an address you own and everything will be redirected there instead.`
    );
  }

  // Everyone collapses to the one test address, and the subject carries the real
  // recipients so the message is still readable as "this was for Tara Ward".
  // cc/bcc are dropped rather than redirected — three copies to the same inbox
  // tells you nothing the subject line does not.
  return {
    to: [testInbox],
    subject: `[TEST → ${intended.join(", ") || "no recipients"}] ${input.subject}`
  };
}
