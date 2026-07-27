import { prisma } from "@/lib/prisma";
import { normalizeEmail, normalizeName } from "@/lib/candidates/normalize";
import {
  isScanExclusionReason,
  PERMANENT_SCAN_EXCLUSION_REASONS,
  type ScanExclusionReason
} from "@/lib/candidates/scan-exclusion";
import { isArchivedCandidateStatus, NEVER_SCANNED_STATUS } from "@/lib/candidates/scan-pool";

/**
 * THE SKIP LIST.
 *
 * Holding someone out of scans is only safe if you can see who you have held
 * out and put them back, so this module is the read side of scanExcludedReason:
 * the list, and the re-apply check.
 *
 * Re-apply matters because a skip is a decision about a moment, not a permanent
 * verdict on a person. If someone you passed on two years ago applies again, a
 * brand-new candidate record is created and nothing connects it to the old
 * decision — the new record would just get scanned as if the history never
 * happened. So the link is SURFACED and never acted on: no auto-exclusion, no
 * auto-merge. The recruiter is reminded, and decides again.
 */

/** How sure we are that two records are the same human. Never used to act, only to warn. */
export type SkipMatchConfidence = "certain" | "likely" | "possible";

/**
 * Nickname test for two first names sharing a surname. One name must be a
 * PREFIX of the other ("alex" / "alexander"), which is what a shortened form
 * actually looks like.
 *
 * The looser "agree on the first three letters" rule was tried first and, on
 * the real roster, matched Chareese Hicks to Charles Hicks — two different
 * people — for every genuine Alex/Alexander it caught. A "you passed on this
 * person before" prompt that is wrong half the time is worse than one that
 * occasionally stays quiet, so this errs toward silence.
 */
function looksLikeNickname(first: string, other: string) {
  if (first.length < 3 || other.length < 3) return false;
  if (first === other) return true;
  return first.startsWith(other) || other.startsWith(first);
}

export type PriorSkip = {
  candidateId: string;
  name: string;
  reason: ScanExclusionReason | null;
  reasonNote: string | null;
  skippedAt: string | null;
  skippedBy: string | null;
  matchedBy: SkipMatchConfidence;
  matchedOn: string; // plain-English "same email address" / "same name"
  /** Reason that is a standing bar rather than a judgement call about one moment. */
  standingBar: boolean;
};

type CandidateIdentity = {
  id: string;
  displayName: string;
  normalizedEmail: string | null;
  normalizedName: string | null;
};

const IDENTITY_SELECT = {
  id: true,
  displayName: true,
  normalizedEmail: true,
  normalizedName: true,
  scanExcludedReason: true,
  scanExcludedNote: true,
  scanExcludedAt: true,
  scanExcludedBy: true
} as const;

function toPriorSkip(
  row: {
    id: string;
    displayName: string;
    scanExcludedReason: string | null;
    scanExcludedNote: string | null;
    scanExcludedAt: Date | null;
    scanExcludedBy: string | null;
  },
  matchedBy: SkipMatchConfidence,
  matchedOn: string
): PriorSkip {
  const reason = isScanExclusionReason(row.scanExcludedReason) ? row.scanExcludedReason : null;
  return {
    candidateId: row.id,
    name: row.displayName,
    reason,
    reasonNote: row.scanExcludedNote,
    skippedAt: row.scanExcludedAt?.toISOString() ?? null,
    skippedBy: row.scanExcludedBy,
    matchedBy,
    matchedOn,
    standingBar: reason !== null && PERMANENT_SCAN_EXCLUSION_REASONS.includes(reason)
  };
}

/**
 * Other records for what looks like the same person that are ALREADY on the
 * skip list. Three tiers, widest last:
 *
 *   certain  — same email address. The only truly reliable key.
 *   likely   — same full name, normalized.
 *   possible — same surname and first names agreeing on three letters, which
 *              catches "Mike"/"Michael" and extra middle names.
 *
 * The loosest tier is a reminder to go and look, not an assertion, which is why
 * the confidence travels with the result and is shown in the UI. Nothing here
 * writes; a false positive costs a second glance, not a lost applicant.
 */
export async function findPriorSkips(candidate: CandidateIdentity): Promise<PriorSkip[]> {
  const found = new Map<string, PriorSkip>();
  const skipped = {
    scanExcludedReason: { not: null },
    status: { not: NEVER_SCANNED_STATUS },
    id: { not: candidate.id }
  } as const;

  const email = normalizeEmail(candidate.normalizedEmail);
  if (email) {
    const byEmail = await prisma.candidate.findMany({ where: { ...skipped, normalizedEmail: email }, select: IDENTITY_SELECT });
    for (const row of byEmail) found.set(row.id, toPriorSkip(row, "certain", "the same email address"));
  }

  const name = normalizeName(candidate.normalizedName ?? candidate.displayName);
  if (!name) return [...found.values()];

  const byName = await prisma.candidate.findMany({ where: { ...skipped, normalizedName: name }, select: IDENTITY_SELECT });
  for (const row of byName) if (!found.has(row.id)) found.set(row.id, toPriorSkip(row, "likely", "the same name"));

  const parts = name.split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  if (last && first.length >= 3) {
    const sameSurname = await prisma.candidate.findMany({
      where: { ...skipped, normalizedName: { endsWith: ` ${last}` } },
      select: IDENTITY_SELECT
    });
    for (const row of sameSurname) {
      if (found.has(row.id)) continue;
      const otherFirst = (row.normalizedName ?? "").split(/\s+/)[0] ?? "";
      if (looksLikeNickname(first, otherFirst)) {
        found.set(row.id, toPriorSkip(row, "possible", "a matching surname and a shortened first name"));
      }
    }
  }

  return [...found.values()].sort((a, b) => (b.skippedAt ?? "").localeCompare(a.skippedAt ?? ""));
}

