import { prisma } from "@/lib/prisma";
import { ONBOARDING_TASKS } from "@/lib/onboarding/tasks";
import { resolveFleetPosition } from "@/lib/fleet/positions";
import {
  CARRY_OVER_DEFAULTS,
  parseArchivedTasks,
  type ArchivedTask,
  type RoundReason
} from "@/lib/onboarding/rounds";

// Putting someone through onboarding a second time — see lib/onboarding/rounds.ts
// for what that means and when it is the right call. This is the database half.
//
// The shape of the thing: OnboardingTask is one row per key per hire, so a fresh
// checklist cannot simply sit alongside the old one. Starting a round therefore
// FREEZES the current checklist into an OnboardingArchive (tasks, dates, position,
// stage) and then rebuilds a clean set. Nothing is lost, and restoreOnboardingRound
// puts it all back — which is the point, because this runs against the live shared
// database on a real employee's record.

export type StartRoundInput = {
  reason: RoundReason;
  note?: string | null;
  /** New title / department. Blank leaves the current one alone. */
  position?: string | null;
  department?: string | null;
  /** The day the new role (or the return to work) takes effect. */
  effectiveDate: Date;
  /** Task keys that start the new checklist already ticked. */
  carryOver?: string[];
  /** Also write the move into the role journey. Skipped if it would duplicate. */
  recordRoleChange?: boolean;
  archivedBy?: string | null;
};

export type StartRoundResult = {
  ok: true;
  archiveId: string;
  sequence: number;
  taskCount: number;
  carriedOver: number;
  /** Plain-English list of everything that changed, shown back to the operator. */
  changes: string[];
};

export type ArchivedRoundView = {
  id: string;
  sequence: number;
  reason: string;
  roundReason: string | null;
  note: string | null;
  position: string | null;
  department: string | null;
  startDate: string | null;
  offerSentDate: string | null;
  offerSignedDate: string | null;
  orientationDate: string | null;
  onboardedAt: string | null;
  doneCount: number;
  totalCount: number;
  archivedAt: string;
  archivedBy: string | null;
  restorable: boolean;
  tasks: ArchivedTask[];
};

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export async function getOnboardingArchives(hireId: string): Promise<ArchivedRoundView[]> {
  const rows = await prisma.onboardingArchive.findMany({
    where: { newHireId: hireId },
    orderBy: { sequence: "desc" }
  });
  return rows.map((a) => ({
    id: a.id,
    sequence: a.sequence,
    reason: a.reason,
    roundReason: a.roundReason,
    note: a.note,
    position: a.position,
    department: a.department,
    startDate: iso(a.startDate),
    offerSentDate: iso(a.offerSentDate),
    offerSignedDate: iso(a.offerSignedDate),
    orientationDate: iso(a.orientationDate),
    onboardedAt: iso(a.onboardedAt),
    doneCount: a.doneCount,
    totalCount: a.totalCount,
    archivedAt: a.archivedAt.toISOString(),
    archivedBy: a.archivedBy,
    restorable: a.restorable,
    tasks: parseArchivedTasks(a.tasksJson)
  }));
}

function clean(value: string | null | undefined): string | null {
  const t = (value ?? "").trim();
  return t.length ? t : null;
}

/**
 * Freeze the current checklist and start a clean one.
 *
 * Everything happens in one transaction: either the person ends up with an
 * archived round and a fresh checklist, or nothing moved at all. A half-applied
 * version of this — old checklist deleted, new one not created — would lose a
 * real employee's onboarding record, so there is no non-transactional path.
 */
