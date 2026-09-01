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
    if (contact.type !== "email") {
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
    if (contact.type !== "phone") {
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

  for (const candidate of candidates) {
    for (const email of candidateEmails(candidate)) {
      addToBucket(emailBucket, email, candidate.id);
    }
    for (const phone of candidatePhones(candidate)) {
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
  const existingItems = await prisma.duplicateReviewItem.findMany({
    where: {
      reviewType: "CANDIDATE"
    },
    select: {
      payloadJson: true
    }
  });
  const existingPairKeys = new Set(
    existingItems
      .map((item) => {
        try {
          const payload = item.payloadJson ? JSON.parse(item.payloadJson) : null;
          return typeof payload?.pairKey === "string" ? payload.pairKey : null;
        } catch {
          return null;
        }
      })
      .filter((value): value is string => Boolean(value))
  );

  const newPairs = Array.from(pairs.values()).filter((pair) => !existingPairKeys.has(pair.pairKey));

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

  return {
    scannedCandidates: candidates.length,
    candidatePairsFound: pairs.size,
    newReviewItems: newPairs.length,
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
    existingReviewItems: existingPairKeys.size,
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
