/**
 * Why a candidate is held out of new requirement scans. A PURE module (no
 * Prisma) so client components can import the labels. The reason lives on the
 * Candidate row (scanExcludedReason); a null reason means the candidate is in
 * the pool. Excluding is independent of pipeline status — a candidate can stay
 * ACTIVE but be hidden from match suggestions until you clear the reason.
 */

export type ScanExclusionReason = "HIRED" | "NOT_ADVANCED" | "CULTURE" | "TEST" | "OTHER";

export const SCAN_EXCLUSION_REASONS: Array<{ key: ScanExclusionReason; label: string; hint: string }> = [
  { key: "TEST", label: "Test candidate", hint: "A test / dummy record — never surface in scans" },
  { key: "HIRED", label: "Hired / current employee", hint: "Already hired or now an employee" },
  { key: "NOT_ADVANCED", label: "Did not pass interview", hint: "Interviewed but not advanced" },
  { key: "CULTURE", label: "Not a culture / values fit", hint: "Did not pass the core-values assessment" },
  { key: "OTHER", label: "Other", hint: "Another reason — add a note" }
];

export const SCAN_EXCLUSION_LABELS: Record<ScanExclusionReason, string> = Object.fromEntries(
  SCAN_EXCLUSION_REASONS.map((reason) => [reason.key, reason.label])
) as Record<ScanExclusionReason, string>;

export function isScanExclusionReason(value: unknown): value is ScanExclusionReason {
  return value === "HIRED" || value === "NOT_ADVANCED" || value === "CULTURE" || value === "TEST" || value === "OTHER";
}
