import { recordPilotAppRun, mountainDayKey, type PilotAppRunRecord } from "./runs";
import { sendDailySummary, worthSending } from "./daily-email";
import type { PilotAppReport } from "./scan";

/**
 * The single tail end of a WRITING pilot-application run — record it, then report
 * it.
 *
 * Both the nightly cron and the Check Front mail button can create people, and
 * both must leave the same trace. Keeping that in one function is the point: when
 * only the cron recorded runs, the log answered "did the cron fire" when the
 * question it exists to answer is "what added this person", and a button click
 * that created fourteen candidates left nothing behind at all.
 *
 * THE EMAIL FOLLOWS THE PEOPLE, NOT THE SCHEDULE. It goes whenever a run creates
 * somebody or hits a problem, whichever path ran it, because the thing worth
 * knowing is that candidates appeared — not which trigger produced them. A run
 * that created nobody and hit nothing stays silent; the record below is what
 * makes those quiet runs visible without mailing anyone.
 *
 * NEVER THROWS. Everything it reports on has already been written to the database
 * and to Front by the time this is called, so a failure here must not turn a
 * successful filing into a failed request.
 */
export async function completePilotAppRun(input: {
  report: PilotAppReport;
  trigger: PilotAppRunRecord["trigger"];
  actor?: string | null;
  at?: Date;
}): Promise<{ created: string[]; emailed: boolean; emailError?: string }> {
  const at = input.at ?? new Date();
  const report = input.report;
  const created = report.createdCandidates ?? [];

  const summary = {
    created,
    conversationsScanned: report.conversationsScanned,
    noticesFound: report.noticesFound,
    attached: report.attached,
    missingTags: report.missingTags
  };

  let emailed = false;
  let emailError: string | undefined;
  if (worthSending(summary)) {
    try {
      await sendDailySummary(summary);
      emailed = true;
    } catch (err) {
      emailError = err instanceof Error ? err.message : String(err);
      console.error("Pilot app run: summary email failed:", err);
    }
  }

  await recordPilotAppRun({
    at: at.toISOString(),
    dayKey: mountainDayKey(at),
    trigger: input.trigger,
    ...(input.actor !== undefined ? { actor: input.actor } : {}),
    outcome: created.length ? "created" : report.attached ? "filed-only" : "nothing-found",
    query: report.query,
    conversationsScanned: report.conversationsScanned,
    noticesFound: report.noticesFound,
    attached: report.attached,
    created,
    ...(report.missingTags?.length ? { missingTags: report.missingTags } : {}),
    ...(worthSending(summary) ? { emailed } : {}),
    ...(emailError ? { emailError } : {})
  });

  return { created, emailed, ...(emailError ? { emailError } : {}) };
}

/**
 * Record a run that THREW. Separate because there is no report to read, and
 * because this is the state most worth recording: from the outside a crashed run
 * looks identical to one that was never scheduled.
 */
export async function recordPilotAppCrash(input: {
  trigger: PilotAppRunRecord["trigger"];
  actor?: string | null;
  message: string;
  at?: Date;
}): Promise<void> {
  const at = input.at ?? new Date();
  await recordPilotAppRun({
    at: at.toISOString(),
    dayKey: mountainDayKey(at),
    trigger: input.trigger,
    ...(input.actor !== undefined ? { actor: input.actor } : {}),
    outcome: "crashed",
    query: "(threw before reporting)",
    conversationsScanned: 0,
    noticesFound: 0,
    attached: 0,
    created: [],
    error: input.message
  });
  try {
    await sendDailySummary({ created: [], conversationsScanned: 0, noticesFound: 0, attached: 0, error: input.message });
  } catch {
    /* already logged and recorded — a second failure must not mask the first */
  }
}
