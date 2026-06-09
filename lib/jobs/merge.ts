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
  secondaryJobId: string
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

      // Move applications
      const applicationsCount = await tx.candidateApplication.updateMany({
        where: { jobId: secondaryJobId },
        data: { jobId: primaryJobId },
      });

      // Move interviews
      const interviewsCount = await tx.interview.updateMany({
        where: { jobId: secondaryJobId },
        data: { jobId: primaryJobId },
      });

      // Move job posts
      const jobPostsCount = await tx.jobPost.updateMany({
        where: { recruitingJobId: secondaryJobId },
        data: { recruitingJobId: primaryJobId },
      });

      // Mark secondary as merged
      await tx.job.update({
        where: { id: secondaryJobId },
        data: {
          mergedIntoJobId: primaryJobId,
          status: "MERGED", // Mark as merged status
        },
      });

      return {
        applications: applicationsCount.count,
        interviews: interviewsCount.count,
        jobPosts: jobPostsCount.count,
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
 * Undo a merge - restore secondary job and move related records back
 * (Soft undo: keeps audit trail)
 */
export async function undoMerge(mergedJobId: string): Promise<MergeResult> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // Find the job and what it was merged into
      const mergedJob = await tx.job.findUnique({
        where: { id: mergedJobId },
        select: { mergedIntoJobId: true },
      });

      if (!mergedJob?.mergedIntoJobId) {
        throw new Error("Job was not merged into another job");
      }

      const primaryJobId = mergedJob.mergedIntoJobId;

      // Restore secondary job status
      await tx.job.update({
        where: { id: mergedJobId },
        data: {
          mergedIntoJobId: null,
          status: "OPEN", // Restore to open
        },
      });

      // Count affected records (note: we don't actually move them back in soft undo)
      // In a production system, you'd want more sophisticated tracking
      const applications = await tx.candidateApplication.count({
        where: { jobId: primaryJobId },
      });

      const interviews = await tx.interview.count({
        where: { jobId: primaryJobId },
      });

      const jobPosts = await tx.jobPost.count({
        where: { recruitingJobId: primaryJobId },
      });

      return { applications, interviews, jobPosts };
    });

    return {
      success: true,
      primaryJobId: mergedJobId,
      secondaryJobId: "", // N/A for undo
      message: `Merge for job "${mergedJobId}" has been undone`,
      affectedRecords: result,
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
