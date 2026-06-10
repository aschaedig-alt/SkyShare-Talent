import { prisma } from "@/lib/prisma";

/** Normalized, order-independent key for a pair of job IDs. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

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

    // Check similarity (60% threshold - catches variants like "Sr. Engineer" vs "Senior Engineer")
    const titleSimilarity = calculateSimilarity(sourceJob.title, job.title);

    if (titleSimilarity >= 60) {
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

export interface DuplicateClusterJob {
  id: string;
  title: string;
  city?: string;
  state?: string;
  department?: string;
  status: string;
  applications: number;
  interviews: number;
  // Detail fields for inline expansion
  recruiter?: string;
  jobReqId?: string;
  source?: string;
  openedDate?: string;
  baseLocation?: string;
  pilotSeat?: string;
  roleCategory?: string;
  paySummary?: string;
  scheduleSummary?: string;
  jobDescriptionText?: string;
  rawMinimumRequirements?: string;
}

export interface DuplicateCluster {
  key: string;
  title: string;
  matchType: "exact" | "similar";
  jobs: DuplicateClusterJob[];
}

/**
 * Scan ALL jobs and group them into duplicate clusters.
 * - Exact clusters: jobs sharing an identical (case-insensitive, trimmed) title
 * - Similar clusters: remaining jobs grouped by >= threshold title similarity
 * Only clusters with 2+ jobs are returned.
 */
export async function findAllDuplicateClusters(
  similarityThreshold: number = 60
): Promise<DuplicateCluster[]> {
  const jobs = await prisma.job.findMany({
    where: { mergedIntoJobId: null },
    select: {
      id: true,
      title: true,
      city: true,
      state: true,
      department: true,
      status: true,
      recruiter: true,
      jobReqId: true,
      source: true,
      openedDate: true,
      baseLocation: true,
      pilotSeat: true,
      roleCategory: true,
      paySummary: true,
      scheduleSummary: true,
      jobDescriptionText: true,
      rawMinimumRequirements: true,
      _count: { select: { applications: true, interviews: true } },
    },
    orderBy: { title: "asc" },
  });

  const mapJob = (j: (typeof jobs)[number]): DuplicateClusterJob => ({
    id: j.id,
    title: j.title,
    city: j.city || undefined,
    state: j.state || undefined,
    department: j.department || undefined,
    status: j.status,
    applications: j._count.applications,
    interviews: j._count.interviews,
    recruiter: j.recruiter || undefined,
    jobReqId: j.jobReqId || undefined,
    source: j.source || undefined,
    openedDate: j.openedDate ? j.openedDate.toISOString() : undefined,
    baseLocation: j.baseLocation || undefined,
    pilotSeat: j.pilotSeat || undefined,
    roleCategory: j.roleCategory || undefined,
    paySummary: j.paySummary || undefined,
    scheduleSummary: j.scheduleSummary || undefined,
    jobDescriptionText: j.jobDescriptionText || undefined,
    rawMinimumRequirements: j.rawMinimumRequirements || undefined,
  });

  // Load dismissed pairs ("not duplicates" decisions) so we can filter them out.
  const dismissals = await prisma.jobDuplicateDismissal.findMany({
    select: { jobIdA: true, jobIdB: true },
  });
  const dismissedPairs = new Set<string>();
  for (const d of dismissals) {
    dismissedPairs.add(pairKey(d.jobIdA, d.jobIdB));
  }

  // Remove jobs that no longer have any non-dismissed partner in the group.
  // Runs to a fixpoint because removing one job can orphan another.
  function prune(group: typeof jobs): typeof jobs {
    let current = [...group];
    let changed = true;
    while (changed && current.length > 1) {
      changed = false;
      current = current.filter((j) => {
        const hasPartner = current.some(
          (other) => other.id !== j.id && !dismissedPairs.has(pairKey(j.id, other.id))
        );
        if (!hasPartner) changed = true;
        return hasPartner;
      });
    }
    return current;
  }

  const clusters: DuplicateCluster[] = [];
  const usedJobIds = new Set<string>();

  // 1. Exact-title clusters
  const exactGroups = new Map<string, typeof jobs>();
  for (const job of jobs) {
    const key = job.title.trim().toLowerCase();
    const group = exactGroups.get(key) ?? [];
    group.push(job);
    exactGroups.set(key, group);
  }

  for (const [key, group] of exactGroups) {
    if (group.length > 1) {
      group.forEach((j) => usedJobIds.add(j.id));
      const pruned = prune(group);
      if (pruned.length > 1) {
        clusters.push({
          key: `exact:${key}`,
          title: pruned[0].title,
          matchType: "exact",
          jobs: pruned.map(mapJob),
        });
      }
    }
  }

  // 2. Similar-title clusters (only among jobs not already in an exact cluster)
  const remaining = jobs.filter((j) => !usedJobIds.has(j.id));
  for (let i = 0; i < remaining.length; i += 1) {
    const seed = remaining[i];
    if (usedJobIds.has(seed.id)) continue;

    const matches = [seed];
    usedJobIds.add(seed.id);

    for (let k = i + 1; k < remaining.length; k += 1) {
      const candidate = remaining[k];
      if (usedJobIds.has(candidate.id)) continue;
      if (calculateSimilarity(seed.title, candidate.title) >= similarityThreshold) {
        matches.push(candidate);
        usedJobIds.add(candidate.id);
      }
    }

    if (matches.length > 1) {
      const pruned = prune(matches);
      if (pruned.length > 1) {
        clusters.push({
          key: `similar:${pruned[0].id}`,
          title: pruned[0].title,
          matchType: "similar",
          jobs: pruned.map(mapJob),
        });
      }
    }
  }

  // Sort: exact first, then by cluster size descending
  clusters.sort((a, b) => {
    if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
    return b.jobs.length - a.jobs.length;
  });

  return clusters;
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
