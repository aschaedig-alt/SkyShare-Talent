import { prisma } from "@/lib/prisma";

export interface MergeResult {
  success: boolean;
  primaryJobId: string;
  secondaryJobId: string;
  message: string;
  affectedRecords: {
    applications: number;
    interviews: number;
    jobPosts: number;
  };
}

/**
 * Merge secondary job into primary job
 * - All applications, interviews, and job posts are reassigned to primary
 * - Secondary job is marked as merged (mergedIntoJobId set)
 * - Uses database transaction for atomicity
 */
export async function mergeJobs(
  primaryJobId: string,
  secondaryJobId: string,
  mergedBy?: string
): Promise<MergeResult> {
  if (primaryJobId === secondaryJobId) {
    return {
      success: false,
      primaryJobId,
      secondaryJobId,
      message: "Cannot merge a job with itself",
      affectedRecords: { applications: 0, interviews: 0, jobPosts: 0 },
    };
  }

  try {
    // Start transaction
    const result = await prisma.$transaction(async (tx) => {
      // Verify both jobs exist
      const [primary, secondary] = await Promise.all([
        tx.job.findUnique({ where: { id: primaryJobId } }),
        tx.job.findUnique({ where: { id: secondaryJobId } }),
      ]);

      if (!primary || !secondary) {
        throw new Error("One or both jobs not found");
      }

      // Check if secondary is already merged
      if (secondary.mergedIntoJobId) {
        throw new Error("Cannot merge a job that is already merged into another job");
      }

      // Capture exactly which records will move, so the merge can be reversed precisely.
      const [appRows, interviewRows, jobPostRows] = await Promise.all([
        tx.candidateApplication.findMany({ where: { jobId: secondaryJobId }, select: { id: true } }),
        tx.interview.findMany({ where: { jobId: secondaryJobId }, select: { id: true } }),
        tx.jobPost.findMany({ where: { recruitingJobId: secondaryJobId }, select: { id: true } }),
      ]);
      const applicationIds = appRows.map((r) => r.id);
      const interviewIds = interviewRows.map((r) => r.id);
      const jobPostIds = jobPostRows.map((r) => r.id);

      // Move applications
      await tx.candidateApplication.updateMany({
        where: { jobId: secondaryJobId },
        data: { jobId: primaryJobId },
      });

      // Move interviews
      await tx.interview.updateMany({
        where: { jobId: secondaryJobId },
        data: { jobId: primaryJobId },
      });

      // Move job posts
      await tx.jobPost.updateMany({
        where: { recruitingJobId: secondaryJobId },
        data: { recruitingJobId: primaryJobId },
      });

      // Mark secondary as merged (remember its prior status for a clean undo)
      await tx.job.update({
        where: { id: secondaryJobId },
        data: {
          mergedIntoJobId: primaryJobId,
          status: "MERGED",
        },
      });

      // Write the reversible merge record
      await tx.jobMergeRecord.create({
        data: {
          primaryJobId,
          secondaryJobId,
          applicationIds: JSON.stringify(applicationIds),
          interviewIds: JSON.stringify(interviewIds),
          jobPostIds: JSON.stringify(jobPostIds),
          previousStatus: secondary.status,
          mergedBy: mergedBy ?? null,
        },
      });

      return {
        applications: applicationIds.length,
        interviews: interviewIds.length,
        jobPosts: jobPostIds.length,
      };
    });

    return {
      success: true,
      primaryJobId,
      secondaryJobId,
      message: `Successfully merged job "${secondaryJobId}" into "${primaryJobId}"`,
      affectedRecords: result,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error during merge";
    return {
      success: false,
      primaryJobId,
      secondaryJobId,
      message: `Merge failed: ${message}`,
      affectedRecords: { applications: 0, interviews: 0, jobPosts: 0 },
    };
  }
}

/**
 * Undo a merge - restore the secondary job to the active list.
 * If a JobMergeRecord exists, the exact applications/interviews/job posts that were
 * moved are returned to the restored job. Legacy merges (no record) just restore the
 * job record without moving related data back (origin wasn't tracked at merge time).
 */
export async function undoMerge(mergedJobId: string): Promise<MergeResult> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const mergedJob = await tx.job.findUnique({
        where: { id: mergedJobId },
        select: { mergedIntoJobId: true },
      });

      if (!mergedJob?.mergedIntoJobId) {
        throw new Error("Job was not merged into another job");
      }


      // Most recent un-undone merge record for this job, if any.
      const record = await tx.jobMergeRecord.findFirst({
        where: { secondaryJobId: mergedJobId, undone: false },
        orderBy: { mergedAt: "desc" },
      });

      let movedApplications = 0;
      let movedInterviews = 0;
      let movedJobPosts = 0;
      let restoredStatus = "OPEN";

      if (record) {
        const applicationIds = JSON.parse(record.applicationIds) as string[];
        const interviewIds = JSON.parse(record.interviewIds) as string[];
        const jobPostIds = JSON.parse(record.jobPostIds) as string[];
        restoredStatus = record.previousStatus ?? "OPEN";

        if (applicationIds.length > 0) {
          const r = await tx.candidateApplication.updateMany({
            where: { id: { in: applicationIds } },
            data: { jobId: mergedJobId },
          });
          movedApplications = r.count;
        }
        if (interviewIds.length > 0) {
          const r = await tx.interview.updateMany({
            where: { id: { in: interviewIds } },
            data: { jobId: mergedJobId },
          });
          movedInterviews = r.count;
        }
        if (jobPostIds.length > 0) {
          const r = await tx.jobPost.updateMany({
            where: { id: { in: jobPostIds } },
            data: { recruitingJobId: mergedJobId },
          });
          movedJobPosts = r.count;
        }

        await tx.jobMergeRecord.update({
          where: { id: record.id },
          data: { undone: true, undoneAt: new Date() },
        });
      }

      // Restore the secondary job to the active list.
      await tx.job.update({
        where: { id: mergedJobId },
        data: {
          mergedIntoJobId: null,
          status: restoredStatus,
        },
      });

      return {
        applications: movedApplications,
        interviews: movedInterviews,
        jobPosts: movedJobPosts,
        hadRecord: Boolean(record),
      };
    });

    return {
      success: true,
      primaryJobId: mergedJobId,
      secondaryJobId: "",
      message: result.hadRecord
        ? `Unmerged. Restored ${result.applications} applications and ${result.interviews} interviews.`
        : `Unmerged and restored the job to the active list. (No record of moved data — applications/interviews stayed with the kept job.)`,
      affectedRecords: {
        applications: result.applications,
        interviews: result.interviews,
        jobPosts: result.jobPosts,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error during undo";
    return {
      success: false,
      primaryJobId: mergedJobId,
      secondaryJobId: "",
      message: `Undo failed: ${message}`,
      affectedRecords: { applications: 0, interviews: 0, jobPosts: 0 },
    };
  }
}

