import { prisma } from "@/lib/prisma";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { getShareToken, buildShareUrl } from "@/lib/new-hire-contacts/share-link";
import { frontFetch } from "./client";

// The "commonly used SkyShare contacts" email — the day-of-orientation hand-off of
// the vCard link.
//
// SAME SHAPE AS onboarding-email.ts and for the same reason: the BODY LIVES IN FRONT.
// HR maintains the wording there, so we fetch the current template at send time
// instead of keeping a copy that silently drifts.
//
// WHAT THIS ADDS OVER PASTING THE LINK BY HAND: the share link is injected from the
// database at send time. Rotating the token used to strand the copy pasted into the
// Front template — it would carry on sending a link that 404s, and the first sign
// would be a new hire saying it did not work. Now the template's own link is
// REPLACED on every send, so a stale one in the body cannot reach anybody.

export const CONTACTS_TEMPLATE_ID = "rsp_s07h6"; // "SkyShare New Hire - Contacts Link"

/**
 * An absolute /welcome link, with or without a token, and nothing longer.
 *
 * THE LOOKAHEAD IS LOAD-BEARING. Without a right boundary the pattern also matched
 * the /welcome PREFIX of a longer path, and since the replacement ends in ?t=<token>
 * the leftover tail spliced straight into the token value: /welcome/guide became
 * ?t=<token>/guide, and /welcome-aboard became ?t=<token>-aboard. Both fail the exact
 * token comparison in isValidShareToken, so the hire lands on a not-found page — and
 * because .test() had matched, the confirm dialog would have reported that a stale
 * link could not go out. The one failure this file exists to prevent, announced as a
 * success. A trailing slash IS accepted, since /welcome/ is the same page.
 */
const WELCOME_LINK = /https?:\/\/[^\s"'<>]*\/welcome\/?(?=[?\s"'<>]|$)(?:\?[^\s"'<>]*)?/gi;

// Matches greetingHtml in onboarding-email.ts. Front's editor labels this size "12"
// because 9pt and 12px are the same; mirroring the template's own markup keeps the
// greeting from looking bolted on.
function greetingHtml(firstName: string): string {
  const safe = firstName.replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string
  );
  return (
    `<div style="line-height: 1.5;" dir="ltr">` +
    `<span style="font-family: Verdana, sans-serif;">` +
    `<span style="background-color: transparent; font-size: 9pt;">Hi ${safe},</span>` +
    `</span></div><div><br /></div>`
  );
}

/**
 * The absolute origin to build the share link from.
 *
 * Same resolution order as lib/notifications/mentions.ts — NEXTAUTH_URL first, then
 * the domain Vercel reports for the production deployment (which follows a project
 * rename automatically), then a literal as a last resort.
 *
 * BUT localhost is REFUSED here rather than used. .env.local sets NEXTAUTH_URL to
 * http://localhost:3000 and also holds a real FRONT_API_TOKEN, so a send from a dev
 * machine would otherwise email a real person a link only that machine can open.
 * Failing loudly is the safe direction: the caller turns this into a message naming
 * the problem, and nothing goes out.
 */
function resolveOrigin(): string {
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const base =
    process.env.NEXTAUTH_URL ??
    (productionHost ? `https://${productionHost}` : "https://skyshare-journey.vercel.app");
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(base)) {
    throw new Error(
      "This machine resolves the site to localhost, so the contacts link in the email would only work here. Send it from the deployed site instead."
    );
  }
  return base.replace(/\/+$/, "");
}

export type ContactsEmailPreview = {
  to: string;
  /** Which field the address came from, so the confirm dialog can say so. */
  toSource: "personal" | "company";
  cc: string[];
  firstName: string;
  subject: string;
  html: string;
  templateName: string;
  /** The link actually embedded, so the confirm dialog can show it. */
  shareUrl: string;
  /** True when the template carried its own link and we replaced it. */
  replacedTemplateLink: boolean;
};

