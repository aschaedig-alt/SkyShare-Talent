import { prisma } from "@/lib/prisma";

/**
 * Combine a hand-made application row INTO the imported Paycom row for the same
 * job, leaving one row — and keep enough to put it back exactly.
 *
 * WHY ONE FUNCTION. There are two callers: the profile page's "combine" answer
 * (app/api/candidate-applications/[id]/job/route.ts) and the bulk run that
 * cleared the 183 duplicates (scripts/paycom-app-job-link.ts --combine). Until
 * 2026-09-23 the combine lived inline in the route, and a second copy in the
 * script would have been two definitions of "what survives a combine" that drift
 * the first time either is touched.
 *
 * WHAT SURVIVES. The imported row: it keeps Paycom's application id, date and
 * wording, which is what the stage reconciliation matches on. It takes from the
 * hand-made row the questionnaire answers, the requirement link, the note,
 * recruiter and hiring manager, a status somebody set by hand (newer than the
 * import's snapshot), and the offer when it has none of its own. Refused when BOTH
 * rows carry an offer: which one is real is a judgement, not a merge rule.
 *
 * THE OFFER DETAILS GO WITH THE OFFER. The HR-only offer-details text (the one
 * place pay is allowed — see OfferDetailsBox) lives on whichever row holds the
 * offer. The first version of this combine predates that box and would have
 * deleted the text with the hand-made row. It moves across now whenever the
 * imported row has none, and it is in the undo record either way.
 *
 * THE UNDO RECORD is the whole deleted row plus the imported row's overwritten
 * fields as they were, plus which answers moved. undoCombine replays it. The
 * activity log is written by the callers and carries none of the offer-details
 * text, because that log is read outside HR.
 */

/** A status nobody chose — what Link to a job and resume intake write by default. */
export const DEFAULT_APPLICATION_STATUSES = new Set(["", "new"]);

/** Every field the combine may write on the surviving row. The undo restores exactly these. */
const OVERWRITTEN = [
  "jobId",
  "pilotRequirementId",
  "statusNote",
  "recruiterName",
  "hiringManager",
  "rejectionReason",
  "status",
  "stage",
  "decidedAt",
  "offerStatus",
  "offerSentAt",
  "offerSignedAt",
  "offerDeclinedAt",
  "offerDeclineReason",
  "offerNotSentAt",
  "offerNotSentReason",
  "offerStartDate",
  "offerSource",
  "offerStepsJson",
  "offerDetailsText",
  "offerDetailsAt",
  "offerDetailsBy"
] as const;

type Row = NonNullable<Awaited<ReturnType<typeof prisma.candidateApplication.findUnique>>>;

export type CombineUndo = {
  combinedAt: string;
  importedId: string;
  /** The survivor's overwritten fields, as they were before. */
  importedBefore: Partial<Record<(typeof OVERWRITTEN)[number], unknown>>;
  /** Every column of the row that was deleted, so it can be recreated with its own id. */
  removedRow: Record<string, unknown>;
  movedAnswerIds: string[];
};

export type CombineSuccess = {
  ok: true;
  tookOffer: boolean;
  tookStatus: boolean;
  removed: Pick<Row, "id" | "source" | "status" | "stage" | "appliedAt" | "offerStatus" | "offerStepsJson">;
  undo: CombineUndo;
};
export type CombineRefusal = { ok: false; reason: "not-found" | "different-people" | "wrong-job" | "both-offers"; message: string };
export type CombineOutcome = CombineSuccess | CombineRefusal;

/**
 * This repo compiles with strict off, and without strictNullChecks a check on
 * `!outcome.ok` does not narrow the union — the compiler then refuses
 * outcome.message. A type guard narrows either way.
 */
export function isCombineRefusal(outcome: CombineOutcome): outcome is CombineRefusal {
  return outcome.ok === false;
}