// ---------------------------------------------------------------------------
// The list itself
// ---------------------------------------------------------------------------

export type SkippedCandidate = {
  candidateId: string;
  name: string;
  currentTitle: string | null;
  reason: ScanExclusionReason | null;
  reasonNote: string | null;
  skippedAt: string | null;
  skippedBy: string | null;
  fromArchive: boolean;
  standingBar: boolean;
  /**
   * Newer, still-scannable records that look like this same person — i.e. they
   * came back. Empty for the ordinary case.
   */
  reapplied: Array<{ candidateId: string; name: string; matchedBy: SkipMatchConfidence; matchedOn: string }>;
};

/**
 * Everyone currently held out of scans, newest skip first, each with any
 * re-application detected. This is the "see it and undo it" half of the skip
 * list — without it a skip is a one-way door.
 */
export async function getSkippedPool(): Promise<SkippedCandidate[]> {
  const rows = await prisma.candidate.findMany({
    where: { scanExcludedReason: { not: null }, status: { not: NEVER_SCANNED_STATUS } },
    orderBy: [{ scanExcludedAt: "desc" }, { displayName: "asc" }],
    select: { ...IDENTITY_SELECT, currentTitle: true, status: true }
  });
  if (rows.length === 0) return [];

  // Candidates who could be a return: still scannable (not themselves skipped).
  // Loaded once and matched in memory rather than per-row queries.
  const live = await prisma.candidate.findMany({
    where: { scanExcludedReason: null, status: { not: NEVER_SCANNED_STATUS } },
    select: { id: true, displayName: true, normalizedEmail: true, normalizedName: true }
  });

  const byEmail = new Map<string, typeof live>();
  const byName = new Map<string, typeof live>();
  const bySurname = new Map<string, typeof live>();
  for (const person of live) {
    const email = person.normalizedEmail;
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), person]);
    const name = person.normalizedName;
    if (!name) continue;
    byName.set(name, [...(byName.get(name) ?? []), person]);
    const parts = name.split(/\s+/).filter(Boolean);
    const last = parts.length > 1 ? parts[parts.length - 1] : "";
    if (last) bySurname.set(last, [...(bySurname.get(last) ?? []), person]);
  }

  return rows.map((row) => {
    const reason = isScanExclusionReason(row.scanExcludedReason) ? row.scanExcludedReason : null;
    const hits = new Map<string, { candidateId: string; name: string; matchedBy: SkipMatchConfidence; matchedOn: string }>();

    for (const person of row.normalizedEmail ? byEmail.get(row.normalizedEmail) ?? [] : []) {
      hits.set(person.id, { candidateId: person.id, name: person.displayName, matchedBy: "certain", matchedOn: "the same email address" });
    }
    const name = row.normalizedName;
    if (name) {
      for (const person of byName.get(name) ?? []) {
        if (!hits.has(person.id)) {
          hits.set(person.id, { candidateId: person.id, name: person.displayName, matchedBy: "likely", matchedOn: "the same name" });
        }
      }
      const parts = name.split(/\s+/).filter(Boolean);
      const first = parts[0] ?? "";
      const last = parts.length > 1 ? parts[parts.length - 1] : "";
      if (last && first.length >= 3) {
        for (const person of bySurname.get(last) ?? []) {
          if (hits.has(person.id)) continue;
          const otherFirst = (person.normalizedName ?? "").split(/\s+/)[0] ?? "";
          if (looksLikeNickname(first, otherFirst)) {
            hits.set(person.id, {
              candidateId: person.id,
              name: person.displayName,
              matchedBy: "possible",
              matchedOn: "a matching surname and a shortened first name"
            });
          }
        }
      }
    }

    return {
      candidateId: row.id,
      name: row.displayName,
      currentTitle: row.currentTitle,
      reason,
      reasonNote: row.scanExcludedNote,
      skippedAt: row.scanExcludedAt?.toISOString() ?? null,
      skippedBy: row.scanExcludedBy,
      fromArchive: isArchivedCandidateStatus(row.status),
      standingBar: reason !== null && PERMANENT_SCAN_EXCLUSION_REASONS.includes(reason),
      reapplied: [...hits.values()]
    };
  });
}
