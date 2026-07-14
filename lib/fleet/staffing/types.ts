// Types for the Fleet staffing org charts (Crew + Maintenance).
//
// NOTE: this is a CURATED data model, deliberately decoupled from the live
// database. The app has no seat-target / shift / supervisor / candidate-per-seat
// model yet, so these org charts are driven by editable seed data in
// crew-data.ts / maintenance-data.ts. When real data is available we can wire
// the `line` (filled) arrays to NewHire/RoleAssignment and keep the rest here.

export type CrewPool = "SkyShare" | "Managed";

/** One block of seats — captains, first officers, or a maintenance shift. */
export interface Seat {
  /** Currently-filled people (on the line / on staff). */
  line?: string[];
  /** People in training for this seat. */
  train?: string[];
  /** Named tentative candidates working toward an open seat. */
  cand?: string[];
  /** Count of unfilled reqs with no name attached. */
  open?: number;
  /** Unfilled reqs that carry a label (e.g. "Ogden Team Lead"). */
  openNamed?: string[];
  /** On-hold / parked seats — shown but never counted. */
  parked?: number;
}

export interface Departure {
  name: string;
  to?: string;
  reason?: string;
}

/** A crew group = an aircraft type (fractional) or a single managed tail. */
export interface CrewGroup {
  name: string;
  pool: CrewPool;
  sub: string;
  lead?: string;
  pic?: Seat | null;
  sic?: Seat | null;
  cabin?: Seat;
  out?: Departure[];
  /** Per-person qualification tags (ARGUS, Check Airman, Standards, 1099, +TYPE dual-qual), keyed by exact name. */
  tags?: Record<string, string[]>;
  /** Managed tail with no dedicated crew — flown from the shared fractional pool. */
  poolFlown?: boolean;
  /** Override text for a poolFlown card (e.g. flown by a specific dual-rated pilot). */
  poolNote?: string;
  /** data: URI or /public path to a horizontal aircraft photo. */
  photo?: string;
}

export interface CrewLeadership {
  chiefName: string;
  chiefRole: string;
  reportsTo: string;
  assistants: { role: string; name: string }[];
}

/** Turnover rate (%) and time-to-fill (days) for a crew group. */
export interface TurnStat {
  r: number | null;
  t: number | null;
}

export type MxPool = "Line" | "Admin";

/** A labeled block of seats inside a maintenance group (a shift or a role). */
export interface MxSection extends Seat {
  label: string;
}

/** A maintenance group = a line station, flex pool, or admin function. */
export interface MxGroup {
  name: string;
  pool: MxPool;
  sub: string;
  mgr: string;
  sections: MxSection[];
}
