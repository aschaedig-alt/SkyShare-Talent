import { prisma } from "@/lib/prisma";

/**
 * Bring an archived candidate back as a current applicant.
 *
 * WHY THIS EXISTS: people re-apply. The archive holds 3,143 candidates, almost
 * all of them historical JazzHR records, and when one of those people sends a
 * new application they are still a live applicant — but every intake path used
 * to leave them archived, so the new document landed on a record nobody can see.
 *
 * That was not hypothetical. Matthew Higginbotham (archived Jun 27, originally a
 * 2024 Jazz record) applied again on Jul 30: resume intake found him by email,
 * attached the new resume and created a fresh application — and left him
 * archived, invisible to the recruiter, with no signal that anything happened.
 *
 * WHAT IT WILL NOT DO:
 *   - resurrect a MERGED record. That person now lives under another id, and
 *     un-archiving the shell would put a known duplicate back in circulation.
 *   - demote a hire. If somebody archived at stage Hired re-applies, the new
 *     document still files and they still come back, but the stage is left
 *     alone rather than rewritten to Applied.
 *
 * status and archivedAt are kept in step deliberately — they agree on all 3,527
 * candidate rows today (0 disagreements), and the archive filters read one or
 * the other depending on the query, so writing only one would half-unarchive
 * somebody.
 *
 * Leaves a candidate note, because a record silently changing state is exactly
 * the kind of thing that should be explainable six months later.
 */

export type ReactivationResult = {
  reactivated: boolean;
  /** Present when reactivated — what they looked like before, for the report. */
  previousStage?: string | null;
  previousArchivedAt?: Date | null;
};

/** The stage a returning applicant lands on. "Applied" is the live-pipeline norm. */
const RETURNING_STAGE = "Applied";

export async function reactivateArchivedCandidate(
  candidateId: string,
  context: { reason: string; source: string; sourceRef?: string | null }
): Promise<ReactivationResult> {
  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { id: true, status: true, stage: true, archivedAt: true, displayName: true }
  });

  // Not archived, gone, or merged — nothing to do, and merged must stay merged.
  if (!candidate || candidate.status === "MERGED") return { reactivated: false };
  if (!candidate.archivedAt && candidate.status !== "ARCHIVED") return { reactivated: false };

  const previousStage = candidate.stage;
  const previousArchivedAt = candidate.archivedAt;
  const keepStage = candidate.stage === "Hired";

  await prisma.$transaction(async (tx) => {
    await tx.candidate.update({
      where: { id: candidateId },
      data: {
        archivedAt: null,
        status: "ACTIVE",
        ...(keepStage ? {} : { stage: RETURNING_STAGE })
      }
    });

    const archivedOn = previousArchivedAt ? previousArchivedAt.toISOString().slice(0, 10) : "an earlier date";
    await tx.candidateNote.create({
      data: {
        candidateId,
        body:
          `Returned to the active pipeline automatically: ${context.reason} ` +
          `They were archived on ${archivedOn}${previousStage ? ` at stage "${previousStage}"` : ""}, ` +
          `and a new application means they are a current applicant again` +
          `${keepStage ? " (stage left as Hired rather than reset)" : `, now at stage "${RETURNING_STAGE}"`}.`,
        source: context.source,
        sourceRef: context.sourceRef ?? null
      }
    });
  });

  return { reactivated: true, previousStage, previousArchivedAt };
}
