"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth/route-auth";
import { logActivity } from "@/lib/activity/logger";
import { parseStringArray } from "@/lib/json";
import { createPilotRequirementGates, detectSeat, extractAircraftTypes } from "@/lib/imports/job-import";
import { resolveRequirementHome } from "@/lib/data/pilot-requirements";

// Writes made from a job's Pilot requirement tab.
//
// Server actions POST to the PAGE path, so requireApiPermission's per-user module
// check sees /recruiting-jobs/... and gates these on the Jobs area, which is where
// they are used.
//
// TWO GATES, and which is which was his call.
//
// The Role save (saveRequirementRole) needs jobs:write - admins AND recruiters. It
// writes a requirement's operator, seat, aircraft, base and pay text. Those were
// admin-only until 2026-09-23, when he answered the question directly: "yes they
// should be able to but keep a history of who changed what". The history is the
// PilotRequirementChange row every save writes - who, when, and each field's old
// and new value - which the tab's Change history shows. Hiring managers and
// viewers hold neither permission and still see the Role read-only.
//
// Everything else here - the status match, set up and attach - still needs
// requirements:write, the gate the old requirement editor and New requirement
// button used (admins). He was asked about the five Role fields only.

export type RequirementActionResult = { ok: boolean; error?: string; id?: string; unchanged?: boolean };

// The same values the requirement schema accepts (lib/validation/pilot-requirement.ts).
const SEATS = ["PIC", "SIC", "Lead PIC", "Chief Pilot", "Assistant Chief Pilot", "Mixed"];
const OPERATORS = ["SkyShare", "Managed"];

const REFUSED = "You do not have permission to change this role.";

function clean(value: string | null | undefined, max: number): string | null {
  const text = (value ?? "").trim();
  return text ? text.slice(0, max) : null;
}