type HireForEmail = {
  id: string;
  name: string;
  personalEmail: string | null;
  ssEmail: string | null;
};

/**
 * Build the exact email that would be sent. Used for both the preview and the send,
 * so what the user approves is what actually goes out.
 */
export async function buildContactsEmail(hire: HireForEmail): Promise<ContactsEmailPreview> {
  // COMPANY ADDRESS FIRST — the reverse of the onboarding email, deliberately. That
  // one goes to the personal address because the company Gmail does not exist yet
  // when it is sent. This one goes on the day of orientation, by which point it does,
  // and these contacts belong on the phone they will use for work.
  const to = hire.ssEmail?.trim() || hire.personalEmail?.trim();
  if (!to) {
    throw new Error(
      `${hire.name} has no SkyShare or personal email on file — add one before sending.`
    );
  }

  const token = await getShareToken();
  if (!token) {
    throw new Error(
      "No contacts share link exists yet. Open Settings → New hire contacts once to create it, then send."
    );
  }
  const shareUrl = buildShareUrl(resolveOrigin(), token);

  const tpl = await frontFetch<{ name: string; subject: string; body: string }>(
    `/message_templates/${CONTACTS_TEMPLATE_ID}`
  );

  // Replace whatever link the template carries with the live one. An href and its
  // visible text are usually both the URL, so a global replace fixes both.
  const replacedTemplateLink = WELCOME_LINK.test(tpl.body);
  WELCOME_LINK.lastIndex = 0;
  const body = replacedTemplateLink
    ? tpl.body.replace(WELCOME_LINK, shareUrl)
    : `${tpl.body}<div><br /></div><div style="line-height: 1.5;" dir="ltr">` +
      `<span style="font-family: Verdana, sans-serif;">` +
      `<span style="background-color: transparent; font-size: 9pt;">` +
      `<a href="${shareUrl}">${shareUrl}</a>` +
      `</span></span></div>`;

  const { firstName } = splitCandidateName(hire.name);
  const first = firstName || hire.name.split(/\s+/)[0] || "there";

  return {
    to,
    toSource: hire.ssEmail?.trim() ? "company" : "personal",
    cc: ["hrotasks@skyshare.com"],
    firstName: first,
    subject: tpl.subject,
    html: greetingHtml(first) + body,
    templateName: tpl.name,
    shareUrl,
    replacedTemplateLink,
  };
}

// ---------------------------------------------------------------------------
// Send record. Its own key beside the onboarding one, in a WorkspaceSetting rather
// than a new column so this ships without a migration against the shared live
// database — same trade onboarding-email.ts made.

const SCOPE = "front";
const KEY = "contacts-link-sends";

export type ContactsSendRecord = {
  // Optional to match SendRecord: Front answers 202 and returns the ids it created,
  // but the shape is not guaranteed, so neither id is treated as certain.
  conversationId?: string;
  messageId?: string;
  sentAt: string;
  to: string;
  sentBy?: string | null;
  /** Which send-guard mode was in force, so a redirected test send is not later
      mistaken for a real delivery to the address recorded above. */
  mode?: string;
};

type SendMap = Record<string, ContactsSendRecord>;

async function readAll(): Promise<SendMap> {
  const row = await prisma.workspaceSetting.findUnique({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = typeof row.valueJson === "string" ? JSON.parse(row.valueJson) : row.valueJson;
    return (parsed && typeof parsed === "object" ? parsed : {}) as SendMap;
  } catch {
    return {};
  }
}

export async function getContactsSendRecord(hireId: string): Promise<ContactsSendRecord | null> {
  const all = await readAll();
  return all[hireId] ?? null;
}

export async function recordContactsSend(hireId: string, rec: ContactsSendRecord): Promise<void> {
  // Read-modify-write of one JSON blob. Sends are one-at-a-time from a confirm
  // dialog, so the concurrent-write problem the feedback batch hit does not apply.
  const all = await readAll();
  all[hireId] = rec;
  const valueJson = JSON.stringify(all);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson },
    update: { valueJson },
  });
}
