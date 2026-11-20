// SkyShare Values in Action - the program rules, in one place.
//
// Kevin's (Director of HR) proposal, approved by Tommy in Nov 2026, replaces the
// peer-to-peer points program with manager-led recognition paid from a dollar
// budget. The rules below are his and the user's, confirmed in chat on
// 2026-11-19:
//   - $25 per employee per quarter.
//   - Every company employee counts, full and part time. Contractors do not.
//   - Each department has its own budget, from its own headcount, using the
//     department as recorded on the person's profile. Every manager in the
//     department draws from that one shared budget.
//   - Headcount is taken on the FIRST DAY of the quarter (Mountain time), so a
//     budget does not move when somebody joins or leaves mid-quarter.
//   - For now only managers give. A manager is anyone set as the supervisor of
//     at least one current employee.
//   - A department with no manager inside it is spent by the supervisors of its
//     people ("supervisor spends", his answer 2026-11-19). The budget still
//     belongs to that department and is reported as its own line.
//   - Still to be decided, deliberately not built: whether unused budget rolls
//     over, and whether a department can borrow from a future quarter.

export const VIA_TIMEZONE = "America/Denver";
export const DEFAULT_PER_PERSON_QUARTER_USD = 25;

/** Contractors are never in the program: not counted, not recognized, not giving. */
export const EXCLUDED_EMPLOYMENT_STATUS = "CONTRACT";

/** Shown for a person whose profile has no department. */
export const NO_DEPARTMENT = "No department";

export type Quarter = {
  year: number;
  q: 1 | 2 | 3 | 4;
  /** "Q4 2026" */
  label: string;
  /** "2026-Q4" - stable, for storage and URLs. */
  key: string;
  /** First and last calendar day, YYYY-MM-DD, Mountain time. */
  startDay: string;
  endDay: string;
};

const ymdFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: VIA_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

/** The calendar day a moment falls on in Mountain time, as YYYY-MM-DD. */
export function mountainDay(d: Date): string {
  return ymdFormatter.format(d);
}

const QUARTER_BOUNDS: Record<1 | 2 | 3 | 4, [string, string]> = {
  1: ["01-01", "03-31"],
  2: ["04-01", "06-30"],
  3: ["07-01", "09-30"],
  4: ["10-01", "12-31"]
};

export function makeQuarter(year: number, q: 1 | 2 | 3 | 4): Quarter {
  const [s, e] = QUARTER_BOUNDS[q];
  return { year, q, label: `Q${q} ${year}`, key: `${year}-Q${q}`, startDay: `${year}-${s}`, endDay: `${year}-${e}` };
}

export function quarterOf(d: Date = new Date()): Quarter {
  const day = mountainDay(d);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  return makeQuarter(year, (Math.floor((month - 1) / 3) + 1) as 1 | 2 | 3 | 4);
}

/** "2026-Q4" -> Quarter, or null for anything else. */
export function parseQuarterKey(key: string | null | undefined): Quarter | null {
  const m = /^(\d{4})-Q([1-4])$/.exec(key ?? "");
  return m ? makeQuarter(Number(m[1]), Number(m[2]) as 1 | 2 | 3 | 4) : null;
}

export type EmploymentFacts = {
  employmentStatus: string;
  startDate: Date | null;
  terminationDate: Date | null;
  employmentStints: { startDate: Date; endDate: Date | null }[];
};

/**
 * Was this person a (non-contractor) employee on `day`?
 *
 * Employment stints are the better record, but on 2026-11-19 95 of the 183
 * current employees had none, so a person without stints falls back to the
 * profile's start and termination dates. A current employee with no start date
 * at all is counted: they are on the roster today and nothing says they
 * started late. A former employee with no termination date is NOT counted,
 * because nothing says when they left.
 */
export function employedOnDay(p: EmploymentFacts, day: string): boolean {
  if (p.employmentStatus === EXCLUDED_EMPLOYMENT_STATUS) return false;
  if (p.employmentStints.length > 0) {
    return p.employmentStints.some((s) => {
      if (mountainDay(s.startDate) > day) return false;
      // An open stint on a FORMER employee: the stint was never closed. Fall back to
      // the profile's last day; with neither, nothing says they were still here.
      // (No-starts are a separate case - canceled offers - and are filtered out
      // before this is called; see lib/data/values-in-action.ts.)
      const end = s.endDate ?? (p.employmentStatus === "ACTIVE" ? null : p.terminationDate);
      if (!end) return p.employmentStatus === "ACTIVE";
      return mountainDay(end) >= day;
    });
  }
  if (p.startDate && mountainDay(p.startDate) > day) return false;
  if (p.terminationDate) return mountainDay(p.terminationDate) >= day;
  return p.employmentStatus === "ACTIVE";
}

/** The budget department a profile's department string belongs to. */
export function budgetDepartment(department: string | null | undefined): string {
  const d = (department ?? "").trim();
  return d || NO_DEPARTMENT;
}

/**
 * A loose key for spotting the same department spelled two ways ("SVR FBO" /
 * "FBO SVR", "FBO | DVO" / "DVO FBO"). Used only to POINT the reader at a
 * likely duplicate. Budgets never merge on it: which spelling is right is
 * HR's call, made by fixing the profiles.
 */
export function departmentLooseKey(department: string): string {
  return department
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}
