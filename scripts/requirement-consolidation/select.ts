/**
 * Which pilot requirement survives for a given role, and in what order.
 *
 * Shared by plan.ts and apply.ts on purpose: if the two ever disagreed, the
 * review file you approved would not describe what actually got written.
 */

export type Rankable = {
  reviewStatus: string;
  updatedAt: Date;
  gates: { enabled: boolean }[];
};

const reviewRank: Record<string, number> = { APPROVED: 0, NEEDS_REVIEW: 1, DRAFT: 2 };

/**
 * Best first. A requirement with more gates actually turned on carries more real
 * work, so that wins ahead of review state and recency.
 */
export function rankGroup<T extends Rankable>(members: T[]): T[] {
  return [...members].sort(
    (a, b) =>
      b.gates.filter((g) => g.enabled).length - a.gates.filter((g) => g.enabled).length ||
      (reviewRank[a.reviewStatus] ?? 3) - (reviewRank[b.reviewStatus] ?? 3) ||
      +b.updatedAt - +a.updatedAt
  );
}

/**
 * Walk a merge chain to the job that actually survived. Guards against a cycle,
 * which would otherwise spin forever — the data already contains one job that is
 * OPEN yet points at a merged job, so the shape is not trustworthy.
 */
export function resolveSurvivingJobId(
  startId: string,
  jobs: Map<string, { id: string; mergedIntoJobId: string | null }>
): string | null {
  const seen = new Set<string>();
  let current = jobs.get(startId);
  while (current?.mergedIntoJobId) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    const next = jobs.get(current.mergedIntoJobId);
    if (!next) return null;
    current = next;
  }
  return current?.id ?? null;
}
