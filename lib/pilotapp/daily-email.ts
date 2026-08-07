import { sendEmail } from "@/lib/front/messages";
import { getOrientationChannelId } from "@/lib/front/config";
import { ORIENTATION_CHANNEL_ADDRESS } from "@/lib/front/config";

/**
 * The morning summary of what the pilot-application sweep created.
 *
 * SENT ONLY WHEN THERE IS SOMETHING TO SAY — people were created, or something
 * went wrong. A nightly "nobody today" would be reassurance mail, which the team
 * stops reading within a week, and a mail nobody reads cannot raise an alarm.
 * The quiet nights are still recorded: every run writes to the pilotapp/scan-runs
 * log whether it acted or not, so "it never fired" stays answerable without
 * putting a message in anyone's inbox.
 *
 * Goes to hrotasks@skyshare.com, which the send guard already lists as an
 * automation endpoint rather than a person — so this is the one class of mail
 * that is allowed to leave a non-production run without being diverted, which is
 * exactly what makes a daily report worth having.
 */

export type DailySummaryInput = {
  created: string[];
  conversationsScanned: number;
  noticesFound: number;
  attached: number;
  missingTags?: string[];
  error?: string;
};

/** True when the run produced something a human should see this morning. */
export function worthSending(input: DailySummaryInput): boolean {
  return input.created.length > 0 || Boolean(input.error) || Boolean(input.missingTags?.length);
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function buildDailySummary(input: DailySummaryInput): { subject: string; body: string; text: string } {
  const n = input.created.length;
  const subject = input.error
    ? "Pilot application scan FAILED"
    : n === 0
      ? "Pilot application scan needs attention"
      : `${n} candidate${n === 1 ? "" : "s"} added from pilot applications`;

  const lines: string[] = [];
  if (input.error) {
    lines.push(`The scan did not complete: ${input.error}`);
  } else if (n) {
    lines.push(`${n} candidate${n === 1 ? " was" : "s were"} created from their own signed pilot application:`);
  }

  const listHtml = n
    ? `<ul>${input.created.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>`
    : "";

  // Named plainly rather than buried: an unresolved tag does NOT stop the filing,
  // so without this line it fails silently and looks fine for weeks.
  const tagWarning = input.missingTags?.length
    ? `<p><strong>Tags that could not be found in Front:</strong> ${escapeHtml(input.missingTags.join(", "))}. The documents were still filed; only the labelling was skipped.</p>`
    : "";

  const stats = `<p style="color:#5b6b7c">Scanned ${input.conversationsScanned} threads, found ${input.noticesFound} notices, filed ${input.attached}.</p>`;

  const body = [
    lines.length ? `<p>${lines.map(escapeHtml).join("</p><p>")}</p>` : "",
    listHtml,
    tagWarning,
    n ? `<p>Each was created from the application itself, so the record holds only the name and email that were on it. They are tagged Candidate Created by App in Front.</p>` : "",
    stats
  ]
    .filter(Boolean)
    .join("\n");

  const text = [
    ...lines,
    ...input.created.map((name) => `- ${name}`),
    input.missingTags?.length ? `Tags not found in Front: ${input.missingTags.join(", ")}` : "",
    `Scanned ${input.conversationsScanned} threads, found ${input.noticesFound} notices, filed ${input.attached}.`
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, body, text };
}

/** Send it. Returns nothing on success; throws so the caller can record the failure. */
export async function sendDailySummary(input: DailySummaryInput): Promise<void> {
  const { subject, body, text } = buildDailySummary(input);
  const channelId = await getOrientationChannelId();
  await sendEmail(channelId, {
    to: ORIENTATION_CHANNEL_ADDRESS,
    subject,
    body,
    text,
    // Left open so it sits in the hrotasks@ inbox the team watches, rather than
    // archiving itself on send the way Front would by default.
    archive: false
  });
}
