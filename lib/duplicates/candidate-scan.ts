import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizeName, normalizePhone } from "@/lib/candidates/normalize";

type CandidateForScan = {
  id: string;
  displayName: string;
  normalizedName: string | null;
  normalizedEmail: string | null;
  normalizedPhone: string | null;
  contacts: Array<{
    type: string;
    normalized: string | null;
    value: string;
  }>;
};

type DuplicatePair = {
  pairKey: string;
  primaryCandidateId: string;
  secondaryCandidateId: string;
  reason: string;
  confidence: string;
  matchedValue: string;
};

/** One side of a detected pair, with just enough to recognize the person. */
export type DetectedPairCandidate = {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  /** ACTIVE / ARCHIVED. A detected pair never contains a MERGED row — the scan
      pool excludes them — so this is only ever used to mark the archived side. */
  status: string;
  origin: string | null;
  archived: boolean;
};

/**
 * What happened to this pair, from the scan's point of view.
 *
 *   NEW       — created just now, sitting in the review queue.
 *   OPEN      — a review item already existed and is still in the queue.
 *   DISMISSED — somebody marked it "not a duplicate".
 *   RESOLVED  — somebody closed it out (usually by merging).
 */
export type DetectedPairReviewStatus = "NEW" | "OPEN" | "RESOLVED" | "DISMISSED";

/**
 * A pair this run actually detected, named.
 *
 * The scan used to return counts only, so the card could say "3 possible pairs"
 * and the page could show nobody — reported by Aimee on 2026-08-31 and the whole
 * reason this type exists. Detected is NOT the same as actionable: a pair whose
 * review item was dismissed in July is still detected on every run, still counted
 * in candidatePairsFound, and creates nothing. Now it at least says who it is.
 */
export type DetectedPair = {
  pairKey: string;
  reason: string;
  confidence: string;
  /** The email, phone or normalized name the two records share. */
  matchedValue: string;
  /** The review item this pair maps to. Null only if the create failed. */
  reviewItemId: string | null;
  reviewStatus: DetectedPairReviewStatus;
  /** When the item was closed, for "dismissed Jul 29". */
  reviewClosedAt: string | null;
  /**
   * Whether reopening this pair could actually end in a merge. Mirrors
   * reopenEligibility in lib/data/duplicate-review.ts, which is module-private
   * there; both encode the same two rules (the self-heal below, and the two
   * refusals in lib/candidates/merge.ts). If one moves, move the other.
   */
  canReopen: boolean;
  left: DetectedPairCandidate | null;
  right: DetectedPairCandidate | null;
};

/**
 * Cap on how many detected pairs travel back to the browser.
 *
 * Two exist today. The name bucket, though, is one bad import away from a
 * thousand — 5,033 of the current pool have no email or phone at all, so name is
 * the only rule that can reach them — and a pair list that has to be paged is a
 * different feature. Cap it, say so, and keep candidatePairsFound truthful.
 */
const DETECTED_PAIR_LIMIT = 200;

const STATUS_ORDER: Record<DetectedPairReviewStatus, number> = {
  NEW: 0,
  OPEN: 1,
  DISMISSED: 2,
  RESOLVED: 3
};

/**
 * DuplicateReviewItem.status is a free String column, not an enum. Only OPEN,
 * RESOLVED and DISMISSED are in use across all 44 live rows, but anything else
 * lands on RESOLVED — "closed, and not because somebody said not-a-duplicate" —
 * rather than being reported as still open, which would send her to a queue that
 * does not contain it.
 */
function reviewStatusOf(status: string | null | undefined): DetectedPairReviewStatus {
  const value = (status ?? "").toUpperCase();
  if (value === "OPEN") {
    return "OPEN";
  }
  if (value === "DISMISSED") {
    return "DISMISSED";
  }
  return "RESOLVED";
}

function addToBucket(bucket: Map<string, Set<string>>, key: string | null, candidateId: string) {
  if (!key) {
    return;
  }

  const ids = bucket.get(key) ?? new Set<string>();
  ids.add(candidateId);
  bucket.set(key, ids);
}

function makePairKey(left: string, right: string) {
  return [left, right].sort().join("::");
}

function addPairsFromBucket(
  pairs: Map<string, DuplicatePair>,
  bucket: Map<string, Set<string>>,
  reason: string,
  confidence: string
) {
  for (const [matchedValue, ids] of bucket.entries()) {
    const values = Array.from(ids);
    if (values.length < 2) {
      continue;
    }

    for (let outer = 0; outer < values.length; outer += 1) {
      for (let inner = outer + 1; inner < values.length; inner += 1) {
        const primaryCandidateId = values[outer];
        const secondaryCandidateId = values[inner];
        const pairKey = makePairKey(primaryCandidateId, secondaryCandidateId);
        const existing = pairs.get(pairKey);

        if (existing && existing.confidence === "HIGH") {
          continue;
        }

        pairs.set(pairKey, {
          pairKey,
          primaryCandidateId,
          secondaryCandidateId,
          reason,
          confidence,
          matchedValue
        });
      }
    }
  }
}

