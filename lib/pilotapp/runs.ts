import { prisma } from "@/lib/prisma";

/**
 * Run history for the nightly pilot-application sweep.
 *
 * Same shape and same reasoning as the orientation reminder's run log: a job
 * that runs unattended needs a record of the nights it did NOTHING as much as
 * the nights it acted, because "it never fired" is otherwise indistinguishable
 * from "it fired and found nothing" — and that ambiguity is what produced a
 * false alarm about the orientation cron in August.
 *
 * Stored in a WorkspaceSetting rather than a new table, following the existing
 * precedent: no migration against the shared live database for what is a small
 * rolling list.
 */

const SCOPE = "pilotapp";
const RUNS_KEY = "scan-runs";

/** Enough to see a pattern, small enough to stay one row. */
const RUNS_KEPT = 30;

const ZONE = "America/Denver";

/** YYYY-MM-DD as read in Mountain — the day a run belongs to. */
export function mountainDayKey(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(d);
}

export type PilotAppRunRecord = {
  /** When the run happened, ISO. */
  at: string;
  /** The Mountain day it ran on. */
  dayKey: string;
  /**
   * What set this run off. The button can create people just as the cron can, so
   * a log that recorded only the cron would be an incomplete answer to "what
   * added this person" — which is the one question the log exists to answer.
   */
  trigger: "cron" | "manual";
  /** Who clicked, for a manual run. Null under the local auth bypass. */
  actor?: string | null;
  outcome: "created" | "filed-only" | "nothing-found" | "crashed";
  query: string;
  conversationsScanned: number;
  noticesFound: number;
  attached: number;
  /** Display names of everyone this run created, in order. */
  created: string[];
  /** Tag names that could not be resolved in Front — a silent failure otherwise. */
  missingTags?: string[];
  /** Whether the summary email went, and why not when it did not. */
  emailed?: boolean;
  emailError?: string;
  /** Set only when the whole run threw. */
  error?: string;
};

async function readRuns(): Promise<PilotAppRunRecord[]> {
  const row = await prisma.workspaceSetting.findFirst({
    where: { scope: SCOPE, key: RUNS_KEY },
    select: { valueJson: true }
  });
  if (!row?.valueJson) return [];
  try {
    const parsed = JSON.parse(row.valueJson) as unknown;
    return Array.isArray(parsed) ? (parsed as PilotAppRunRecord[]) : [];
  } catch {
    return [];
  }
}

/** Newest first. */
export async function getPilotAppRuns(): Promise<PilotAppRunRecord[]> {
  return readRuns();
}

/**
 * Append a run record, newest first, capped at RUNS_KEPT.
 *
 * Deliberately never throws. This is instrumentation: failing to record a run
 * must not turn a successful sweep into a crash. A swallowed error costs a line
 * of history; a thrown one could cost the filing.
 */
export async function recordPilotAppRun(entry: PilotAppRunRecord): Promise<void> {
  try {
    const runs = await readRuns();
    const value = JSON.stringify([entry, ...runs].slice(0, RUNS_KEPT));
    await prisma.workspaceSetting.upsert({
      where: { scope_key: { scope: SCOPE, key: RUNS_KEY } },
      create: { scope: SCOPE, key: RUNS_KEY, valueJson: value },
      update: { valueJson: value }
    });
  } catch (err) {
    console.error("Could not record the pilot app scan run:", err);
  }
}
