import type { QohHire } from "@/lib/quality-of-hire/report";

// Hire quality's headline rule, in one place: the Hire quality report's hero and the
// Reports "At a glance" card both read it, so the two cannot show different numbers.
// Type-only import: client-safe.

/** The middle value, rounded to a whole day: Hire quality's speed tiles and the Offers report. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Left within a year, over the hires that can answer it (left365 is null when it is too soon, or the last day cannot say). */
export function early(hs: Pick<QohHire, "left365">[]): { left: number; of: number } {
  const known = hs.filter((h) => h.left365 !== null);
  return { left: known.filter((h) => h.left365 === 1).length, of: known.length };
}
