import { prisma } from "@/lib/prisma";

/**
 * ONE definition of "this candidate row was merged away", for every path that
 * might otherwise bring a tombstone back to life.
 *
 * WHY THIS EXISTS: the same guard was written three times, against two different
 * columns, and one place did not write it at all.
 *
 *   - app/api/candidate-applications/route.ts tested mergeHistoryJson
 *   - lib/candidates/reactivate.ts tests status === "MERGED"
 *   - app/api/candidates/route.ts tested NEITHER, and reproduced the original bug
 *     exactly: it matched an existing candidate by email/phone with no status or
 *     archived filter, then wrote { archivedAt: null, status: "ACTIVE" }.
 *
 * The first two are equivalent on live data today — measured 2026-08-31, 31 rows
 * with status MERGED, 31 with mergeHistoryJson set, 0 disagreements in either
 * direction — but they are still two different columns, and "equivalent today" is
 * how a divergence ships unnoticed. This checks the UNION, so a row that acquires
 * one marker without the other is still caught.
 *
 * WHAT A MERGED ROW IS: lib/candidates/merge.ts moves the contacts, notes, files,
 * applications, interviews and metrics onto the keeper and leaves this row hollow
 * with a pointer in mergeHistoryJson. Reactivating it puts an EMPTY duplicate of a
 * real person into the live pool while the record holding the evidence stays
 * archived — which is exactly what happened to Matt Smith on 2026-08-31 (0 files
 * and 0 metrics against the keeper's 3 and 21), and produced a duplicate-scan pair
 * the page could count but not show anyone.
 */

/** The fields any caller must select for the synchronous check. */
export type MergeMarkers = {
  status: string | null;
  mergeHistoryJson: string | null;
};

/**
 * Is this row a merged-away tombstone?
 *
 * The union of both markers on purpose — see the note above.
 */
export function isMergedAway(candidate: MergeMarkers | null | undefined): boolean {
  if (!candidate) return false;
  return candidate.status === "MERGED" || Boolean(candidate.mergeHistoryJson);
}

/**
 * mergeHistoryJson is a String column, not a Json one, so it arrives as raw text
 * and has to be parsed. A malformed value means "merged, keeper unknown" rather
 * than "not merged" — failing open here is what the guard exists to prevent.
 */
export function mergedIntoIdOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw) as { mergedIntoCandidateId?: unknown };
    return typeof payload.mergedIntoCandidateId === "string" ? payload.mergedIntoCandidateId : null;
  } catch {
    return null;
  }
}

export type SurvivingCandidate = { id: string; displayName: string };

export type MergedAwayResolution =
  /** Not a tombstone — carry on with the row you already have. */
  | { merged: false }
  /** A tombstone, and we found the live record it was folded into. */
  | { merged: true; keeper: SurvivingCandidate; message: string }
  /** A tombstone whose keeper is missing, merged itself, or unrecorded. */
  | { merged: true; keeper: null; message: string };

/** Chains are short in practice; the cap is there so a cycle cannot hang a request. */
const MAX_MERGE_HOPS = 5;

/**
 * Follow a merged-away row to the live record that actually holds the person.
 *
 * Walks the mergeHistoryJson pointer rather than stopping at the first hop,
 * because a record that was merged twice points at an intermediate tombstone.
 * Bounded and cycle-guarded: a merge CYCLE has happened here for real (Chari
 * Kroeplin, merged Paycom-into-Jazz on 2026-06-27 and corrected the other way on
 * 2026-07-16, leaving both rows MERGED and no live row at all). merge.ts now
 * refuses a MERGED keeper, but historical rows predate that.
 */
export async function resolveMergedAway(
  candidate: (MergeMarkers & { id: string; displayName?: string | null }) | null | undefined
): Promise<MergedAwayResolution> {
  if (!isMergedAway(candidate) || !candidate) {
    return { merged: false };
  }

  const droppedName = candidate.displayName || "That record";
  const seen = new Set<string>([candidate.id]);
  let pointer = mergedIntoIdOf(candidate.mergeHistoryJson);

  for (let hop = 0; hop < MAX_MERGE_HOPS && pointer; hop += 1) {
    if (seen.has(pointer)) break;
    seen.add(pointer);

    const next: { id: string; displayName: string; status: string | null; mergeHistoryJson: string | null } | null =
      await prisma.candidate.findUnique({
        where: { id: pointer },
        select: { id: true, displayName: true, status: true, mergeHistoryJson: true }
      });
    if (!next) break;

    if (!isMergedAway(next)) {
      return {
        merged: true,
        keeper: { id: next.id, displayName: next.displayName },
        message:
          `${droppedName} was merged into "${next.displayName}", so that record was used instead. ` +
          `The merged copy stays archived — its files and history already live on the surviving record.`
      };
    }

    pointer = mergedIntoIdOf(next.mergeHistoryJson);
  }

  return {
    merged: true,
    keeper: null,
    message:
      `${droppedName} has already been merged into another record and cannot be brought back, ` +
      `and the surviving record could not be identified automatically. ` +
      `Open the candidate to find it, and work from that record instead.`
  };
}
