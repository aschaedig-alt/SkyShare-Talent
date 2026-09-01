import { prisma } from "@/lib/prisma";

export type CandidateMergeResult = {
  success: boolean;
  message: string;
  moved?: { contacts: number; notes: number; files: number; applications: number; interviews: number; metrics: number };
};

/**
 * Merge the `dropId` candidate into the `keepId` candidate.
 * - Moves contacts, notes, files, applications, interviews, import rows, and
 *   non-conflicting metrics from drop → keep.
 * - Soft-archives the dropped candidate (status MERGED, archivedAt set, pointer
 *   recorded in mergeHistoryJson) rather than hard-deleting, so it's recoverable.
 * - Resolves any open duplicate-review items involving the dropped candidate.
 */
export async function mergeCandidates(
  keepId: string,
  dropId: string,
  actor?: { id?: string | null; email?: string | null }
): Promise<CandidateMergeResult> {
  if (keepId === dropId) {
    return { success: false, message: "Cannot merge a candidate into itself." };
  }

  try {
    const moved = await prisma.$transaction(async (tx) => {
      const [keep, drop] = await Promise.all([
        tx.candidate.findUnique({ where: { id: keepId }, select: { id: true, displayName: true, status: true } }),
        tx.candidate.findUnique({ where: { id: dropId }, select: { id: true, displayName: true, status: true } })
      ]);
      if (!keep || !drop) throw new Error("One or both candidates not found.");
      if (drop.status === "MERGED") throw new Error("That candidate is already merged.");

      // The KEEP side was never checked, and that is how a person ends up with no
      // live record at all.
      //
      // Merging INTO a tombstone was allowed. Do it twice in opposite directions —
      // which is exactly what happens when somebody notices a merge went the wrong
      // way and tries to correct it — and both rows end up MERGED pointing at each
      // other, with neither surviving. Chari Kroeplin was merged Paycom-into-Jazz
      // on 2026-06-27, corrected Jazz-into-Paycom on 2026-07-16, and had no live
      // row from that day on. Nothing surfaced it until merged rows stopped being
      // listed and she disappeared entirely.
      //
      // Refusing is deliberate rather than silently following the chain to its end:
      // a merged keeper means somebody is working from a stale view of who is real,
      // and quietly redirecting the merge somewhere they did not choose is how the
      // wrong records get combined.
      if (keep.status === "MERGED") {
        throw new Error(
          `"${keep.displayName}" has already been merged into another record, so it cannot be the one you keep. ` +
            `Open it to find the surviving record and merge into that instead, or reactivate it first if it is the real one.`
        );
      }

      const [contacts, notes, files, applications, interviews] = await Promise.all([
        tx.candidateContact.updateMany({ where: { candidateId: dropId }, data: { candidateId: keepId } }),
        tx.candidateNote.updateMany({ where: { candidateId: dropId }, data: { candidateId: keepId } }),
        tx.candidateFile.updateMany({ where: { candidateId: dropId }, data: { candidateId: keepId } }),
        tx.candidateApplication.updateMany({ where: { candidateId: dropId }, data: { candidateId: keepId } }),
        tx.interview.updateMany({ where: { candidateId: dropId }, data: { candidateId: keepId } })
      ]);
      await tx.importRow.updateMany({ where: { candidateId: dropId }, data: { candidateId: keepId } });

      // Metrics have a unique (candidateId, key); move only keys the keeper lacks.
      const keepKeys = new Set((await tx.candidateMetric.findMany({ where: { candidateId: keepId }, select: { key: true } })).map((m) => m.key));
      const dropMetrics = await tx.candidateMetric.findMany({ where: { candidateId: dropId }, select: { id: true, key: true } });
      let metricsMoved = 0;
      for (const m of dropMetrics) {
        if (keepKeys.has(m.key)) {
          await tx.candidateMetric.delete({ where: { id: m.id } });
        } else {
          await tx.candidateMetric.update({ where: { id: m.id }, data: { candidateId: keepId } });
          metricsMoved += 1;
        }
      }

      // Soft-archive the dropped candidate.
      await tx.candidate.update({
        where: { id: dropId },
        data: {
          status: "MERGED",
          archivedAt: new Date(),
          mergeHistoryJson: JSON.stringify({
            mergedIntoCandidateId: keepId,
            mergedAt: new Date().toISOString(),
            byUserId: actor?.id ?? null,
            byEmail: actor?.email ?? null
          })
        }
      });

      // Resolve any open review items that involve the dropped candidate.
      await tx.duplicateReviewItem.updateMany({
        where: {
          status: "OPEN",
          OR: [{ primaryCandidateId: dropId }, { secondaryCandidateId: dropId }]
        },
        data: { status: "RESOLVED", resolvedAt: new Date() }
      });

      await tx.auditEvent.create({
        data: {
          actorId: actor?.id ?? null,
          eventType: "CANDIDATE_MERGED",
          entityType: "Candidate",
          entityId: keepId,
          summary: `Merged ${drop.displayName} into candidate ${keepId}.`,
          payloadJson: JSON.stringify({ keepId, dropId, byEmail: actor?.email ?? null })
        }
      });

      return {
        contacts: contacts.count,
        notes: notes.count,
        files: files.count,
        applications: applications.count,
        interviews: interviews.count,
        metrics: metricsMoved
      };
    });

    return {
      success: true,
      message: `Merged. Moved ${moved.files} file(s), ${moved.applications} application(s), ${moved.interviews} interview(s), ${moved.notes} note(s).`,
      moved
    };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Merge failed." };
  }
}

export async function dismissDuplicateReview(itemId: string): Promise<{ success: boolean; message: string }> {
  try {
    await prisma.duplicateReviewItem.update({
      where: { id: itemId },
      data: { status: "DISMISSED", reason: "Marked not a duplicate", resolvedAt: new Date() }
    });
    return { success: true, message: "Marked as not a duplicate." };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : "Unable to update." };
  }
}
