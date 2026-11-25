import "server-only";
import { prisma } from "@/lib/prisma";
import { CURRENT_EMPLOYEE_WHERE } from "@/lib/data/current-employee";
import { escapeHtml } from "@/lib/formatting/rich-text";
import { getOrientationChannelId } from "@/lib/front/config";
import { sendEmail } from "@/lib/front/messages";
import { guardDecision, type GuardMode } from "@/lib/front/send-guard";
import { cleanEditedBody } from "@/lib/front/sanitize-body";
import { cardLinkOrigin } from "@/lib/new-hire-contacts/hire-card-link";
import { ensureLinkToken, getStoreSummary, StoreError } from "@/lib/party-store/server";
import { formatCents, partyStoreLinkPath } from "@/lib/party-store/shared";

// ---------------------------------------------------------------------------
// The leftover-credit email: "you have $X left, here's your link".
//
// NOTHING SENDS ON ITS OWN. There is no cron and no automatic trigger: a send
// happens only when somebody in the store's Send dialog picks the people, reads
// the preview and confirms. He asked for exactly that on Nov 24 2026 ("build
// sending but dont plan to send anything until i choose to do it").
//
// Shape of each email, top to bottom:
//   greeting      "Hi Abbi,"                          per person, never editable
//   body          the shared wording                   editable for this send only
//   credit block  "$20 left" + the personal link       per person, never editable
// The body is the app's own wording (there is no Front template for this), and
// an edit replaces only the middle, so one edited body is safe across a batch:
// nobody gets somebody else's name, balance or link.
//
// Every send goes through lib/front/messages.ts sendEmail, so the send guard
// applies: outside production each email is redirected to FRONT_TEST_INBOX (or
// refused if that is unset). It goes from the same hrotasks@ mailbox HR's other
// automated mail uses.
// ---------------------------------------------------------------------------

/** One request sends at most this many, so a batch never outlives the function
 *  timeout; the dialog walks through the list in batches. */
export const EMAIL_BATCH_MAX = 20;

export function defaultCreditSubject() {
  return "Your SkyShare holiday store credit";
}

export function defaultCreditBodyHtml() {
  return [
    "<p>Thanks for celebrating with us at the Christmas party!</p>",
    "<p>You still have holiday store credit to spend. Use the link below to pick what you'd like, and HR will let you know when your order is ready to pick up. Your credit doesn't expire.</p>"
  ].join("");
}

function greetingHtml(name: string) {
  const first = name.trim().split(/\s+/)[0] || name;
  return `<p>Hi ${escapeHtml(first)},</p>`;
}

function creditBlockHtml(balanceCents: number, url: string) {
  return (
    `<p style="margin:16px 0 4px"><strong>Credit left: ${escapeHtml(formatCents(balanceCents))}</strong></p>` +
    `<p style="margin:0 0 16px"><a href="${escapeHtml(url)}">Shop your store credit</a></p>` +
    `<p style="font-size:12px;color:#6b7280">This link is just for you, so please don't forward it.</p>`
  );
}

export type CreditEmailRecipient = {
  newHireId: string;
  name: string;
  email: string | null;
  balanceCents: number;
  lastEmailedAt: string | null;
  lastEmailMode: string | null;
  /** Why this person can't be emailed, or null if they can. */
  blocked: string | null;
};

/** What the Send dialog needs: who can be emailed, the default wording, and
 *  what the send guard will do in THIS environment. */
export async function getCreditEmailPlan(storeId: string) {
  const summary = await getStoreSummary(storeId);
  if (!summary) throw new StoreError("That store no longer exists.", 404);

  const emails = await prisma.partyStoreEmail.findMany({
    where: { storeId, error: null },
    orderBy: { sentAt: "desc" },
    select: { accountId: true, sentAt: true, mode: true }
  });
  const lastByAccount = new Map<string, { sentAt: Date; mode: string }>();
  for (const e of emails) if (!lastByAccount.has(e.accountId)) lastByAccount.set(e.accountId, e);

  const recipients: CreditEmailRecipient[] = summary.people
    .filter((p) => p.current)
    .map((p) => {
      const last = p.accountId ? lastByAccount.get(p.accountId) : undefined;
      let blocked: string | null = null;
      if (p.balanceCents <= 0) blocked = "No credit left";
      else if (!p.email) blocked = "No SkyShare email on file";
      return {
        newHireId: p.newHireId,
        name: p.name,
        email: p.email,
        balanceCents: p.balanceCents,
        lastEmailedAt: last?.sentAt.toISOString() ?? null,
        lastEmailMode: last?.mode ?? null,
        blocked
      };
    });

  const sample = guardDecision({ to: ["employee@skyshare.com"], subject: defaultCreditSubject() });
  return {
    subject: defaultCreditSubject(),
    bodyHtml: defaultCreditBodyHtml(),
    guardMode: sample.mode as GuardMode,
    testInbox: sample.testInbox ?? null,
    recipients
  };
}

