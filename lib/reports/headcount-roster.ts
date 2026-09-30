// The yearly rosters of the Headcount & Tenure report, packed and unpacked, and the
// employment types it counts. PURE - no database - so the server report
// (lib/data/headcount-history.ts) and the page that shows it
// (components/reports/HeadcountTenureReport.tsx) share one definition instead of
// two copies that could drift.

/** Which kind of employee - EmploymentTypePeriod.type. Contract is not one: a contractor is not an employee. */
export const EMPLOYMENT_TYPES = ["FULL_TIME", "PART_TIME", "DAY_RATE", "TEMP", "LEAVE", "INTERN"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  DAY_RATE: "Day-rate",
  TEMP: "Temp",
  LEAVE: "On leave",
  INTERN: "Intern"
};

export function isEmploymentType(v: string | null | undefined): v is EmploymentType {
  return !!v && (EMPLOYMENT_TYPES as readonly string[]).includes(v);
}

export type HeadcountPerson = {
  id: string;
  name: string;
  /** Their role on the snapshot date, or null when none is recorded for it. */
  role: string | null;
  /** Pilot on that date; null when no role is recorded for it. */
  pilot: boolean | null;
  stillHere: boolean;
  /** Service on the snapshot date, in years (one decimal). */
  tenureYears: number;
  /** Working on contract that day - listed, but not counted as an employee. */
  contractor: boolean;
  /** Full-time, part-time... on that date; null when not recorded (and always for a contractor). */
  type: EmploymentType | null;
};

/**
 * One person on one year's roster, packed: [index into people, index into roles
 * or -1 for none recorded, pilot 1 / not 0 / unknown 2, service in tenths of a
 * year, still here 1 / 0, contractor 1 / employee 0, employment type as 1 + its
 * index in EMPLOYMENT_TYPES or 0 for not recorded]. Seventeen years of rosters are
 * ~1,000 entries, and spelled out they repeated every name and title in each year
 * they appear - about a sixth of the whole Reports page.
 */
export type RosterEntry = [person: number, role: number, pilot: 0 | 1 | 2, tenureTenths: number, stillHere: 0 | 1, contractor: 0 | 1, type: number];

export type RosterTables = {
  /** Everybody on any roster, once. */
  people: Array<{ id: string; name: string }>;
  /** Every role title on any roster, once. */
  roles: string[];
};

/** A packer that fills the two tables as it goes. */
export function rosterPacker(): { tables: RosterTables; pack: (p: HeadcountPerson) => RosterEntry } {
  const tables: RosterTables = { people: [], roles: [] };
  const personIndex = new Map<string, number>();
  const roleIndex = new Map<string, number>();
  const pack = (p: HeadcountPerson): RosterEntry => {
    if (!personIndex.has(p.id)) personIndex.set(p.id, tables.people.push({ id: p.id, name: p.name }) - 1);
    let role = -1;
    if (p.role !== null) {
      if (!roleIndex.has(p.role)) roleIndex.set(p.role, tables.roles.push(p.role) - 1);
      role = roleIndex.get(p.role) as number;
    }
    return [
      personIndex.get(p.id) as number,
      role,
      p.pilot === null ? 2 : p.pilot ? 1 : 0,
      Math.round(p.tenureYears * 10),
      p.stillHere ? 1 : 0,
      p.contractor ? 1 : 0,
      p.type ? EMPLOYMENT_TYPES.indexOf(p.type) + 1 : 0
    ];
  };
  return { tables, pack };
}

/** One year's roster, unpacked, in the order it was packed (employees longest-serving first, then contractors). */
export function rosterOf(tables: RosterTables, roster: RosterEntry[]): HeadcountPerson[] {
  return roster.map(([person, role, pilot, tenths, still, contractor, type]) => ({
    id: tables.people[person].id,
    name: tables.people[person].name,
    role: role >= 0 ? tables.roles[role] : null,
    pilot: pilot === 2 ? null : pilot === 1,
    tenureYears: tenths / 10,
    stillHere: still === 1,
    contractor: contractor === 1,
    type: type > 0 ? EMPLOYMENT_TYPES[type - 1] : null
  }));
}
