import { prisma } from "@/lib/prisma";

export type DuplicateCandidateBrief = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  counts: { files: number; notes: number; applications: number; interviews: number };
  /** Out of the live pool. An archived record should never be the survivor of a
      merge with a live one — that is how a current applicant gets buried. */
  archived: boolean;
  /** JAZZ = the legacy import, PAYCOM/MANUAL = the current system. */
  origin: string | null;
  /** ACTIVE / ARCHIVED / MERGED. MERGED means this row is a tombstone. */
  status: string;
  /** Set when status is MERGED — the record this one was folded into. */
  mergedIntoCandidateId: string | null;
  createdAt: string;
} | null;

/**
 * Whether reopening a closed pair could actually end in a merge.
 *
 * 42 of the 44 Reopen buttons on this page were dead. Reopening flips the review
 * item back to OPEN, but lib/duplicates/candidate-scan.ts re-closes any OPEN item
 * whose candidate is MERGED on the very next scan, and lib/candidates/merge.ts
 * refuses both a MERGED drop ("That candidate is already merged.") and a MERGED
 * keeper. So the pair came back, did nothing, and vanished again — a button that
 * looks live and silently accomplishes nothing is worse than no button.
 *
 * Computed here, next to the query that knows the candidates' status, rather than
 * inferred in the component from fields that happen to be on screen.
 */
export type ReopenEligibility = {
  allowed: boolean;
  /** Machine-readable, so the UI is not string-matching prose. */
  code: "OK" | "ALREADY_MERGED" | "CANDIDATE_MISSING" | "NOT_A_CANDIDATE_PAIR";
  /** Short label for the row, in place of the button. */
  label: string | null;
  /** The surviving record, when one side was merged away into it. */
  keeper: { id: string; displayName: string } | null;
};

export type DuplicateReviewData = {
  stats: {
    open: number;
    candidate: number;
    job: number;
    file: number;
    resolved: number;
  };
  items: Array<{
    id: string;
    reviewType: string;
    status: string;
    reason: string | null;
    confidence: string | null;
    createdAt: string;
    primary: DuplicateCandidateBrief;
    secondary: DuplicateCandidateBrief;
  }>;
  /**
   * Pairs that have been resolved or dismissed.
   *
   * These exist because the scan card counts EVERY pair it detected, while the
   * queue and all four stat tiles filter to OPEN — so the page could say "3
   * possible pairs" and then show nobody, with no way to find out who they were.
   * Reported by Hannah on 2026-08-31; all 44 review items were RESOLVED or
   * DISMISSED and there was no OPEN row anywhere, so the empty queue was correct
   * and the banner was the only thing counting something unreachable.
   */
  closed: Array<{
    id: string;
    reviewType: string;
    status: string;
    reason: string | null;
    confidence: string | null;
    createdAt: string;
    resolvedAt: string | null;
    primary: DuplicateCandidateBrief;
    secondary: DuplicateCandidateBrief;
    /** Whether the Reopen control should be live on this row, and why not. */
    reopen: ReopenEligibility;
  }>;
};

const candidateSelect = {
  select: {
    id: true,
    displayName: true,
    primaryEmail: true,
    primaryPhone: true,
    archivedAt: true,
    origin: true,
    status: true,
    mergeHistoryJson: true,
    createdAt: true,
    _count: { select: { files: true, notes: true, applications: true, interviews: true } }
  }
} as const;

type CandidateRow = {
  id: string;
  displayName: string;
  primaryEmail: string | null;
  primaryPhone: string | null;
  archivedAt: Date | null;
  origin: string | null;
  status: string;
  mergeHistoryJson: string | null;
  createdAt: Date;
  _count: { files: number; notes: number; applications: number; interviews: number };
};

/** mergeHistoryJson is a String column, not Json — it arrives as raw text. */
function mergedIntoIdOf(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as { mergedIntoCandidateId?: unknown };
    return typeof payload.mergedIntoCandidateId === "string" ? payload.mergedIntoCandidateId : null;
  } catch {
    return null;
  }
}

function brief(c: CandidateRow | null): DuplicateCandidateBrief {
  if (!c) return null;
  return {
    id: c.id,
    displayName: c.displayName,
    email: c.primaryEmail,
    phone: c.primaryPhone,
    counts: {
      files: c._count.files,
      notes: c._count.notes,
      applications: c._count.applications,
      interviews: c._count.interviews
    },
    archived: Boolean(c.archivedAt),
    origin: c.origin,
    status: c.status,
    mergedIntoCandidateId: mergedIntoIdOf(c.mergeHistoryJson),
    createdAt: c.createdAt.toISOString()
  };
}

