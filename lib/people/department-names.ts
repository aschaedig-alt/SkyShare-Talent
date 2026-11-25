// Old department spellings -> the names in use now.
//
// On 2026-11-19 he renamed departments on the PROFILES (NewHire.department):
// "FBOs should be FBO | SVR, FBO | DVO, FBO | OGD", detailing and safety are
// sub-departments of SkyOps, crew is "FlightOps | Pilots" / "FlightOps | Cabin
// Attendants", base support is "Maintenance | FBO". The rules, with his words,
// are in scripts/_dept-fix-61bc6b19/dept-fix.ts.
//
// The ROLE HISTORY (RoleAssignment.department) was not renamed, so a report that
// reads the department someone had when they were hired showed the old and new
// spellings side by side ("FBO | OGD" and "OGD FBO", "SkyOps | Detailing" and
// "Detailing") - Aimee, feedback cmwtuqny0, Nov 23: "fix these departments
// please. weve updated the list recently. clean them up."
//
// This maps a recorded spelling to today's name for DISPLAY and GROUPING. It
// writes nothing: the role history still says what it said.
//
// Client-safe: no Prisma.

/** Spellings that became one name for everybody (a pure rename). */
const RENAMED: Record<string, string> = {
  "SVR FBO": "FBO | SVR",
  "FBO SVR": "FBO | SVR",
  SVR: "FBO | SVR",
  "DVO FBO": "FBO | DVO",
  "OGD FBO": "FBO | OGD",
  Detailing: "SkyOps | Detailing",
  Safety: "SkyOps | Safety",
  Pilot: "FlightOps | Pilots",
  "FlightOps | Managed Client": "FlightOps | Pilots",
  "Cabin Attendant": "FlightOps | Cabin Attendants",
  "FBO Maintenance": "Maintenance | FBO",
  MX: "Maintenance",
  "Maintenance | SLC": "Maintenance",
  "Maintenance | OGD": "Maintenance",
  "Accounting & Finance": "Accounting",
  "Sales & Marketing": "Sales | Marketing",
  Marketing: "Sales | Marketing"
};

/**
 * Old names that were split PERSON BY PERSON (plain "Sales" went to Charter,
 * Brokerage, Fractional, Marketing, OpenJet or Executive | Sales by role; plain
 * "FBO" and "FlightOps" likewise). For these the person's current profile holds
 * the decided answer, so it is used when it is a sub-department of the same family.
 */
const SPLIT_BY_PERSON = new Set(["Sales", "FBO", "FlightOps"]);

function samefamily(old: string, profile: string): boolean {
  if (profile.startsWith(`${old} |`)) return true;
  // The Sales split also produced Executive | Sales.
  return old === "Sales" && profile === "Executive | Sales";
}

/**
 * Today's name for a recorded department.
 *
 * @param recorded what the record says (role history, usually)
 * @param profileDepartment the person's CURRENT profile department, used only to
 *        settle a name that was split person by person
 */
export function currentDepartmentName(recorded: string | null | undefined, profileDepartment?: string | null): string | null {
  const d = (recorded ?? "").trim();
  if (!d) return null;
  const renamed = RENAMED[d];
  if (renamed) return renamed;
  if (SPLIT_BY_PERSON.has(d)) {
    const p = (profileDepartment ?? "").trim();
    if (p && samefamily(d, p)) return p;
  }
  return d;
}
