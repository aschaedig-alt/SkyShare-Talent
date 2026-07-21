import { prisma } from "@/lib/prisma";
import { splitCandidateName } from "@/lib/candidates/normalize";
import { frontFetch } from "./client";

// The "Start Your Onboarding Journey" email. The BODY DELIBERATELY LIVES IN FRONT,
// not here: HR maintains ~50 templates in Front and edits them there, so we fetch the
// current body at send time rather than keeping a copy that silently drifts. The only
// thing the app contributes is the personalized greeting.

export const ONBOARDING_TEMPLATE_ID = "rsp_qmmai"; // "1. Start Your Onboarding Journey at SkyShare!"

// Front's editor labels this size "12" because 9pt and 12px are the same. Mirroring
// the template's own markup keeps the greeting from looking bolted on.
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

export type OnboardingEmailPreview = {
  to: string;
  /** Which field the address came from, so the confirm dialog can say so. */
  toSource: "personal" | "company";
  cc: string[];
  firstName: string;
  subject: string;
  html: string;
  templateName: string;
};

type HireForEmail = {
  id: string;
  name: string;
  personalEmail: string | null;
  ssEmail: string | null;
};

/**
 * Build the exact email that would be sent. Used for both the preview and the send, so
 * what the user approves is what actually goes out.
 */
export async function buildOnboardingEmail(
  hire: HireForEmail
): Promise<OnboardingEmailPreview> {
  // Personal email first: at this point in the checklist the company Gmail doesn't
  // exist yet — creating it is a LATER task, and this email is what tells them to
  // watch for it.
  const to = hire.personalEmail?.trim() || hire.ssEmail?.trim();
  if (!to) {
    throw new Error(
      `${hire.name} has no personal or SkyShare email on file — add one before sending.`
    );
  }

  const tpl = await frontFetch<{ name: string; subject: string; body: string }>(
    `/message_templates/${ONBOARDING_TEMPLATE_ID}`
  );

  const { firstName } = splitCandidateName(hire.name);
  const first = firstName || hire.name.split(/\s+/)[0] || "there";

  return {
    to,
    toSource: hire.personalEmail?.trim() ? "personal" : "company",
    cc: ["hrotasks@skyshare.com"],
    firstName: first,
    subject: tpl.subject,
    html: greetingHtml(first) + tpl.body,
    templateName: tpl.name,
  };
}

// ---------------------------------------------------------------------------
// Send record. Kept in a WorkspaceSetting rather than a new column so this ships
// without a migration against the shared live database. If this outgrows JSON,
// promote it to a real table then.

const SCOPE = "front";
const KEY = "onboarding-sends";

export type SendRecord = {
  conversationId?: string;
  messageId?: string;
  sentAt: string;
  to: string;
  sentBy?: string | null;
};

type SendMap = Record<string, SendRecord>;

async function readSends(): Promise<SendMap> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: KEY },
    select: { valueJson: true },
  });
  if (!row?.valueJson) return {};
  try {
    const parsed = JSON.parse(row.valueJson) as SendMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export async function getSendRecord(hireId: string): Promise<SendRecord | null> {
  return (await readSends())[hireId] ?? null;
}

export async function recordSend(
  hireId: string,
  record: SendRecord
): Promise<void> {
  const map = await readSends();
  map[hireId] = record;
  const value = JSON.stringify(map);
  await prisma.workspaceSetting.upsert({
    where: { scope_key: { scope: SCOPE, key: KEY } },
    create: { scope: SCOPE, key: KEY, valueJson: value },
    update: { valueJson: value },
  });
}