/**
 * The single place that decides whether a closed pair is worth reopening.
 *
 * Mirrors, on purpose, the two rules that would otherwise defeat it:
 *   - lib/duplicates/candidate-scan.ts auto-RESOLVEs an OPEN item whose primary
 *     or secondary candidate is missing or MERGED, on the next scan;
 *   - lib/candidates/merge.ts throws on a MERGED drop AND on a MERGED keeper.
 * If either would fire, reopening leads nowhere and the row says so instead.
 */
function reopenEligibility(
  reviewType: string,
  primary: DuplicateCandidateBrief,
  secondary: DuplicateCandidateBrief
): ReopenEligibility {
  if (reviewType !== "CANDIDATE") {
    return {
      allowed: false,
      code: "NOT_A_CANDIDATE_PAIR",
      label: "Not a candidate pair",
      keeper: null
    };
  }
  if (!primary || !secondary) {
    return {
      allowed: false,
      code: "CANDIDATE_MISSING",
      label: "One record no longer exists",
      keeper: null
    };
  }
  const mergedSide = primary.status === "MERGED" ? primary : secondary.status === "MERGED" ? secondary : null;
  if (mergedSide) {
    return {
      allowed: false,
      code: "ALREADY_MERGED",
      label: "Already merged",
      // Filled in by the caller, which has the keeper's name.
      keeper: mergedSide.mergedIntoCandidateId ? { id: mergedSide.mergedIntoCandidateId, displayName: "" } : null
    };
  }
  return { allowed: true, code: "OK", label: null, keeper: null };
}

export async function getDuplicateReviewData(): Promise<DuplicateReviewData> {
  const [items, open, candidate, job, file, resolved, closedItems] = await Promise.all([
    // The queue shows OPEN items only — resolved/dismissed pairs drop off.
    prisma.duplicateReviewItem.findMany({
      where: { status: "OPEN" },
      take: 100,
      orderBy: { createdAt: "desc" },
      include: {
        primaryCandidate: candidateSelect,
        secondaryCandidate: candidateSelect
      }
    }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "CANDIDATE" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "JOB" } }),
    prisma.duplicateReviewItem.count({ where: { status: "OPEN", reviewType: "FILE" } }),
    prisma.duplicateReviewItem.count({ where: { status: { not: "OPEN" } } }),
    // The closed pairs themselves, so the page can NAME what the scan counted
    // rather than reporting a number nothing renders.
    prisma.duplicateReviewItem.findMany({
      where: { status: { not: "OPEN" } },
      take: 50,
      orderBy: [{ resolvedAt: "desc" }, { createdAt: "desc" }],
      include: {
        primaryCandidate: candidateSelect,
        secondaryCandidate: candidateSelect
      }
    })
  ]);

  const closedBriefs = closedItems.map((item) => {
    const primary = brief(item.primaryCandidate as CandidateRow | null);
    const secondary = brief(item.secondaryCandidate as CandidateRow | null);
    return { item, primary, secondary, reopen: reopenEligibility(item.reviewType, primary, secondary) };
  });

  // Name the surviving record for the already-merged rows, so the row reads
  // "already merged into Matt Smith" and links there rather than dead-ending.
  // One extra query for the whole page, not one per row.
  const keeperIds = Array.from(
    new Set(closedBriefs.map((r) => r.reopen.keeper?.id).filter((id): id is string => Boolean(id)))
  );
  const keeperNames = new Map(
    keeperIds.length > 0
      ? (
          await prisma.candidate.findMany({
            where: { id: { in: keeperIds } },
            select: { id: true, displayName: true }
          })
        ).map((c) => [c.id, c.displayName] as const)
      : []
  );

  return {
    stats: { open, candidate, job, file, resolved },
    closed: closedBriefs.map(({ item, primary, secondary, reopen }) => ({
      id: item.id,
      reviewType: item.reviewType,
      status: item.status,
      reason: item.reason,
      confidence: item.confidence,
      createdAt: item.createdAt.toISOString(),
      resolvedAt: item.resolvedAt ? item.resolvedAt.toISOString() : null,
      primary,
      secondary,
      reopen: reopen.keeper
        ? // Drop the keeper entirely if its row has since gone: a link to a
          // candidate page that 404s is the same trap in a different shape.
          keeperNames.has(reopen.keeper.id)
          ? { ...reopen, keeper: { id: reopen.keeper.id, displayName: keeperNames.get(reopen.keeper.id)! } }
          : { ...reopen, keeper: null }
        : reopen
    })),
    items: items.map((item) => ({
      id: item.id,
      reviewType: item.reviewType,
      status: item.status,
      reason: item.reason,
      confidence: item.confidence,
      createdAt: item.createdAt.toISOString(),
      primary: brief(item.primaryCandidate as CandidateRow | null),
      secondary: brief(item.secondaryCandidate as CandidateRow | null)
    }))
  };
}