/** The greeting and credit block for the dialog's preview of one person. */
export function previewParts(name: string, balanceCents: number) {
  return {
    greetingHtml: greetingHtml(name),
    creditHtml: creditBlockHtml(balanceCents, `${cardLinkOrigin()}${partyStoreLinkPath("their-own-link")}`)
  };
}

export type CreditEmailResult = { newHireId: string; name: string; ok: boolean; mode?: GuardMode; error?: string };

/**
 * Send the email to these people, one message each. Every person is re-checked
 * here (still current, still has credit, has an email) — the dialog's list may
 * be minutes old. Each attempt is recorded, success or failure.
 */
export async function sendCreditEmails(input: {
  storeId: string;
  newHireIds: string[];
  subject: string;
  editedBodyHtml: string | null;
  actor: string | null;
}): Promise<CreditEmailResult[]> {
  const ids = [...new Set(input.newHireIds)];
  if (!ids.length) throw new StoreError("Pick who to email.");
  if (ids.length > EMAIL_BATCH_MAX) throw new StoreError(`At most ${EMAIL_BATCH_MAX} at a time.`);
  const subject = input.subject.replace(/\s+/g, " ").trim().slice(0, 200) || defaultCreditSubject();
  const edited = Boolean(input.editedBodyHtml && input.editedBodyHtml.trim());
  const body = edited ? cleanEditedBody(input.editedBodyHtml as string) : defaultCreditBodyHtml();

  const summary = await getStoreSummary(input.storeId);
  if (!summary) throw new StoreError("That store no longer exists.", 404);
  const people = await prisma.newHire.findMany({
    where: { id: { in: ids }, ...CURRENT_EMPLOYEE_WHERE },
    select: { id: true, name: true, ssEmail: true }
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  const channelId = await getOrientationChannelId();
  const origin = cardLinkOrigin();

  const results: CreditEmailResult[] = [];
  for (const id of ids) {
    const person = byId.get(id);
    const row = summary.people.find((p) => p.newHireId === id);
    if (!person || !row) {
      results.push({ newHireId: id, name: row?.name ?? "?", ok: false, error: "Not a current employee." });
      continue;
    }
    if (!person.ssEmail) {
      results.push({ newHireId: id, name: person.name, ok: false, error: "No SkyShare email on file." });
      continue;
    }
    if (row.balanceCents <= 0) {
      results.push({ newHireId: id, name: person.name, ok: false, error: "No credit left." });
      continue;
    }

    const token = await ensureLinkToken(input.storeId, id);
    const account = await prisma.partyStoreAccount.findUnique({
      where: { storeId_newHireId: { storeId: input.storeId, newHireId: id } },
      select: { id: true }
    });
    const html =
      greetingHtml(person.name) + body + creditBlockHtml(row.balanceCents, `${origin}${partyStoreLinkPath(token)}`);
    const mode = guardDecision({ to: [person.ssEmail], subject }).mode;
    try {
      const sent = await sendEmail(channelId, { to: [person.ssEmail], subject, body: html, archive: false });
      await prisma.partyStoreEmail.create({
        data: {
          storeId: input.storeId,
          accountId: account!.id,
          toEmail: person.ssEmail,
          subject,
          mode,
          edited,
          conversationId: sent.conversationId ?? null,
          sentBy: input.actor
        }
      });
      results.push({ newHireId: id, name: person.name, ok: true, mode });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 500) : "Send failed.";
      await prisma.partyStoreEmail
        .create({
          data: {
            storeId: input.storeId,
            accountId: account!.id,
            toEmail: person.ssEmail,
            subject,
            mode,
            edited,
            error: message,
            sentBy: input.actor
          }
        })
        .catch(() => {});
      results.push({ newHireId: id, name: person.name, ok: false, mode, error: message });
    }
  }
  return results;
}