function candidateEmails(candidate: CandidateForScan) {
  const values = new Set<string>();
  const primary = normalizeEmail(candidate.normalizedEmail);
  if (primary) {
    values.add(primary);
  }

  for (const contact of candidate.contacts) {
    // CandidateContact.type is a free String and the live table holds BOTH cases
    // ("EMAIL" 442 / "PHONE" 123 / "email" 101 / "phone" 59). A case-sensitive
    // compare silently skipped 565 of 725 contact rows.
    if (contact.type.toLowerCase() !== "email") {
      continue;
    }
    const normalized = normalizeEmail(contact.normalized ?? contact.value);
    if (normalized) {
      values.add(normalized);
    }
  }

  return values;
}

function candidatePhones(candidate: CandidateForScan) {
  const values = new Set<string>();
  const primary = normalizePhone(candidate.normalizedPhone);
  if (primary) {
    values.add(primary);
  }

  for (const contact of candidate.contacts) {
    // Same case trap as candidateEmails above.
    if (contact.type.toLowerCase() !== "phone") {
      continue;
    }
    const normalized = normalizePhone(contact.normalized ?? contact.value);
    if (normalized) {
      values.add(normalized);
    }
  }

  return values;
}

function candidateName(candidate: CandidateForScan) {
  return normalizeName(candidate.normalizedName ?? candidate.displayName);
}

