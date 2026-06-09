import { prisma } from "@/lib/prisma";

/**
 * Levenshtein distance - measures how different two strings are
 * Lower score = more similar
 */
function levenshteinDistance(str1: string, str2: string): number {
  const track = Array(str2.length + 1)
    .fill(null)
    .map(() => Array(str1.length + 1).fill(0));

  for (let i = 0; i <= str1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= str2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j += 1) {
    for (let i = 1; i <= str1.length; i += 1) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1,
        track[j - 1][i] + 1,
        track[j - 1][i - 1] + indicator
      );
    }
  }

  return track[str2.length][str1.length];
}

/**
 * Calculate similarity score (0-100)
 * 100 = identical, 0 = completely different
 */
function calculateSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 100;

  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 100;

  const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  return Math.round(((maxLength - distance) / maxLength) * 100);
}

export interface DuplicateMatch {
  jobId: string;
  title: string;
  city?: string;
  state?: string;
  department?: string;
  similarity: number;
  matchReason: string;
}

export interface DuplicateResult {
  exact: DuplicateMatch[];
  similar: DuplicateMatch[];
}

/**
 * Find duplicate jobs for a given job
 * Returns exact matches and similar matches (>75% similarity)
 */
export async function findDuplicateJobs(
  jobId: string,
  excludeMerged: boolean = true
): Promise<DuplicateResult> {
  const sourceJob = await prisma.job.findUnique({
    where: { id: jobId },
    select: { title: true, city: true, state: true, department: true, status: true },
  });

  if (!sourceJob) {
    return { exact: [], similar: [] };
  }

  const allJobs = await prisma.job.findMany({
    where: {
      id: { not: jobId },
      ...(excludeMerged ? { mergedIntoJobId: null } : {}),
      status: sourceJob.status, // Only compare jobs with same status
    },
    select: {
      id: true,
      title: true,
      city: true,
      state: true,
      department: true,
    },
  });

  const exact: DuplicateMatch[] = [];
  const similar: DuplicateMatch[] = [];

  for (const job of allJobs) {
    // Exact title match
    if (job.title.toLowerCase() === sourceJob.title.toLowerCase()) {
      exact.push({
        jobId: job.id,
        title: job.title,
        city: job.city || undefined,
        state: job.state || undefined,
        department: job.department || undefined,
        similarity: 100,
        matchReason: "Exact title match",
      });
      continue;
    }

    // Check similarity
    const titleSimilarity = calculateSimilarity(sourceJob.title, job.title);

    if (titleSimilarity >= 75) {
      const locationMatch = job.city === sourceJob.city && job.state === sourceJob.state;
      const reason = locationMatch
        ? `${titleSimilarity}% title similarity + same location`
        : `${titleSimilarity}% title similarity`;

      similar.push({
        jobId: job.id,
        title: job.title,
        city: job.city || undefined,
        state: job.state || undefined,
        department: job.department || undefined,
        similarity: titleSimilarity,
        matchReason: reason,
      });
    }
  }

  // Sort by similarity descending
  exact.sort((a, b) => b.similarity - a.similarity);
  similar.sort((a, b) => b.similarity - a.similarity);

  return { exact, similar };
}

/**
 * Get detailed comparison of two jobs
 */
export async function compareJobs(primaryId: string, secondaryId: string) {
  const primary = await prisma.job.findUnique({
    where: { id: primaryId },
    include: {
      applications: { select: { id: true } },
      interviews: { select: { id: true } },
      jobPosts: { select: { id: true } },
    },
  });

  const secondary = await prisma.job.findUnique({
    where: { id: secondaryId },
    include: {
      applications: { select: { id: true } },
      interviews: { select: { id: true } },
      jobPosts: { select: { id: true } },
    },
  });

  if (!primary || !secondary) {
    return null;
  }

  return {
    primary: {
      ...primary,
      relatedCount: {
        applications: primary.applications.length,
        interviews: primary.interviews.length,
        jobPosts: primary.jobPosts.length,
      },
    },
    secondary: {
      ...secondary,
      relatedCount: {
        applications: secondary.applications.length,
        interviews: secondary.interviews.length,
        jobPosts: secondary.jobPosts.length,
      },
    },
  };
}