export async function combineIntoImported(importedId: string, handMadeId: string, jobId: string): Promise<CombineOutcome> {
  return prisma.$transaction(async (tx) => {
    const [imported, handMade] = await Promise.all([
      tx.candidateApplication.findUnique({ where: { id: importedId } }),
      tx.candidateApplication.findUnique({ where: { id: handMadeId } })
    ]);
    if (!imported || !handMade) {
      return { ok: false as const, reason: "not-found" as const, message: "One of the two rows no longer exists." };
    }
    if (imported.candidateId !== handMade.candidateId) {
      return { ok: false as const, reason: "different-people" as const, message: "The two rows belong to different people." };
    }
    // Read inside the transaction, so a row a person re-pointed since the plan was
    // made is refused rather than combined into the wrong job.
    if (handMade.jobId !== jobId || (imported.jobId !== null && imported.jobId !== jobId)) {
      return { ok: false as const, reason: "wrong-job" as const, message: "One of the rows is no longer on that job." };
    }
    const importedHasOffer = imported.offerStatus !== "NONE";
    const handMadeHasOffer = handMade.offerStatus !== "NONE";
    if (importedHasOffer && handMadeHasOffer) {
      return {
        ok: false as const,
        reason: "both-offers" as const,
        message: "Both rows carry an offer, so they cannot be combined automatically — remove the one that is wrong first."
      };
    }
    const tookOffer = handMadeHasOffer && !importedHasOffer;
    const tookStatus = !DEFAULT_APPLICATION_STATUSES.has((handMade.status ?? "").trim().toLowerCase());
    const takeDetails = !imported.offerDetailsText && Boolean(handMade.offerDetailsText);

    const answers = await tx.candidateQuestionnaireAnswer.findMany({ where: { applicationId: handMade.id }, select: { id: true } });
    const importedBefore = Object.fromEntries(OVERWRITTEN.map((k) => [k, imported[k]])) as CombineUndo["importedBefore"];

    await tx.candidateQuestionnaireAnswer.updateMany({ where: { applicationId: handMade.id }, data: { applicationId: imported.id } });
    await tx.candidateApplication.delete({ where: { id: handMade.id } });
    await tx.candidateApplication.update({
      where: { id: imported.id },
      data: {
        jobId,
        pilotRequirementId: imported.pilotRequirementId ?? handMade.pilotRequirementId,
        statusNote: imported.statusNote ?? handMade.statusNote,
        recruiterName: imported.recruiterName ?? handMade.recruiterName,
        hiringManager: imported.hiringManager ?? handMade.hiringManager,
        rejectionReason: imported.rejectionReason ?? handMade.rejectionReason,
        // A status somebody picked in the app is newer than the import's snapshot.
        ...(tookStatus ? { status: handMade.status, stage: handMade.stage ?? imported.stage, decidedAt: handMade.decidedAt ?? imported.decidedAt } : {}),
        ...(tookOffer
          ? {
              offerStatus: handMade.offerStatus,
              offerSentAt: handMade.offerSentAt,
              offerSignedAt: handMade.offerSignedAt,
              offerDeclinedAt: handMade.offerDeclinedAt,
              offerDeclineReason: handMade.offerDeclineReason,
              offerNotSentAt: handMade.offerNotSentAt,
              offerNotSentReason: handMade.offerNotSentReason,
              offerStartDate: handMade.offerStartDate,
              offerSource: handMade.offerSource,
              offerStepsJson: handMade.offerStepsJson
            }
          : {}),
        ...(takeDetails
          ? { offerDetailsText: handMade.offerDetailsText, offerDetailsAt: handMade.offerDetailsAt, offerDetailsBy: handMade.offerDetailsBy }
          : {})
      }
    });

    return {
      ok: true as const,
      tookOffer,
      tookStatus,
      removed: {
        id: handMade.id,
        source: handMade.source,
        status: handMade.status,
        stage: handMade.stage,
        appliedAt: handMade.appliedAt,
        offerStatus: handMade.offerStatus,
        offerStepsJson: handMade.offerStepsJson
      },
      undo: {
        combinedAt: new Date().toISOString(),
        importedId: imported.id,
        importedBefore,
        removedRow: { ...handMade },
        movedAnswerIds: answers.map((a) => a.id)
      }
    };
  });
}

/**
 * Put one combine back: the survivor's fields as they were, the deleted row
 * recreated under its own id, and its answers returned to it. Idempotent — a row
 * that already exists again is not recreated, and a survivor somebody has since
 * deleted is reported rather than resurrected.
 */
export async function undoCombine(record: CombineUndo): Promise<{ restored: boolean; note?: string }> {
  return prisma.$transaction(async (tx) => {
    const survivor = await tx.candidateApplication.findUnique({ where: { id: record.importedId }, select: { id: true } });
    const removedId = String(record.removedRow.id);
    const already = await tx.candidateApplication.findUnique({ where: { id: removedId }, select: { id: true } });
    if (already) return { restored: false, note: `row ${removedId} already exists — this combine was undone before` };
    if (!survivor) return { restored: false, note: `row ${record.importedId} has since been deleted — nothing to split` };

    await tx.candidateApplication.update({
      where: { id: record.importedId },
      data: record.importedBefore as Parameters<typeof tx.candidateApplication.update>[0]["data"]
    });
    await tx.candidateApplication.create({
      data: record.removedRow as Parameters<typeof tx.candidateApplication.create>[0]["data"]
    });
    if (record.movedAnswerIds.length) {
      await tx.candidateQuestionnaireAnswer.updateMany({
        where: { id: { in: record.movedAnswerIds }, applicationId: record.importedId },
        data: { applicationId: removedId }
      });
    }
    return { restored: true };
  });
}
