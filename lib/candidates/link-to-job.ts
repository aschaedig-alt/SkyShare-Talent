import { prisma } from "@/lib/prisma";
import { isMergedAway } from "@/lib/candidates/merged-guard";

/**
 * ONE definition of "link this candidate to this job".
 *
 * Extracted from app/api/candidate-applications/route.ts when the batch add
 * arrived, rather than letting a second route grow its own copy. The three rules
 * below are the whole reason: each was learned from a production incident, and a
 * batch path that missed one would reproduce it thirty times per click instead of
 * once.
 *
 *   1. An existing application is REUSED, never duplicated.
 *   2. Linking an ARCHIVED candidate reactivates them — you are considering them
 *      again — EXCEPT the two cases below.
 *   3. NOT if they are archived because they were HIRED and are a current
 *      employee (that shoves an employee back into the candidate pipeline), and
 *      NOT if the row is a merged-away tombstone (that puts an empty duplicate
 *      into the live pool while the record holding the evidence stays archived).
 */

export type LinkToJobResult = {
  candidateId: string;
  /** null only when the candidate row does not exist. */
  applicationId: string | null;
  /** The application already existed; nothing was created. */
  reused: boolean;
  /** An archived candidate was brought back into the active pipeline. */
  reactivated: boolean;
  /**
   * Set when nothing was linked. "missing" = no such candidate. The link itself
   * is never refused — a merged or employed row still links, it just does not
   * get reactivated (see skippedReactivation).
   */
  error?: "missing";
  /** Why an archived candidate was deliberately left archived. */
  skippedReactivation?: "employed" | "merged";
};

export async function linkCandidateToJob(input: {
  candidateId: string;
  jobId: string;
  status?: string | null;
  stage?: string | null;
  /** Defaults to "Manual entry" — the batch add passes its own label. */
  source?: string | null;
}): Promise<LinkToJobResult> {
  const { candidateId, jobId } = input;

  const candidate = await prisma.candidate.findUnique({
    where: { id: candidateId },
    select: { archivedAt: true, status: true, mergeHistoryJson: true }
  });
  if (!candidate) {
    return { candidateId, applicationId: null, reused: false, reactivated: false, error: "missing" };
  }

  const existing = await prisma.candidateApplication.findFirst({
    where: { candidateId, jobId },
    select: { id: true }
  });

  const applicationId =
    existing?.id ??
    (
      await prisma.candidateApplication.create({
        data: {
          candidateId,
          jobId,
          status: input.status?.trim() || "New",
          stage: input.stage?.trim() || "Applied",
          source: input.source?.trim() || "Manual entry",
          appliedAt: new Date()
        },
        select: { id: true }
      })
    ).id;

  // Reactivation is evaluated even on a reused application: the row can have been
  // linked long ago and archived since, and re-adding them to the req is the same
  // statement of intent either way.
  let reactivated = false;
  let skippedReactivation: LinkToJobResult["skippedReactivation"];

  if (candidate.archivedAt) {
    if (isMergedAway(candidate)) {
      skippedReactivation = "merged";
    } else {
      const employedHire = await prisma.newHire.findFirst({
        where: {
          candidateId,
          stage: { in: ["ACTIVE", "POST_ONBOARD"] },
          NOT: { employmentStatus: "TERMINATED" }
        },
        select: { id: true }
      });
      if (employedHire) {
        skippedReactivation = "employed";
      } else {
        await prisma.candidate.update({
          where: { id: candidateId },
          data: { archivedAt: null, status: "ACTIVE" }
        });
        reactivated = true;
      }
    }
  }

  return {
    candidateId,
    applicationId,
    reused: Boolean(existing),
    reactivated,
    ...(skippedReactivation ? { skippedReactivation } : {})
  };
}