function cleanAircraft(list: string[] | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list ?? []) {
    const value = String(raw ?? "").trim().slice(0, 80);
    const key = value.toLowerCase();
    if (!value || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out.slice(0, 20);
}

function sameList(a: string[], b: string[]) {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function actor(permission: "requirements:write" | "jobs:write" = "requirements:write"): Promise<{ id: string | null; email: string | null } | null> {
  const auth = await requireApiPermission(permission);
  if (!auth.ok) return null;
  return { id: auth.user.id, email: auth.user.email };
}

function refreshJobPages(jobId: string | null) {
  if (jobId) revalidatePath(`/recruiting-jobs/${jobId}`);
  revalidatePath("/recruiting-jobs");
  revalidatePath("/matching");
}

/**
 * The Role block's save: operator, seat, aircraft, base and pay.
 *
 * THE ONE PLACE seat, aircraft and base are edited for a job that has a
 * requirement. They are stored on both rows — the job's copy was edited by the
 * job's classification editor and details line, the requirement's by the
 * requirement editor, neither wrote the other, and the Matchboard scores from the
 * requirement. So the two drifted: 9 of 20 pairs listed different aircraft when
 * measured. This writes both rows in one transaction, so they cannot.
 *
 * The pair is worked out HERE from the requirement's own link, never from the
 * caller: only a requirement whose job was not merged away has a job row to keep
 * in step. One left behind by a merge, or with no job at all, saves on its own.
 *
 * Operator and pay live on the requirement only.
 */
export async function saveRequirementRole(input: {
  requirementId: string;
  /** The job page this was saved from, for refreshing it. */
  jobId: string | null;
  operatorType: string | null;
  pilotSeat: string | null;
  aircraftTypes: string[];
  baseAirport: string | null;
  baseCity: string | null;
  baseState: string | null;
  payScaleRaw: string | null;
  note?: string | null;
}): Promise<RequirementActionResult> {
  // Recruiters too (his call, 2026-09-23) - see the top of this file.
  const who = await actor("jobs:write");
  if (!who) return { ok: false, error: REFUSED };
  if (!input?.requirementId) return { ok: false, error: "Missing requirement." };

  const operatorType = input.operatorType && OPERATORS.includes(input.operatorType) ? input.operatorType : null;
  if (input.operatorType && !operatorType) return { ok: false, error: "Unknown operator." };
  const pilotSeat = input.pilotSeat && SEATS.includes(input.pilotSeat) ? input.pilotSeat : null;
  if (input.pilotSeat && !pilotSeat) return { ok: false, error: "Unknown seat." };
  const aircraft = cleanAircraft(input.aircraftTypes);
  const baseAirport = clean(input.baseAirport, 16)?.toUpperCase() ?? null;
  const baseCity = clean(input.baseCity, 100);
  const baseState = clean(input.baseState, 50);
  const payScaleRaw = clean(input.payScaleRaw, 300);
  const note = clean(input.note, 500);

  const requirement = await prisma.pilotRequirement.findUnique({
    where: { id: input.requirementId },
    select: {
      id: true,
      title: true,
      operatorType: true,
      pilotSeat: true,
      aircraftTypesJson: true,
      baseAirport: true,
      baseCity: true,
      baseState: true,
      payScaleRaw: true,
      sourceJobRecord: {
        select: { id: true, title: true, mergedIntoJobId: true, pilotSeat: true, aircraftTypesJson: true, city: true, state: true }
      }
    }
  });
  if (!requirement) return { ok: false, error: "That requirement no longer exists." };

  const job = requirement.sourceJobRecord && !requirement.sourceJobRecord.mergedIntoJobId ? requirement.sourceJobRecord : null;
  const beforeAircraft = parseStringArray(requirement.aircraftTypesJson);
  const changed = {
    operatorType: requirement.operatorType !== operatorType,
    pilotSeat: requirement.pilotSeat !== pilotSeat,
    aircraftTypes: !sameList(beforeAircraft, aircraft),
    baseAirport: requirement.baseAirport !== baseAirport,
    baseCity: requirement.baseCity !== baseCity,
    baseState: requirement.baseState !== baseState,
    payScaleRaw: requirement.payScaleRaw !== payScaleRaw
  };
  const jobBefore = job
    ? { pilotSeat: job.pilotSeat, aircraftTypes: parseStringArray(job.aircraftTypesJson), city: job.city, state: job.state }
    : null;
  const jobChanged = Boolean(
    jobBefore &&
      (jobBefore.pilotSeat !== pilotSeat ||
        !sameList(jobBefore.aircraftTypes, aircraft) ||
        jobBefore.city !== baseCity ||
        jobBefore.state !== baseState)
  );
  if (!Object.values(changed).some(Boolean) && !jobChanged) {
    return { ok: true, unchanged: true };
  }

  const aircraftTypesJson = aircraft.length > 0 ? JSON.stringify(aircraft) : null;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.pilotRequirement.update({
        where: { id: requirement.id },
        data: {
          operatorType,
          pilotSeat,
          aircraftTypesJson,
          baseAirport,
          baseCity,
          baseState,
          payScaleRaw,
          requirementVersion: { increment: 1 }
        }
      });
      if (job && jobChanged) {
        await tx.job.update({
          where: { id: job.id },
          data: { pilotSeat, aircraftTypesJson, city: baseCity, state: baseState }
        });
      }
      // Same row shape the requirement editor writes, so one history reads both.
      await tx.pilotRequirementChange.create({
        data: {
          pilotRequirementId: requirement.id,
          changeNote: note ?? (job ? "Role saved to the job and its requirement together." : "Role saved."),
          changedFieldsJson: JSON.stringify({ ...changed, jobChanged }),
          previousValuesJson: JSON.stringify({
            operatorType: requirement.operatorType,
            pilotSeat: requirement.pilotSeat,
            aircraftTypes: beforeAircraft,
            baseAirport: requirement.baseAirport,
            baseCity: requirement.baseCity,
            baseState: requirement.baseState,
            payScaleRaw: requirement.payScaleRaw,
            job: jobBefore ? { id: job?.id, ...jobBefore } : null
          }),
          newValuesJson: JSON.stringify({
            operatorType,
            pilotSeat,
            aircraftTypes: aircraft,
            baseAirport,
            baseCity,
            baseState,
            payScaleRaw,
            job: job ? { id: job.id, pilotSeat, aircraftTypes: aircraft, city: baseCity, state: baseState } : null
          }),
          changedBy: who.email ?? "local-user"
        }
      });
    });
  } catch {
    return { ok: false, error: "Could not save the role." };
  }

  if (job && jobChanged) {
    // The job's own log gets the change too, with the old values, the same way
    // the job's details line logs a location edit.
    await logActivity({
      userId: who.id ?? undefined,
      userEmail: who.email ?? undefined,
      activityType: "JOB_EDITED",
      description: `Saved the role on the job "${job.title}" from its Pilot requirement tab (seat, aircraft and base now match its requirement)`,
      entityType: "Job",
      entityId: job.id,
      metadata: {
        previousSeat: jobBefore?.pilotSeat ?? null,
        previousAircraft: jobBefore?.aircraftTypes ?? [],
        previousCity: jobBefore?.city ?? null,
        previousState: jobBefore?.state ?? null
      }
    });
  }

  refreshJobPages(input.jobId ?? job?.id ?? null);
  return { ok: true };
}

