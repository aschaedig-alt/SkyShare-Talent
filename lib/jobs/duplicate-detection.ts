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
 * The columns a cluster row carries, in one place because the whole-database scan
 * and the single-pair lookup must hand the UI identically shaped rows.
 */
const CLUSTER_JOB_SELECT = {
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
} as const;

/** Merged jobs are never cluster candidates: their name belongs to their survivor. */
function loadClusterJobs(ids?: string[]) {
  return prisma.job.findMany({
    where: ids ? { id: { in: ids }, mergedIntoJobId: null } : { mergedIntoJobId: null },
    select: CLUSTER_JOB_SELECT,
    orderBy: { title: "asc" },
  });
}

type ClusterJobRow = Awaited<ReturnType<typeof loadClusterJobs>>[number];

function mapClusterJob(j: ClusterJobRow): DuplicateClusterJob {
  return {
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
  };
}

/**
 * The key a job's title groups on for EXACT matching.
 *
 * Deliberately the same expression the rename clash check, the importer and the
 * create route use for Job.normalizedTitle. It used to be title.trim().toLowerCase()
 * here, which does NOT collapse runs of inner whitespace, so a job stored with a
 * double space was a clash the rename endpoint refused and an exact pair this scan
 * could not see. Two places deciding "same title" differently is how you get told
 * to merge something the merge screen will not show you.
 */
export function normalizeJobTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Scan ALL jobs and group them into duplicate clusters.
 * - Exact clusters: jobs sharing a normalized title
 * - Similar clusters: jobs within similarityThreshold of a seed title
 * Only clusters with 2+ jobs survive.
 *
 * TWO THINGS THIS GOT WRONG, both found on 2026-09-09 from a real report: he was
 * refused a rename because "Line Service Technician (Aviation)" was taken, and the
 * scan then offered him no way to merge the two.
 *
 * 1. A DISCARDED CLUSTER USED TO EAT ITS MEMBERS. Jobs were added to usedJobIds
 *    while the group was being collected, BEFORE prune() dropped pairs that had
 *    been dismissed as not-duplicates. When pruning emptied the group the cluster
 *    was thrown away but its jobs stayed marked as used, so they were invisible for
 *    the rest of the scan. Dismissing one pair therefore removed BOTH jobs from
 *    every future scan, not just that pairing. Measured against live data: 66
 *    dismissal rows had collapsed the scan from 18 clusters to 1. Nothing is marked
 *    used now until its cluster has actually survived.
 *
 * 2. A JOB COULD ONLY EVER JOIN ONE CLUSTER. The first seed to reach a job in
 *    title order claimed it. So "(old) Line Service Technician (Aviation)" claimed
 *    "Line Service Technician (Aviation)" at 85 percent, that pair was dismissed,
 *    the cluster died, and the pair he actually wanted, "Line Service Technician"
 *    against "Line Service Technician (Aviation)" at 68 percent and never
 *    dismissed, could not form because both members were already spent. Similarity
 *    is not transitive, so single membership silently drops real duplicates. Every
 *    job now seeds a cluster and may appear in as many as it genuinely matches.
 *
 * The cost of (2) is overlapping clusters, so identical member sets are collapsed
 * and any similar cluster wholly contained in a larger one is dropped. Exact
 * clusters are always kept: they are the stronger signal and are what the rename
 * check itself refuses on.
 */