export async function scanCandidateDuplicates() {
  const startedAt = performance.now();
  const candidates = await prisma.candidate.findMany({
    // Exclude candidates that were already merged away — they shouldn't resurface as duplicates.
    where: { status: { not: "MERGED" } },
    select: {
      id: true,
      displayName: true,
      normalizedName: true,
      normalizedEmail: true,
      normalizedPhone: true,
      contacts: {
        select: {
          type: true,
          normalized: true,
          value: true
        }
      }
    }
  });

  const emailBucket = new Map<string, Set<string>>();
  const phoneBucket = new Map<string, Set<string>>();
  const nameBucket = new Map<string, Set<string>>();

  /**
   * Candidates the two HIGH-confidence rules cannot reach at all.
   *
   * Counted here rather than inferred from bucket sizes, because a bucket counts
   * distinct VALUES and this counts PEOPLE. It is the scan's own blind spot and
   * the card states it on every run: on today's pool 5,033 of 8,651 carry
   * neither an email nor a phone, so for 58% of the pool an exact name match is
   * the only rule that can fire — and an exact name match is a coincidence worth
   * a look, not evidence. A scan that reports "2 pairs" without that number
   * invites the reading that there are only 2 duplicates.
   */
  let contactlessCandidates = 0;

  for (const candidate of candidates) {
    const emails = candidateEmails(candidate);
    const phones = candidatePhones(candidate);
    if (emails.size === 0 && phones.size === 0) {
      contactlessCandidates += 1;
    }
    for (const email of emails) {
      addToBucket(emailBucket, email, candidate.id);
    }
    for (const phone of phones) {
      addToBucket(phoneBucket, phone, candidate.id);
    }
    addToBucket(nameBucket, candidateName(candidate), candidate.id);
  }

  const pairs = new Map<string, DuplicatePair>();
  addPairsFromBucket(pairs, emailBucket, "exact-normalized-email-match", "HIGH");
  addPairsFromBucket(pairs, phoneBucket, "exact-normalized-phone-match", "HIGH");
  addPairsFromBucket(pairs, nameBucket, "same-normalized-name-review", "MANUAL");

  // Dedupe against EVERY prior candidate review item (open, resolved, or dismissed)
  // so a pair someone already merged or marked "not a duplicate" never comes back.
  //
  // This used to select payloadJson alone and reduce it to a Set of keys, which is
  // where the identity was thrown away: the run knew perfectly well that the pair
  // it had just counted was dismissed on Jul 29, and discarded the row that said
  // so. Keep the whole item, so the card can name the pair AND say what was
  // decided about it.
  const existingItems = await prisma.duplicateReviewItem.findMany({
    where: {
      reviewType: "CANDIDATE"
    },
    select: {
      id: true,
      status: true,
      createdAt: true,
      resolvedAt: true,
      payloadJson: true
    }
  });

  /** payloadJson is a String column, not Json — it arrives as raw text. */
  function pairKeyOf(raw: string | null): string | null {
    if (!raw) {
      return null;
    }
    try {
      const payload = JSON.parse(raw) as { pairKey?: unknown };
      return typeof payload.pairKey === "string" ? payload.pairKey : null;
    } catch {
      return null;
    }
  }

  // 44 live items collapse to 33 distinct pair keys — 11 pairs are recorded twice,
  // sometimes with primary/secondary swapped (the key is sorted, the id columns are
  // not). Match on the key only, and keep the MOST RECENT decision, or the card
  // would show a pair twice and could report the older of two verdicts.
  type ExistingItem = (typeof existingItems)[number];
  const existingByPairKey = new Map<string, ExistingItem>();
  const decidedAt = (item: ExistingItem) => (item.resolvedAt ?? item.createdAt).getTime();
  for (const item of existingItems) {
    const key = pairKeyOf(item.payloadJson);
    if (!key) {
      continue;
    }
    const held = existingByPairKey.get(key);
    if (!held || decidedAt(item) > decidedAt(held)) {
      existingByPairKey.set(key, item);
    }
  }

  const newPairs = Array.from(pairs.values()).filter((pair) => !existingByPairKey.has(pair.pairKey));

  if (newPairs.length > 0) {
    await prisma.duplicateReviewItem.createMany({
      data: newPairs.map((pair) => ({
        reviewType: "CANDIDATE",
        status: "OPEN",
        reason: pair.reason,
        confidence: pair.confidence,
        primaryCandidateId: pair.primaryCandidateId,
        secondaryCandidateId: pair.secondaryCandidateId,
        payloadJson: JSON.stringify({
          pairKey: pair.pairKey,
          matchedValue: pair.matchedValue,
          scanVersion: 1
        })
      }))
    });
  }

  // Self-heal stale pairs. An OPEN pair whose keep or drop candidate has already
  // been merged away (or deleted) can never succeed — mergeCandidates rejects it
  // outright — so leaving it in the queue just hands someone a button that always
  // fails. These are left behind by the standalone merge scripts, which (unlike
  // mergeCandidates) don't resolve the review items they invalidate. Resolve them
  // so the queue only offers pairs that can actually be actioned.
  const openItems = await prisma.duplicateReviewItem.findMany({
    where: { reviewType: "CANDIDATE", status: "OPEN" },
    select: {
      id: true,
      primaryCandidate: { select: { status: true } },
      secondaryCandidate: { select: { status: true } }
    }
  });
  const staleIds = openItems
    .filter(
      (i) =>
        !i.primaryCandidate ||
        !i.secondaryCandidate ||
        i.primaryCandidate.status === "MERGED" ||
        i.secondaryCandidate.status === "MERGED"
    )
    .map((i) => i.id);
  if (staleIds.length > 0) {
    await prisma.duplicateReviewItem.updateMany({
      where: { id: { in: staleIds } },
      data: { status: "RESOLVED", resolvedAt: new Date() }
    });
  }

  // ---------------------------------------------------------------------------
  // Name the pairs.
  //
  // Everything above this line is the original scan. Everything below is
  // read-only: two SELECTs that turn the pair keys into people, so the card can
  // show WHO was detected instead of only HOW MANY. It runs after the writes on
  // purpose, so the status each pair reports is its status now — a pair created a
  // moment ago reads NEW, not "no item".
  // ---------------------------------------------------------------------------
  const newPairKeys = new Set(newPairs.map((pair) => pair.pairKey));
  const rankedPairs = Array.from(pairs.values()).sort((left, right) => {
    const leftStatus = newPairKeys.has(left.pairKey)
      ? STATUS_ORDER.NEW
      : STATUS_ORDER[reviewStatusOf(existingByPairKey.get(left.pairKey)?.status)];
    const rightStatus = newPairKeys.has(right.pairKey)
      ? STATUS_ORDER.NEW
      : STATUS_ORDER[reviewStatusOf(existingByPairKey.get(right.pairKey)?.status)];
    if (leftStatus !== rightStatus) {
      return leftStatus - rightStatus;
    }
    // HIGH (a shared email or phone) before MANUAL (a shared name), because one
    // is evidence and the other is a coincidence worth a look.
    if (left.confidence !== right.confidence) {
      return left.confidence === "HIGH" ? -1 : 1;
    }
    return left.matchedValue.localeCompare(right.matchedValue);
  });
  const shownPairs = rankedPairs.slice(0, DETECTED_PAIR_LIMIT);

  const shownCandidateIds = Array.from(
    new Set(shownPairs.flatMap((pair) => [pair.primaryCandidateId, pair.secondaryCandidateId]))
  );

  const [briefRows, itemRows] = await Promise.all([
    shownCandidateIds.length > 0
      ? prisma.candidate.findMany({
          where: { id: { in: shownCandidateIds } },
          select: {
            id: true,
            displayName: true,
            primaryEmail: true,
            primaryPhone: true,
            status: true,
            origin: true,
            archivedAt: true
          }
        })
      : Promise.resolve([]),
    // Every item touching either side of a shown pair. The pair key is built from
    // those two ids, so this reaches every row that can carry the key — including
    // the ones created a few lines above.
    shownCandidateIds.length > 0
      ? prisma.duplicateReviewItem.findMany({
          where: {
            reviewType: "CANDIDATE",
            OR: [
              { primaryCandidateId: { in: shownCandidateIds } },
              { secondaryCandidateId: { in: shownCandidateIds } }
            ]
          },
          select: { id: true, status: true, createdAt: true, resolvedAt: true, payloadJson: true }
        })
      : Promise.resolve([])
  ]);

  const briefById = new Map<string, DetectedPairCandidate>(
    briefRows.map((row) => [
      row.id,
      {
        id: row.id,
        displayName: row.displayName,
        email: row.primaryEmail,
        phone: row.primaryPhone,
        status: row.status,
        origin: row.origin,
        archived: Boolean(row.archivedAt)
      }
    ])
  );

  const freshByPairKey = new Map<string, ExistingItem>();
  for (const item of itemRows) {
    const key = pairKeyOf(item.payloadJson);
    if (!key) {
      continue;
    }
    const held = freshByPairKey.get(key);
    if (!held || decidedAt(item) > decidedAt(held)) {
      freshByPairKey.set(key, item);
    }
  }

  const detected: DetectedPair[] = shownPairs.map((pair) => {
    const item = freshByPairKey.get(pair.pairKey) ?? existingByPairKey.get(pair.pairKey) ?? null;
    const isNew = newPairKeys.has(pair.pairKey);
    const reviewStatus: DetectedPairReviewStatus = isNew ? "NEW" : reviewStatusOf(item?.status);
    const left = briefById.get(pair.primaryCandidateId) ?? null;
    const right = briefById.get(pair.secondaryCandidateId) ?? null;
    return {
      pairKey: pair.pairKey,
      reason: pair.reason,
      confidence: pair.confidence,
      matchedValue: pair.matchedValue,
      reviewItemId: item?.id ?? null,
      reviewStatus,
      reviewClosedAt: item?.resolvedAt ? item.resolvedAt.toISOString() : null,
      // A pair is only worth reopening if both records still exist and neither has
      // been merged away — otherwise the next scan re-closes it and the merge
      // engine would refuse it anyway. Both sides of a DETECTED pair are non-MERGED
      // by construction (the pool excludes MERGED), so this is belt and braces
      // rather than a filter that fires today.
      canReopen:
        (reviewStatus === "DISMISSED" || reviewStatus === "RESOLVED") &&
        Boolean(item) &&
        Boolean(left) &&
        Boolean(right) &&
        left?.status !== "MERGED" &&
        right?.status !== "MERGED",
      left,
      right
    };
  });

  return {
    scannedCandidates: candidates.length,
    /**
     * How many of those the email and phone rules could not see at all. Reported
     * on the card so "N pairs found" is never read as "N duplicates exist".
     */
    contactlessCandidates,
    candidatePairsFound: pairs.size,
    newReviewItems: newPairs.length,
    /**
     * Every pair this run detected, named — capped at DETECTED_PAIR_LIMIT.
     *
     * detected.length can therefore be smaller than candidatePairsFound; the card
     * says so rather than quietly showing a short list against a bigger number,
     * which is the same defect this whole change exists to remove.
     */
    detected,
    detectedTruncated: rankedPairs.length > shownPairs.length,
    /**
     * Of the pairs THIS run detected, how many already had a review item.
     *
     * Deliberately not existingReviewItems below, which counts every pair key
     * ever recorded — including ones this scan no longer detects. The banner
     * needs the two numbers to add up to candidatePairsFound, or it is back to
     * reporting a total nothing on the page accounts for, which is the exact
     * complaint this is fixing.
     */
    alreadyReviewedPairs: pairs.size - newPairs.length,
    /** Distinct pair keys ever recorded. 44 live items, 33 distinct keys. */
    existingReviewItems: existingByPairKey.size,
    /** Open pairs that could never merge (a side was already merged/deleted). */
    staleResolved: staleIds.length,
    durationMs: Math.round(performance.now() - startedAt),
    bucketCounts: {
      email: emailBucket.size,
      phone: phoneBucket.size,
      name: nameBucket.size
    }
  };
}