/**
 * Bring a requirement's status in line with its job's: inactive while the job is
 * closed, active while it is open.
 *
 * Job status and requirement status stay separate ON PURPOSE — a managed seat can
 * stay on the Matchboard after the job posting closes — so nothing does this on
 * its own; the tab flags the mismatch and a person presses this. Only those two
 * moves are allowed, which is what keeps it from being a general status editor
 * outside the requirement editor.
 */
export async function matchRequirementStatusToJob(input: {
  requirementId: string;
  jobId: string;
}): Promise<RequirementActionResult> {
  const who = await actor();
  if (!who) return { ok: false, error: REFUSED };
  if (!input?.requirementId || !input?.jobId) return { ok: false, error: "Missing requirement or job." };

  const home = await resolveRequirementHome(input.requirementId);
  if (home.jobId !== input.jobId) return { ok: false, error: "That requirement does not belong to this job." };

  const [requirement, job] = await Promise.all([
    prisma.pilotRequirement.findUnique({ where: { id: input.requirementId }, select: { id: true, status: true } }),
    prisma.job.findUnique({ where: { id: input.jobId }, select: { id: true, title: true, status: true } })
  ]);
  if (!requirement || !job) return { ok: false, error: "That requirement or job no longer exists." };

  const jobOpen = job.status === "OPEN";
  const target = jobOpen ? "ACTIVE" : "INACTIVE";
  if (requirement.status === target) return { ok: true, unchanged: true };
  const allowed = jobOpen ? requirement.status === "INACTIVE" : requirement.status === "ACTIVE";
  if (!allowed) return { ok: false, error: "Use Edit requirement to change this status." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pilotRequirement.update({
        where: { id: requirement.id },
        data: { status: target, requirementVersion: { increment: 1 } }
      });
      await tx.pilotRequirementChange.create({
        data: {
          pilotRequirementId: requirement.id,
          changeNote: jobOpen
            ? "Made active to match its job, which is open."
            : "Made inactive to match its job, which is closed. It is off the Matchboard now.",
          changedFieldsJson: JSON.stringify({ status: true }),
          previousValuesJson: JSON.stringify({ status: requirement.status }),
          newValuesJson: JSON.stringify({ status: target }),
          changedBy: who.email ?? "local-user"
        }
      });
    });
  } catch {
    return { ok: false, error: "Could not change the requirement status." };
  }

  refreshJobPages(job.id);
  return { ok: true };
}

/**
 * "Set one up": a requirement for a pilot job that has none, built from the job.
 *
 * The same recipe the job endpoint uses when a support job is switched to pilot
 * (seat, aircraft, base, pay and posting text copied from the job; the standard
 * gates switched on from the posting), with one difference: the status follows
 * the job, so setting one up on a closed job does not put it on the Matchboard.
 */