export async function findAllDuplicateClusters(
  similarityThreshold: number = 60
): Promise<DuplicateCluster[]> {
  const jobs = await loadClusterJobs();

  // Load dismissed pairs ("not duplicates" decisions) so we can filter them out.
  const dismissals = await prisma.jobDuplicateDismissal.findMany({
    select: { jobIdA: true, jobIdB: true },
  });
  const dismissedPairs = new Set<string>();
  for (const d of dismissals) {
    dismissedPairs.add(pairKey(d.jobIdA, d.jobIdB));
  }

  type Row = (typeof jobs)[number];

  /**
   * Grow a cluster from a seed, admitting a job only when it has NOT been dismissed
   * against the seed or against anything already admitted. The result therefore
   * contains no settled pairing anywhere inside it.
   *
   * THIS REPLACED A prune() THAT ONLY DROPPED A JOB WITH NO SURVIVING PARTNER AT
   * ALL. Under that rule a dismissed pair sitting inside an otherwise-live group
   * was shown again, because both members still had other partners. Measured on
   * 2026-09-09, 42 of the 140 pairings on offer were ones somebody had already said
   * no to, including 6 dismissed by Aimee two hours earlier the same afternoon.
   * Re-asking a settled question is how a review screen loses its credibility, and
   * it is worse than the miss it was covering for: the answer is already recorded.
   *
   * Deterministic, because candidates arrive in title order. Greedy rather than
   * maximum-clique, which is the right trade here: a job left out of one cluster
   * still seeds its own.
   */
  function growCluster(seed: Row, candidates: Row[]): Row[] {
    const members = [seed];
    for (const candidate of candidates) {
      if (candidate.id === seed.id) continue;
      if (members.every((m) => !dismissedPairs.has(pairKey(m.id, candidate.id)))) {
        members.push(candidate);
      }
    }
    return members;
  }

  const memberKey = (group: Row[]) =>
    group
      .map((j) => j.id)
      .sort()
      .join("+");

  const clusters: DuplicateCluster[] = [];

  // 1. Exact-title clusters. No side effect on anything else in the scan: a group
  //    that does not survive pruning simply is not a cluster.
  const exactGroups = new Map<string, Row[]>();
  for (const job of jobs) {
    const key = normalizeJobTitle(job.title);
    const group = exactGroups.get(key) ?? [];
    group.push(job);
    exactGroups.set(key, group);
  }

  for (const [key, group] of exactGroups) {
    if (group.length < 2) continue;
    const members = growCluster(group[0], group);
    if (members.length < 2) continue;
    clusters.push({
      key: `exact:${key}`,
      title: members[0].title,
      matchType: "exact",
      jobs: members.map(mapClusterJob),
    });
  }

  // 2. Similar-title clusters. Similarity is computed once per unordered pair and
  //    held as an adjacency map, because every job now seeds a cluster and the naive
  //    version would compare each pair twice.
  const neighbours = new Map<string, Set<string>>();
  for (const job of jobs) neighbours.set(job.id, new Set<string>());
  for (let i = 0; i < jobs.length; i += 1) {
    for (let k = i + 1; k < jobs.length; k += 1) {
      if (calculateSimilarity(jobs[i].title, jobs[k].title) >= similarityThreshold) {
        neighbours.get(jobs[i].id)?.add(jobs[k].id);
        neighbours.get(jobs[k].id)?.add(jobs[i].id);
      }
    }
  }

  const candidates: { seed: Row; group: Row[] }[] = [];
  const seenSets = new Set<string>();
  for (const seed of jobs) {
    const linked = neighbours.get(seed.id);
    if (!linked || linked.size === 0) continue;
    const members = growCluster(seed, jobs.filter((j) => linked.has(j.id)));
    if (members.length < 2) continue;
    const setKey = memberKey(members);
    if (seenSets.has(setKey)) continue;
    seenSets.add(setKey);
    candidates.push({ seed, group: members });
  }

  // Drop any similar cluster wholly contained in a bigger one. Overlap is the price
  // of multi-membership; a strict subset is pure noise, since the larger cluster
  // already offers every merge the smaller one did.
  const bySizeDesc = [...candidates].sort((a, b) => b.group.length - a.group.length);
  const kept: { seed: Row; group: Row[]; ids: Set<string> }[] = [];
  for (const candidate of bySizeDesc) {
    const ids = new Set(candidate.group.map((j) => j.id));
    const contained = kept.some(
      (k) => k.ids.size > ids.size && [...ids].every((id) => k.ids.has(id))
    );
    if (contained) continue;
    kept.push({ ...candidate, ids });
  }

  for (const { seed, group } of kept) {
    clusters.push({
      key: `similar:${memberKey(group)}`,
      title: seed.title,
      matchType: "similar",
      jobs: group.map(mapClusterJob),
    });
  }

  // Sort: exact first, then by cluster size descending
  clusters.sort((a, b) => {
    if (a.matchType !== b.matchType) return a.matchType === "exact" ? -1 : 1;
    return b.jobs.length - a.jobs.length;
  });

  return clusters;
}