export async function startOnboardingRound(hireId: string, input: StartRoundInput): Promise<StartRoundResult> {
  const hire = await prisma.newHire.findUnique({
    where: { id: hireId },
    select: {
      id: true,
      name: true,
      position: true,
      department: true,
      stage: true,
      employmentStatus: true,
      startDate: true,
      terminationDate: true,
      offerSentDate: true,
      offerSignedDate: true,
      orientationDate: true,
      onboardedAt: true,
      businessCardStatus: true,
      onboardingReason: true,
      onboardingRoundStartedAt: true,
      tasks: { select: { key: true, label: true, group: true, order: true, status: true, completedAt: true } }
    }
  });
  if (!hire) throw new Error("Employee not found.");

  const isRehire = input.reason === "REHIRE";
  const effective = input.effectiveDate;
  const newPosition = clean(input.position) ?? hire.position;
  const newDepartment = clean(input.department) ?? hire.department;
  const carryOver = new Set(input.carryOver ?? CARRY_OVER_DEFAULTS[input.reason]);
  const changes: string[] = [];

  // Snapshot first — this is what makes the rest reversible.
  const snapshot: ArchivedTask[] = [...hire.tasks]
    .sort((a, b) => a.order - b.order)
    .map((t) => ({
      key: t.key,
      label: t.label,
      group: t.group,
      order: t.order,
      status: t.status,
      completedAt: iso(t.completedAt)
    }));
  const completedByKey = new Map(snapshot.map((t) => [t.key, t.completedAt] as const));
  const doneCount = snapshot.filter((t) => t.status === "DONE").length;

  const priorArchives = await prisma.onboardingArchive.count({ where: { newHireId: hireId } });
  const sequence = priorArchives + 1;

  const openRole = await prisma.roleAssignment.findFirst({
    where: { newHireId: hireId, endDate: null },
    orderBy: { startDate: "desc" },
    select: { id: true, title: true, department: true, startDate: true, seat: true }
  });

  // Don't write a second journey entry for a move somebody already recorded by
  // hand, and don't back-date one before the role it would close.
  const wantsRole = input.recordRoleChange !== false && Boolean(newPosition);
  const sameAsOpen =
    openRole &&
    (openRole.title ?? "").trim().toLowerCase() === (newPosition ?? "").trim().toLowerCase() &&
    (openRole.department ?? "").trim().toLowerCase() === (newDepartment ?? "").trim().toLowerCase();
  const tooEarly = Boolean(openRole && effective < openRole.startDate);
  const willRecordRole = wantsRole && !sameAsOpen && !tooEarly;
  if (wantsRole && sameAsOpen) {
    changes.push(`Role journey left alone — “${newPosition}” is already their current role.`);
  } else if (wantsRole && tooEarly) {
    changes.push("Role journey left alone — the effective date is before their current role began.");
  }

  const result = await prisma.$transaction(async (tx) => {
    let createdRoleId: string | null = null;
    let closedRoleId: string | null = null;
    let createdStintId: string | null = null;
    let closedStintId: string | null = null;

    if (willRecordRole && newPosition) {
      const fp = resolveFleetPosition(newPosition);
      if (openRole) {
        await tx.roleAssignment.update({ where: { id: openRole.id }, data: { endDate: effective } });
        closedRoleId = openRole.id;
      }
      const transitionType = isRehire
        ? "HIRE"
        : input.reason === "DEPARTMENT_CHANGE"
          ? "TRANSFER"
          : fp?.seat === "PIC" && (openRole?.seat ?? "").toUpperCase() === "SIC"
            ? "UPGRADE"
            : "PROMOTION";
      const created = await tx.roleAssignment.create({
        data: {
          newHireId: hireId,
          title: newPosition,
          fleetPositionSlug: fp?.slug ?? null,
          seat: fp?.seat ?? null,
          aircraft: fp?.aircraft ?? null,
          department: newDepartment,
          startDate: effective,
          endDate: null,
          transitionType,
          notes: clean(input.note)
        }
      });
      createdRoleId = created.id;
      changes.push(`Role journey: ${transitionType.toLowerCase()} to ${newPosition}${newDepartment ? ` (${newDepartment})` : ""}.`);
    }

    // A rehire opens a NEW employment period. Tenure is the sum of the periods
    // (lib/data/tenure), and toRow falls back to a single implicit period built
    // from startDate when none are recorded — so the first period has to be
    // written down before startDate is moved to the return date, or the original
    // service simply disappears.
    if (isRehire) {
      const stints = await tx.employmentStint.findMany({ where: { newHireId: hireId }, orderBy: { startDate: "asc" } });
      const firstEnd = hire.terminationDate ?? effective;
      if (stints.length === 0 && hire.startDate) {
        await tx.employmentStint.create({
          data: { newHireId: hireId, startDate: hire.startDate, endDate: firstEnd, note: "Recorded when the rehire was entered" }
        });
        changes.push("Recorded their original employment period so tenure keeps counting it.");
      } else {
        const open = stints.find((s) => s.endDate === null);
        if (open) {
          await tx.employmentStint.update({ where: { id: open.id }, data: { endDate: firstEnd } });
          closedStintId = open.id;
        }
      }
      const newStint = await tx.employmentStint.create({
        data: { newHireId: hireId, startDate: effective, endDate: null, note: clean(input.note) }
      });
      createdStintId = newStint.id;
      changes.push("Opened a new employment period from the rehire date.");
    }

    const archive = await tx.onboardingArchive.create({
      data: {
        newHireId: hireId,
        sequence,
        reason: input.reason,
        note: clean(input.note),
        roundReason: hire.onboardingReason,
        roundStartedAt: hire.onboardingRoundStartedAt,
        position: hire.position,
        department: hire.department,
        stage: hire.stage,
        employmentStatus: hire.employmentStatus,
        startDate: hire.startDate,
        offerSentDate: hire.offerSentDate,
        offerSignedDate: hire.offerSignedDate,
        orientationDate: hire.orientationDate,
        onboardedAt: hire.onboardedAt,
        businessCardStatus: hire.businessCardStatus,
        tasksJson: JSON.stringify(snapshot),
        doneCount,
        totalCount: snapshot.length,
        archivedBy: clean(input.archivedBy),
        restorable: true,
        createdRoleId,
        closedRoleId,
        createdStintId,
        closedStintId
      }
    });
    // Only the newest archive can be undone, so an undo can never quietly rewind
    // two rounds at once.
    await tx.onboardingArchive.updateMany({
      where: { newHireId: hireId, id: { not: archive.id } },
      data: { restorable: false }
    });

    await tx.onboardingTask.deleteMany({ where: { newHireId: hireId } });
    await tx.onboardingTask.createMany({
      data: ONBOARDING_TASKS.map((t, i) => {
        const carried = carryOver.has(t.key);
        const previously = completedByKey.get(t.key) ?? null;
        return {
          newHireId: hireId,
          key: t.key,
          label: t.label,
          group: t.group,
          order: i,
          status: carried ? "DONE" : "TODO",
          // Keep the date it was ACTUALLY done, so a carried-over tick never
          // claims work happened today that happened months ago.
          completedAt: carried ? (previously ? new Date(previously) : new Date()) : null
        };
      })
    });

    await tx.newHire.update({
      where: { id: hireId },
      data: {
        stage: "ACTIVE",
        onboardedAt: null,
        canceled: false,
        onboardingReason: input.reason,
        onboardingRoundStartedAt: effective,
        position: newPosition,
        department: newDepartment,
        // These belong to the round that was just archived. Blank for the new one.
        offerSentDate: null,
        offerSignedDate: null,
        orientationDate: null,
        // A new title means the old card is wrong. NOT_NEEDED is a deliberate
        // choice about the person, so it is left standing.
        ...(hire.businessCardStatus === "NOT_NEEDED" ? {} : { businessCardStatus: "NEEDED" }),
        ...(isRehire ? { employmentStatus: "ACTIVE", terminationDate: null, startDate: effective } : {})
      }
    });

    return archive;
  });

  changes.unshift(
    `Archived their previous checklist (${doneCount} of ${snapshot.length} complete) as round ${sequence}.`,
    `Started a fresh ${ONBOARDING_TASKS.length}-item checklist${carryOver.size ? ` with ${carryOver.size} item${carryOver.size === 1 ? "" : "s"} carried over as already done` : ""}.`,
    "Moved them back into New hires (in onboarding)."
  );
  if (!isRehire) changes.push("Hire date and tenure left untouched — this is the same period of employment.");

  return {
    ok: true,
    archiveId: result.id,
    sequence,
    taskCount: ONBOARDING_TASKS.length,
    carriedOver: carryOver.size,
    changes
  };
}

