import type { QualityOfHire, QohHire } from "@/lib/quality-of-hire/report";
import { CATEGORY_ORDER, DECIDED, categorize, type QohCategory } from "@/lib/quality-of-hire/categories";
import { early, median } from "@/lib/quality-of-hire/summary";
import { turnoverDepartment, type TurnoverDepartment } from "@/lib/reports/turnover-departments";

// QUALITY OF HIRE MILESTONE 3 (Dec 3 2026) - the baseline: the Good Hire Criteria
// applied to everyone hired 2021-2025, as the starting numbers Q1 targets are set
// against (his milestones, Nov 5 2026). Counts only: nothing here names a person, so
// the page can be printed and handed to leadership.
//
// Every rule is borrowed, not restated: categorize() for the verdict, early() and
// median() for the speed and early-turnover figures (the Hire quality report's own),
// turnoverDepartment() for the department names Turnover uses. Contractors at hire are
// left out of everything, as on Hire quality.
//
// Pure and client-safe (type-only imports from report.ts), so a frozen copy can be
// drawn by the same component as the live one.

export const BASELINE_FROM = 2021;
export const BASELINE_TO = 2025;

export type CategoryCounts = Record<QohCategory, number>;

export type BaselineRow = { label: string; hires: number; decided: number; counts: CategoryCounts };

export type BaselineNumbers = {
  from: number;
  to: number;
  /** When these numbers were worked out (ISO). */
  computedAt: string;
  hires: number;
  decided: number;
  counts: CategoryCounts;
  byYear: BaselineRow[];
  byGroup: BaselineRow[];
  /** The dashboard's departments with 10 or more hires, largest first, then everyone else together. */
  byDepartment: BaselineRow[];
  measures: {
    leftYearOne: { left: number; of: number };
    left90: { left: number; of: number };
    /** Of these hires, how many still work here on the day the numbers were worked out. */
    stillHere: { here: number; of: number };
    /** Interviews on record per hire: median over hires where any were found. */
    interviews: { median: number | null; withAny: number; searched: number };
    toOffer: { median: number | null; of: number };
    /** Offers to people who applied 2021-2025 (applications start mid-2023). */
    offers: { accepted: number; declined: number; firstYear: number | null };
  };
};

const zero = (): CategoryCounts => Object.fromEntries(CATEGORY_ORDER.map((c) => [c, 0])) as CategoryCounts;

function rowOf(label: string, hs: QohHire[]): BaselineRow {
  const counts = zero();
  for (const h of hs) counts[categorize(h).category] += 1;
  return { label, hires: hs.length, decided: DECIDED.reduce((s, c) => s + counts[c], 0), counts };
}

export function computeBaseline(qoh: QualityOfHire, now: Date = new Date()): BaselineNumbers {
  const hires = qoh.hires.filter((h) => !h.contractor && h.year >= BASELINE_FROM && h.year <= BASELINE_TO);
  const all = rowOf("Everyone", hires);

  const byYear: BaselineRow[] = [];
  for (let y = BASELINE_FROM; y <= BASELINE_TO; y++) byYear.push(rowOf(String(y), hires.filter((h) => h.year === y)));

  const byGroup = [
    rowOf("Pilots", hires.filter((h) => h.pilot === "Pilot")),
    rowOf("Support roles", hires.filter((h) => h.pilot === "Non-pilot")),
    rowOf("Role not recorded", hires.filter((h) => h.pilot === "Role not recorded"))
  ].filter((r) => r.hires > 0);

  const deptOf = (h: QohHire): TurnoverDepartment | "Not recorded" => turnoverDepartment(h.department || null, h.role) ?? "Not recorded";
  const groups = new Map<string, QohHire[]>();
  for (const h of hires) groups.set(deptOf(h), [...(groups.get(deptOf(h)) ?? []), h]);
  const big = [...groups.entries()].filter(([, hs]) => hs.length >= 10).sort((a, b) => b[1].length - a[1].length);
  const rest = [...groups.entries()].filter(([, hs]) => hs.length < 10).flatMap(([, hs]) => hs);
  const byDepartment = [...big.map(([d, hs]) => rowOf(d, hs)), ...(rest.length ? [rowOf("Every other department", rest)] : [])];

  const searched = hires.filter((h) => h.interviews !== null);
  const withAny = searched.filter((h) => (h.interviews ?? 0) > 0);
  const toOffer = hires.flatMap((h) => (h.daysApplyToOffer === null ? [] : [h.daysApplyToOffer]));
  const offers = qoh.offers.filter((o) => o.year >= BASELINE_FROM && o.year <= BASELINE_TO);

  return {
    from: BASELINE_FROM,
    to: BASELINE_TO,
    computedAt: now.toISOString(),
    hires: all.hires,
    decided: all.decided,
    counts: all.counts,
    byYear,
    byGroup,
    byDepartment,
    measures: {
      leftYearOne: early(hires),
      left90: { left: hires.filter((h) => h.left90 === 1).length, of: hires.filter((h) => h.left90 !== null).length },
      stillHere: { here: hires.filter((h) => h.stillHere).length, of: hires.length },
      interviews: { median: median(withAny.map((h) => h.interviews ?? 0)), withAny: withAny.length, searched: searched.length },
      toOffer: { median: median(toOffer), of: toOffer.length },
      offers: {
        accepted: offers.reduce((s, o) => s + o.accepted, 0),
        declined: offers.reduce((s, o) => s + o.declined, 0),
        firstYear: offers.length ? Math.min(...offers.map((o) => o.year)) : null
      }
    }
  };
}