/**
 * Build a cluster for one explicitly named pair, whatever the scan thinks of it.
 *
 * This is what the rename clash links to. The 409 that refuses a rename already
 * knows both job ids, and until now said "merge these instead" while offering no
 * route to do it. The pair is shown even when it falls below the similarity
 * threshold or has been dismissed as not-duplicates, because the person asking for
 * it has just told us the two names collide, and that outranks an earlier guess.
 */
export async function buildPairCluster(
  jobIdA: string,
  jobIdB: string
): Promise<DuplicateCluster | null> {
  if (!jobIdA || !jobIdB || jobIdA === jobIdB) return null;

  const rows = await loadClusterJobs([jobIdA, jobIdB]);
  if (rows.length !== 2) return null;

  // Keep the order the caller asked for, so the job being renamed reads first.
  const first = rows.find((j) => j.id === jobIdA);
  const second = rows.find((j) => j.id === jobIdB);
  if (!first || !second) return null;

  const identical = normalizeJobTitle(first.title) === normalizeJobTitle(second.title);

  return {
    key: `pair:${pairKey(jobIdA, jobIdB)}`,
    title: first.title,
    matchType: identical ? "exact" : "similar",
    jobs: [first, second].map(mapClusterJob),
  };
}


export interface DismissedPair {
  jobIdA: string;
  jobIdB: string;
  titleA: string;
  titleB: string;
  statusA: string;
  statusB: string;
  locationA?: string;
  locationB?: string;
  similarity: number;
  createdBy?: string;
  createdAt: string;
  /** True when the pairing can no longer affect a scan, so restoring it is pointless. */
  stale: boolean;
  staleReason?: string;
}

/**
 * Every "not duplicates" decision on record, so it can be read back and undone.
 *
 * ASKED FOR ON 2026-09-09, and the reason is worth keeping. These decisions were
 * write-only: 66 of them existed, no screen listed them, and nothing called the
 * DELETE endpoint that could take one back. That was tolerable only while each one
 * meant what it appeared to mean. It did not — until the fix in this same change,
 * dismissing a pair removed BOTH jobs from every later scan rather than hiding that
 * one pairing. So every one of those 66 was made under a rule nobody intended, some
 * of them almost certainly just to clear noise off the screen, and they are all
 * still in force. A decision you cannot see and cannot reverse is not a decision,
 * it is a trap.
 *
 * Pairs whose jobs have since been merged or deleted are returned too, flagged
 * stale rather than hidden: they cannot affect a scan, but silently dropping rows
 * from a list that claims to be the whole record is how you get a wrong count.
 */
export async function listDismissedPairs(): Promise<DismissedPair[]> {
  const dismissals = await prisma.jobDuplicateDismissal.findMany({
    orderBy: { createdAt: "desc" },
  });
  if (dismissals.length === 0) return [];

  const ids = [...new Set(dismissals.flatMap((d) => [d.jobIdA, d.jobIdB]))];
  const jobs = await prisma.job.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, status: true, city: true, state: true, mergedIntoJobId: true },
  });
  const byId = new Map(jobs.map((j) => [j.id, j]));
  const place = (j?: { city: string | null; state: string | null }) =>
    j && (j.city || j.state) ? [j.city, j.state].filter(Boolean).join(", ") : undefined;

  return dismissals.map((d) => {
    const a = byId.get(d.jobIdA);
    const b = byId.get(d.jobIdB);
    const missing = !a || !b;
    const merged = Boolean(a?.mergedIntoJobId || b?.mergedIntoJobId);
    return {
      jobIdA: d.jobIdA,
      jobIdB: d.jobIdB,
      titleA: a?.title ?? "(job no longer exists)",
      titleB: b?.title ?? "(job no longer exists)",
      statusA: a?.status ?? "GONE",
      statusB: b?.status ?? "GONE",
      locationA: place(a),
      locationB: place(b),
      similarity: a && b ? calculateSimilarity(a.title, b.title) : 0,
      createdBy: d.createdBy ?? undefined,
      createdAt: d.createdAt.toISOString(),
      stale: missing || merged,
      staleReason: missing
        ? "One of these jobs no longer exists."
        : merged
          ? "One of these jobs has since been merged into another."
          : undefined,
    };
  });
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