export type UpdateArchiveInput = {
  /** Per-task corrections, by key. Omitted keys are left alone. */
  tasks?: Array<{ key: string; status?: string; completedAt?: string | null }>;
  // What they were DURING this round. The archive takes these from the profile at
  // the moment the new round starts, which is wrong whenever the new title was
  // already typed in before anyone pressed the button — the round then labels
  // itself with the job it was replaced by.
  position?: string | null;
  department?: string | null;
  startDate?: string | null;
  offerSentDate?: string | null;
  offerSignedDate?: string | null;
  orientationDate?: string | null;
  onboardedAt?: string | null;
};

const TASK_STATUSES = new Set(["TODO", "DONE", "NA"]);

/** A date-only input ("2026-04-20") becomes UTC midnight, matching every other date here. */
function parseDayOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * Correct an archived round after the fact.
 *
 * An archive is a frozen copy, which is exactly the problem it creates: whatever
 * the checklist happened to say the moment the new round started is what got
 * frozen, including anything ticked that day to catch the record up. Reconstructing
 * "when did this actually happen" is a human job, so the dates have to be editable.
 *
 * Only the dates and statuses move. Which tasks the round contained, its sequence,
 * who archived it and when are the record of what the system did, and stay put.
 */
export async function updateArchivedRound(
  hireId: string,
  archiveId: string,
  input: UpdateArchiveInput
): Promise<{ ok: true; doneCount: number; totalCount: number }> {
  const archive = await prisma.onboardingArchive.findUnique({ where: { id: archiveId } });
  if (!archive || archive.newHireId !== hireId) throw new Error("That archived round does not belong to this employee.");

  const tasks = parseArchivedTasks(archive.tasksJson);
  const edits = new Map((input.tasks ?? []).map((t) => [t.key, t] as const));
  const next: ArchivedTask[] = tasks.map((t) => {
    const edit = edits.get(t.key);
    if (!edit) return t;
    const status = edit.status && TASK_STATUSES.has(edit.status) ? edit.status : t.status;
    const completedAt = parseDayOrNull(edit.completedAt);
    return {
      ...t,
      status,
      // A date on something not marked done is noise, and a done item with no date
      // is fine (we simply don't know when) — so only DONE keeps a date.
      completedAt: status === "DONE" ? (completedAt === undefined ? t.completedAt : completedAt?.toISOString() ?? null) : null
    };
  });

  const doneCount = next.filter((t) => t.status === "DONE").length;
  const fields: Record<string, Date | string | null> = {};
  for (const field of ["startDate", "offerSentDate", "offerSignedDate", "orientationDate", "onboardedAt"] as const) {
    const parsed = parseDayOrNull(input[field]);
    if (parsed !== undefined) fields[field] = parsed;
  }
  for (const field of ["position", "department"] as const) {
    if (input[field] !== undefined) fields[field] = clean(input[field]);
  }

  await prisma.onboardingArchive.update({
    where: { id: archiveId },
    data: { tasksJson: JSON.stringify(next), doneCount, totalCount: next.length, ...fields }
  });

  return { ok: true, doneCount, totalCount: next.length };
}

