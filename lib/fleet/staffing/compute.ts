import type { Seat } from "./types";

export interface NormSeat {
  line: string[];
  train: string[];
  cand: string[];
  candInt: string[];
  open: number;
  openNamed: string[];
  parked: number;
}

export interface SeatCount {
  /** filled */
  f: number;
  /** in training */
  tr: number;
  /** open (bare opens + named opens + tentative candidates) */
  o: number;
  /** parked */
  p: number;
  /** active target = filled + training + open (parked excluded) */
  at: number;
}

export function normSeat(o?: Seat | null): NormSeat {
  const s = o || {};
  return {
    line: s.line || [],
    train: s.train || [],
    cand: s.cand || [],
    candInt: s.candInt || [],
    open: s.open || 0,
    openNamed: s.openNamed || [],
    parked: s.parked || 0
  };
}

export function cntSeat(o: NormSeat): SeatCount {
  // Tentative candidates (external `cand` + internal `candInt`) count as pending/
  // open until confirmed — same as a bare open req, just named.
  const open = o.open + o.openNamed.length + o.cand.length + o.candInt.length;
  return {
    f: o.line.length,
    tr: o.train.length,
    o: open,
    p: o.parked,
    at: o.line.length + o.train.length + o.open + o.openNamed.length + o.cand.length + o.candInt.length
  };
}

/** Two-letter initials, ignoring quoted nicknames like Jonathan "JJ" Jehle. */
export function initials(name: string): string {
  const parts = name.replace(/"[^"]*"/g, " ").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] || "" : "";
  return (first + last).toUpperCase();
}