export async function createRequirementForJob(input: { jobId: string }): Promise<RequirementActionResult> {
  const who = await actor();
  if (!who) return { ok: false, error: REFUSED };
  if (!input?.jobId) return { ok: false, error: "Missing job." };

  const job = await prisma.job.findUnique({
    where: { id: input.jobId },
    select: {
      id: true,
      title: true,
      status: true,
      isPilotRole: true,
      mergedIntoJobId: true,
      pilotSeat: true,
      aircraftTypesJson: true,
      city: true,
      state: true,
      rawPayScale: true,
      rawMinimumRequirements: true,
      jobDescriptionText: true,
      rawJobDescriptionHtml: true,
      _count: { select: { pilotRequirements: true } }
    }
  });
  if (!job || job.mergedIntoJobId) return { ok: false, error: "That job no longer exists." };
  if (!job.isPilotRole) return { ok: false, error: "Only a pilot job has a pilot requirement." };
  if (job._count.pilotRequirements > 0) return { ok: false, error: "This job already has a requirement. Reload the page." };

  const sourceText = job.rawMinimumRequirements || job.jobDescriptionText || "";
  const jobAircraft = parseStringArray(job.aircraftTypesJson);
  const aircraft = jobAircraft.length > 0 ? jobAircraft : extractAircraftTypes(`${job.title}\n${sourceText}`);

  let requirementId: string;
  try {
    const requirement = await prisma.pilotRequirement.create({
      data: {
        sourceJobRecordId: job.id,
        title: job.title,
        normalizedTitle: job.title.trim().toLowerCase(),
        status: job.status === "OPEN" ? "ACTIVE" : "INACTIVE",
        reviewStatus: "DRAFT",
        operatorType: "SkyShare",
        roleCategory: "Pilot",
        pilotSeat: job.pilotSeat ?? detectSeat(job.title),
        aircraftTypesJson: aircraft.length > 0 ? JSON.stringify(aircraft) : null,
        baseCity: job.city,
        baseState: job.state,
        payScaleRaw: job.rawPayScale,
        rawMinimumRequirements: job.rawMinimumRequirements,
        originalJobDescriptionText: sourceText || null,
        originalJobDescriptionHtml: job.rawJobDescriptionHtml,
        extractionConfidence: 80,
        extractionWarningsJson: JSON.stringify(["Set up from the job. Check the hours and certificates against the posting before relying on screening."]),
        sourceHistoryJson: JSON.stringify([{ type: "set-up-from-job", jobId: job.id, by: who.email, createdAt: new Date().toISOString() }])
      },
      select: { id: true }
    });
    requirementId = requirement.id;
    await createPilotRequirementGates(requirementId, `${job.title}\n${sourceText}`);
    await prisma.pilotRequirementChange.create({
      data: {
        pilotRequirementId: requirementId,
        changeNote: `Set up from the job "${job.title}".`,
        changedFieldsJson: JSON.stringify({ created: true }),
        changedBy: who.email ?? "local-user"
      }
    });
  } catch {
    return { ok: false, error: "Could not set up the requirement." };
  }

  await logActivity({
    userId: who.id ?? undefined,
    userEmail: who.email ?? undefined,
    activityType: "JOB_EDITED",
    description: `Set up a pilot requirement for the job "${job.title}"`,
    entityType: "Job",
    entityId: job.id,
    metadata: { requirementId }
  });

  refreshJobPages(job.id);
  return { ok: true, id: requirementId };
}

/**
 * Attach an existing requirement that has no job to this job — the suggestion the
 * tab makes when a job has none and one looks like its match. A person presses
 * it; nothing is ever attached on a guess.
 *
 * Only the link changes. If the job and the requirement then disagree on seat,
 * aircraft or base, the Role block shows both and the person picks.
 */
export async function attachRequirementToJob(input: {
  requirementId: string;
  jobId: string;
}): Promise<RequirementActionResult> {
  const who = await actor();
  if (!who) return { ok: false, error: REFUSED };
  if (!input?.requirementId || !input?.jobId) return { ok: false, error: "Missing requirement or job." };

  const home = await resolveRequirementHome(input.requirementId);
  if (!home.exists) return { ok: false, error: "That requirement no longer exists." };
  if (home.jobId) return { ok: false, error: "That requirement already belongs to a job. Reload the page." };

  const job = await prisma.job.findUnique({
    where: { id: input.jobId },
    select: { id: true, title: true, isPilotRole: true, mergedIntoJobId: true, _count: { select: { pilotRequirements: true } } }
  });
  if (!job || job.mergedIntoJobId) return { ok: false, error: "That job no longer exists." };
  if (!job.isPilotRole) return { ok: false, error: "Only a pilot job has a pilot requirement." };
  if (job._count.pilotRequirements > 0) return { ok: false, error: "This job already has a requirement. Reload the page." };

  try {
    await prisma.$transaction(async (tx) => {
      await tx.pilotRequirement.update({ where: { id: input.requirementId }, data: { sourceJobRecordId: job.id } });
      await tx.pilotRequirementChange.create({
        data: {
          pilotRequirementId: input.requirementId,
          changeNote: `Attached to the job "${job.title}".`,
          changedFieldsJson: JSON.stringify({ job: true }),
          previousValuesJson: JSON.stringify({ job: null }),
          newValuesJson: JSON.stringify({ job: job.title, jobId: job.id }),
          changedBy: who.email ?? "local-user"
        }
      });
    });
  } catch {
    return { ok: false, error: "Could not attach the requirement." };
  }

  await logActivity({
    userId: who.id ?? undefined,
    userEmail: who.email ?? undefined,
    activityType: "JOB_EDITED",
    description: `Attached an existing pilot requirement to the job "${job.title}"`,
    entityType: "Job",
    entityId: job.id,
    metadata: { requirementId: input.requirementId }
  });

  refreshJobPages(job.id);
  return { ok: true };
}
