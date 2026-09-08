import { getCrewRoster } from "@/lib/fleet/staffing/roster.server";
import { cntSeat, normSeat } from "@/lib/fleet/staffing/compute";
import { airframeOf, ladderRank } from "@/lib/fleet/pilot-ladder";
import type { CrewGroup, Seat } from "@/lib/fleet/staffing/types";

/**
 * Filled / in-training / open / target headcount per aircraft type and seat, for
 * the Fleet Progression report.
 *
 * WHY THIS EXISTS. The progression report had no staffing numbers at all — it
 * could say 26 pilots upgraded and not that 7 seats are open — and every one of
 * four executive reviews on 2026-09-08 asked for the same thing unprompted:
 * filled against target, by type and seat, and the gap.
 *
 * WHERE THE NUMBERS COME FROM, and this is worth stating because a note in the
 * brief said otherwise: there is NO FleetSeatTarget table. It was proposed in
 * July and never built — grep the schema, there are 60-odd models and it is not
 * one of them. The real source is the Crew org chart's roster: the curated seed
 * in lib/fleet/staffing/crew-data.ts, overridden by whatever an admin has since
 * edited into the WorkspaceSetting fleet/crew-roster. That is the roster the
 * Fleet page renders, so the report and the chart now cannot disagree.
 *
 * The target is the ACTIVE target — filled + training + open, parked seats
 * excluded. That was his ruling on 2026-07-12 ("on hold / not ready to hire"
 * never counts) and cntSeat already implements it; this module just groups.
 */

export type StaffingSeatCount = {
  seat: "PIC" | "SIC";
  filled: number;
  training: number;
  open: number;
  /** Active target: filled + training + open. Parked is deliberately outside it. */
  target: number;
  parked: number;
};

export type StaffingType = {
  /** Stable key for React and for lining up against a pilot's aircraft code. */
  key: string;
  /** Display name, e.g. "G450 / GV". */
  name: string;
  pool: "SkyShare" | "Managed";
  /** Canonical ladder code, or null when the type is not on the ladder. */
  aircraft: string | null;
  /** Ladder rung, -1 off the ladder. Drives the ordering: biggest first. */
  rank: number;
  /** How many tails roll up into this row (managed types are one tail each). */
  tails: number;
  pic: StaffingSeatCount | null;
  sic: StaffingSeatCount | null;
  filled: number;
  training: number;
  open: number;
  target: number;
  parked: number;
};

export type FleetStaffing = {
  types: StaffingType[];
  totals: { filled: number; training: number; open: number; target: number; parked: number };
  /** Airframe codes the fractional pool actually crews — what a shared-pool pilot
   *  can realistically be moved onto. Used to stop the report suggesting a single
   *  managed tail as somebody's next career step. */
  crewedFractional: string[];
  /** Every crewed code, either pool. */
  crewedAll: string[];
};

const EMPTY: FleetStaffing = {
  types: [],
  totals: { filled: 0, training: 0, open: 0, target: 0, parked: 0 },
  crewedFractional: [],
  crewedAll: []
};

function seatCount(seat: "PIC" | "SIC", raw: Seat | null | undefined): StaffingSeatCount | null {
  if (!raw) return null;
  const c = cntSeat(normSeat(raw));
  if (c.at === 0 && c.p === 0) return null;
  return { seat, filled: c.f, training: c.tr, open: c.o, target: c.at, parked: c.p };
}

export async function getFleetStaffing(): Promise<FleetStaffing> {
  let groups: CrewGroup[];
  try {
    groups = (await getCrewRoster()).groups;
  } catch {
    // A staffing panel that cannot load must not take the whole report down with
    // it — the progression half of this page is the part people came for.
    return EMPTY;
  }

  // Roll the tails up by pool + aircraft type. The org chart is per-tail because
  // a managed tail IS the unit there; an exec asking "how are we staffed on the
  // PC-12" means the type, across every tail flying it.
  const byType = new Map<string, StaffingType>();
  for (const g of groups) {
    // noCount exists for a tail whose only pilot is already counted on another
    // aircraft. Counting it here would double him.
    if (g.noCount) continue;
    const code = airframeOf(g.name, null);
    const key = `${g.pool}|${code ?? g.name}`;
    const pic = seatCount("PIC", g.pic);
    const sic = seatCount("SIC", g.sic);
    // A pool-flown managed tail has no seats of its own and contributes nothing.
    if (!pic && !sic) continue;

    const existing = byType.get(key);
    const row: StaffingType = existing ?? {
      key,
      // The group's own name while there is only one tail under it, so "G450 / GV"
      // does not become a barer "G450" than the org chart shows. Once two tails
      // roll up, only the type code is true of both.
      name: g.name,
      pool: g.pool,
      aircraft: code,
      rank: ladderRank(code),
      tails: 0,
      pic: null,
      sic: null,
      filled: 0,
      training: 0,
      open: 0,
      target: 0,
      parked: 0
    };
    row.tails += 1;
    if (row.tails > 1) row.name = code ?? row.name;
    for (const s of [pic, sic]) {
      if (!s) continue;
      const slot = s.seat === "PIC" ? "pic" : "sic";
      const prev = row[slot];
      row[slot] = prev
        ? {
            seat: s.seat,
            filled: prev.filled + s.filled,
            training: prev.training + s.training,
            open: prev.open + s.open,
            target: prev.target + s.target,
            parked: prev.parked + s.parked
          }
        : s;
      row.filled += s.filled;
      row.training += s.training;
      row.open += s.open;
      row.target += s.target;
      row.parked += s.parked;
    }
    byType.set(key, row);
  }

  // Biggest aircraft first, so the row an exec looks for is at the top and the
  // order matches the ladder the rest of the report is built on. Off-ladder types
  // sink to the bottom rather than sorting as rung -1 above the PC-12.
  const types = [...byType.values()].sort(
    (a, b) =>
      (b.rank < 0 ? -1 : b.rank) - (a.rank < 0 ? -1 : a.rank) ||
      a.pool.localeCompare(b.pool) ||
      a.name.localeCompare(b.name)
  );

  const totals = types.reduce(
    (acc, t) => ({
      filled: acc.filled + t.filled,
      training: acc.training + t.training,
      open: acc.open + t.open,
      target: acc.target + t.target,
      parked: acc.parked + t.parked
    }),
    { filled: 0, training: 0, open: 0, target: 0, parked: 0 }
  );

  const crewed = (pred: (t: StaffingType) => boolean) =>
    [...new Set(types.filter((t) => pred(t) && t.aircraft).map((t) => t.aircraft as string))];

  return {
    types,
    totals,
    crewedFractional: crewed((t) => t.pool === "SkyShare"),
    crewedAll: crewed(() => true)
  };
}
