import { prisma } from "@/lib/prisma";
import { getCandidateStageSections } from "@/lib/data/onboarding-grid-config";
import { getTaskSendMap } from "@/lib/front/task-email";
import { looksLikePilot, parsePreHireTicks, type PreHireStatus } from "@/lib/onboarding/prehire";

/**
 * The candidate's pre-offer checklist, for their Checklists tab. See
 * lib/onboarding/prehire.ts for the model.
 */

export type PreHireTaskView = {
  key: string;
  label: string;
  status: PreHireStatus;
  /** When it was last set to Done / N/A, and by whom — null while To do. */
  at: string | null;
  by: string | null;
  /**
   * The hire's own task row, once there is a hire. When set, THIS is what a click
   * writes: the row is the one truth after the move into onboarding, and the
   * candidate's stored copy is history.
   */
  hireTaskId: string | null;
  /** This step sends a Front template (set up in Manage tasks). */
  sendsEmail: boolean;
  /** When the app last actually sent it — from the send log, never the tick. */
  sentAt: string | null;
};

export type PreHireSectionView = { key: string; label: string; tasks: PreHireTaskView[] };

export type PreHireChecklistView = {
  sections: PreHireSectionView[];
  /** Their hire, once they have moved into onboarding. */
  hireId: string | null;
  /** Opens by itself for a pilot; folded, never hidden, for anybody else. */
  pilot: boolean;
  /** To-do steps, for the tab's badge. Counted only where it opens by itself. */
  outstanding: number;
};

/** Null when no section starts on the candidate — then there is nothing to show. */
export async function getPreHireChecklist(candidateId: string): Promise<PreHireChecklistView | null> {
  const sections = await getCandidateStageSections();
  if (sections.length === 0) return null;

  const keys = sections.flatMap((s) => s.tasks.map((t) => t.key));
  const [candidate, hire, sends] = await Promise.all([
    prisma.candidate.findUnique({
      where: { id: candidateId },
      select: {
        preHireTasksJson: true,
        applications: {
          select: { historicalJobTitle: true, job: { select: { title: true, isPilotRole: true } } }
        }
      }
    }),
    // findFirst, not unique: NewHire.candidateId is a bare column. POST
    // /api/new-hires refuses a second hire for one candidate, so there is one.
    prisma.newHire.findFirst({
      where: { candidateId },
      select: { id: true, tasks: { where: { key: { in: keys } }, select: { id: true, key: true, status: true, completedAt: true } } }
    }),
    getTaskSendMap()
  ]);
  if (!candidate) return null;

  const ticks = parsePreHireTicks(candidate.preHireTasksJson);
  const rows = new Map((hire?.tasks ?? []).map((t) => [t.key, t]));
  // Sends are logged against whichever record the button was on at the time —
  // the candidate before the move, the hire after. The hire's wins once it exists
  // (the move copies the candidate's across), and the candidate's still counts
  // for a hire whose checklist predates the step.
  const sentAt = (key: string) =>
    (hire ? sends[`${hire.id}:${key}`]?.sentAt : undefined) ?? sends[`${candidateId}:${key}`]?.sentAt ?? null;

  const view: PreHireSectionView[] = sections.map((s) => ({
    key: s.key,
    label: s.label,
    tasks: s.tasks.map((t) => {
      const row = rows.get(t.key);
      const status: PreHireStatus = row
        ? row.status === "DONE" || row.status === "NA"
          ? row.status
          : "TODO"
        : ticks[t.key]?.status ?? "TODO";
      return {
        key: t.key,
        label: t.label,
        status,
        at: row ? row.completedAt?.toISOString() ?? null : ticks[t.key]?.at ?? null,
        by: row ? null : ticks[t.key]?.by ?? null,
        hireTaskId: row?.id ?? null,
        sendsEmail: Boolean(t.email) && !t.emailFixed,
        sentAt: sentAt(t.key)
      };
    })
  }));

  const pilot = looksLikePilot(candidate.applications);
  const touched = view.some((s) => s.tasks.some((t) => t.status !== "TODO"));
  const outstanding = pilot || touched ? view.reduce((n, s) => n + s.tasks.filter((t) => t.status === "TODO").length, 0) : 0;

  return { sections: view, hireId: hire?.id ?? null, pilot, outstanding };
}