/**
 * List all merged jobs with the job they were merged into, and whether the merge
 * is precisely reversible (a record exists capturing what moved).
 */
export async function listMergedJobs() {
  const merged = await prisma.job.findMany({
    where: { mergedIntoJobId: { not: null } },
    select: {
      id: true,
      title: true,
      status: true,
      updatedAt: true,
      mergedIntoJob: { select: { id: true, title: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const records = await prisma.jobMergeRecord.findMany({
    where: { secondaryJobId: { in: merged.map((m) => m.id) }, undone: false },
    orderBy: { mergedAt: "desc" },
  });
  const recordBySecondary = new Map<string, (typeof records)[number]>();
  for (const r of records) {
    if (!recordBySecondary.has(r.secondaryJobId)) recordBySecondary.set(r.secondaryJobId, r);
  }

  return merged.map((m) => {
    const record = recordBySecondary.get(m.id);
    return {
      id: m.id,
      title: m.title,
      status: m.status,
      mergedInto: m.mergedIntoJob ? { id: m.mergedIntoJob.id, title: m.mergedIntoJob.title } : null,
      mergedAt: (record?.mergedAt ?? m.updatedAt).toISOString(),
      mergedBy: record?.mergedBy ?? null,
      reversible: record
        ? {
            applications: (JSON.parse(record.applicationIds) as string[]).length,
            interviews: (JSON.parse(record.interviewIds) as string[]).length,
          }
        : null,
    };
  });
}

/**
 * Get merge history for a job
 */
export async function getMergeHistory(jobId: string) {
  return prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      title: true,
      mergedIntoJobId: true,
      mergedIntoJob: {
        select: { id: true, title: true },
      },
      mergedJobs: {
        select: { id: true, title: true, createdAt: true },
      },
    },
  });
}
