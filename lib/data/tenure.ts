// Rehire-aware tenure.
//
// Rule: if someone leaves and returns within REHIRE_BRIDGE_MONTHS (3 months),
// their tenure "bridges" — service counts as continuous from the original hire
// date (the short gap is credited). A longer gap RESETS tenure: service and the
// anniversary clock start fresh at the rehire date.
//
// All date math is UTC to match date-only storage.

const DAY = 24 * 60 * 60 * 1000;
export const REHIRE_BRIDGE_MONTHS = 3;

export type TenureStint = { startDate: Date; endDate: Date | null };

export type TenureInfo = {
  originalStart: Date | null; // earliest stint start (true first day)
  serviceStart: Date | null; // effective continuous-service start after the 3-month rule
  rehireStart: Date | null; // most recent stint start when there is more than one stint
  termDate: Date | null; // last departure when there is no currently-open stint
  tenureDays: number | null; // serviceStart -> end (or now); bridged short gaps are counted
  completedYears: number; // whole anniversary years since serviceStart
  stintCount: number;
  rehired: boolean; // more than one stint
  bridged: boolean; // at least one rehire gap was <= 3 months (tenure continued)
  reset: boolean; // tenure was reset by a > 3-month gap
  lastRehireBridged: boolean | null; // the MOST RECENT return: continued (true) or reset (false)
  lastGapDays: number | null; // gap in days before the most recent rehire
};

function addMonthsUTC(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  r.setUTCMonth(r.getUTCMonth() + months);
  return r;
}

function completedYears(anchor: Date, ref: Date): number {
  let years = ref.getUTCFullYear() - anchor.getUTCFullYear();
  const beforeAnniversary =
    ref.getUTCMonth() < anchor.getUTCMonth() ||
    (ref.getUTCMonth() === anchor.getUTCMonth() && ref.getUTCDate() < anchor.getUTCDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

const EMPTY: TenureInfo = {
  originalStart: null,
  serviceStart: null,
  rehireStart: null,
  termDate: null,
  tenureDays: null,
  completedYears: 0,
  stintCount: 0,
  rehired: false,
  bridged: false,
  reset: false,
  lastRehireBridged: null,
  lastGapDays: null
};

export function computeTenure(stints: TenureStint[], now: number): TenureInfo {
  const sorted = stints.filter((s) => s.startDate).sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  if (sorted.length === 0) return EMPTY;

  const originalStart = sorted[0].startDate;
  let serviceStart = originalStart;
  let bridged = false;
  let reset = false;
  let lastRehireBridged: boolean | null = null;
  let lastGapDays: number | null = null;

  for (let i = 1; i < sorted.length; i++) {
    const prevEnd = sorted[i - 1].endDate;
    const start = sorted[i].startDate;
    if (!prevEnd) continue; // prior stint still open (overlap) — treat as continuous
    const isBridged = start.getTime() <= addMonthsUTC(prevEnd, REHIRE_BRIDGE_MONTHS).getTime();
    lastGapDays = Math.max(0, Math.round((start.getTime() - prevEnd.getTime()) / DAY));
    lastRehireBridged = isBridged;
    if (isBridged) {
      bridged = true;
    } else {
      reset = true;
      serviceStart = start; // long gap → tenure restarts here
    }
  }

  const last = sorted[sorted.length - 1];
  const endRef = last.endDate ?? new Date(now);
  const tenureDays = Math.max(0, Math.round((endRef.getTime() - serviceStart.getTime()) / DAY));

  return {
    originalStart,
    serviceStart,
    rehireStart: sorted.length > 1 ? last.startDate : null,
    termDate: last.endDate ?? null,
    tenureDays,
    completedYears: completedYears(serviceStart, endRef),
    stintCount: sorted.length,
    rehired: sorted.length > 1,
    bridged,
    reset,
    lastRehireBridged,
    lastGapDays
  };
}