/**
 * Undo the most recent round: put the archived checklist and profile back, and
 * unwind the role/employment rows the start created. The current (new) checklist
 * is discarded — it has only just been created, so there is nothing in it worth
 * keeping, but the caller is expected to say so out loud before calling.
 */
export async function restoreOnboardingRound(hireId: string, archiveId: string): Promise<{ ok: true; restoredTasks: number }> {
  const archive = await prisma.onboardingArchive.findUnique({ where: { id: archiveId } });
  if (!archive || archive.newHireId !== hireId) throw new Error("That archived round does not belong to this employee.");
  if (!archive.restorable) throw new Error("Only the most recent archived round can be undone.");

  const tasks = parseArchivedTasks(archive.tasksJson);

  await prisma.$transaction(async (tx) => {
    await tx.onboardingTask.deleteMany({ where: { newHireId: hireId } });
    if (tasks.length) {
      await tx.onboardingTask.createMany({
        data: tasks.map((t) => ({
          newHireId: hireId,
          key: t.key,
          label: t.label,
          group: t.group,
          order: t.order,
          status: t.status,
          completedAt: t.completedAt ? new Date(t.completedAt) : null
        }))
      });
    }

    await tx.newHire.update({
      where: { id: hireId },
      data: {
        stage: archive.stage ?? "POST_ONBOARD",
        employmentStatus: archive.employmentStatus ?? "ACTIVE",
        onboardedAt: archive.onboardedAt,
        startDate: archive.startDate,
        offerSentDate: archive.offerSentDate,
        offerSignedDate: archive.offerSignedDate,
        orientationDate: archive.orientationDate,
        position: archive.position,
        department: archive.department,
        businessCardStatus: archive.businessCardStatus ?? "NEEDED",
        onboardingReason: archive.roundReason,
        onboardingRoundStartedAt: archive.roundStartedAt
      }
    });

    // Inverse of what the start wrote: delete the rows it created, reopen the
    // ones it closed. Both ids are null when the start didn't touch them.
    if (archive.createdRoleId) await tx.roleAssignment.deleteMany({ where: { id: archive.createdRoleId } });
    if (archive.closedRoleId) await tx.roleAssignment.updateMany({ where: { id: archive.closedRoleId }, data: { endDate: null } });
    if (archive.createdStintId) await tx.employmentStint.deleteMany({ where: { id: archive.createdStintId } });
    if (archive.closedStintId) await tx.employmentStint.updateMany({ where: { id: archive.closedStintId }, data: { endDate: null } });

    await tx.onboardingArchive.delete({ where: { id: archive.id } });
    // The round before this one becomes undoable again.
    if (archive.sequence > 1) {
      await tx.onboardingArchive.updateMany({
        where: { newHireId: hireId, sequence: archive.sequence - 1 },
        data: { restorable: true }
      });
    }
  });

  return { ok: true, restoredTasks: tasks.length };
}
