// The departments turnover is reported in: the Turnover Manager Dashboard's own 13.
//
// His rule, 2026-11-24: "i dont want departments left out. i want it the same
// departments as the document i shared with you." The dashboard (built May 2026 from
// Paycom's Turnover Headcount.xlsx and Terminations.xlsx) groups people into the 13
// below, plus an N/A it never charts. Every one is shown, however small.
//
// Journey files people by NewHire.department, which is spelled many ways and does
// not have an "Exec & Exec Support" at all - in the dashboard that group is a set of
// PEOPLE (the leadership team and their assistant), not a department. So the title
// on the day decides first, then the department. Checked read-only on 2026-11-24
// against the dashboard's month-end headcount for May 2025 - Apr 2026: 10 of the 13
// departments match every month and every month's exits match; Pilot runs 1-3 short,
// SkyOps 1 over from Nov 2025 and OGD FBO 1 short in Apr 2026.
//
// NewHire.department is the CURRENT department, so a person who moved is counted in
// where they are now for their whole history. That is the limit of this mapping.
//
// Client-safe: no Prisma.

export const TURNOVER_DEPARTMENTS = [
  "Accounting & Finance",
  "Cabin Attendant",
  "DVO FBO",
  "Detailing",
  "Exec & Exec Support",
  "HR & Recruiting",
  "MX",
  "OGD FBO",
  "Pilot",
  "SVR FBO",
  "Safety",
  "Sales & Marketing",
  "SkyOps"
] as const;

export type TurnoverDepartment = (typeof TURNOVER_DEPARTMENTS)[number];

/** The dashboard's leadership group, by exact title. */
const EXEC_TITLE = /^(CEO|President|Chief Revenue Officer|VP of Maintenance \/ DoM|Director of Finance & HR|VP of Business Development|Director of Marketing|Executive Assistant)$/;

/**
 * The dashboard department for somebody, from their title on the day and their
 * Journey department. Null is the dashboard's N/A: nothing to place them by.
 */
export function turnoverDepartment(department: string | null, title: string | null): TurnoverDepartment | null {
  const t = (title ?? "").trim();
  const d = (department ?? "").trim();
  if (EXEC_TITLE.test(t)) return "Exec & Exec Support";
  // The Director of Operations flies: the dashboard counts the post as a pilot.
  if (/^VP of Flight Operations/.test(t)) return "Pilot";
  // Two people the dashboard has at the Ogden FBO: a CSR filed under Human Resources
  // in Journey, and the customer-service lead now filed under SVR.
  if (/^Human Resources/.test(d) && t === "CSR") return "OGD FBO";
  if (/SVR/.test(d) && t === "Customer Service Supervisor") return "OGD FBO";

  if (!d) return null;
  if (/^Executive\b/.test(d)) return "Exec & Exec Support";
  if (/^(FlightOps \| Pilots|FlightOps|Pilot|FlightOps \| Managed Client)$/.test(d)) return "Pilot";
  if (/Cabin Attendant/.test(d)) return "Cabin Attendant";
  // Maintenance | FBO is the Ogden line crew.
  if (/^(Maintenance \| FBO|Maintenance \| OGD|FBO \| OGD|OGD FBO)$/.test(d)) return "OGD FBO";
  if (/^(Maintenance|MX|Maintenance \| SLC)$/.test(d)) return "MX";
  if (/DVO/.test(d)) return "DVO FBO";
  if (/SVR/.test(d)) return "SVR FBO";
  if (/^Accounting/.test(d)) return "Accounting & Finance";
  if (/Safety/.test(d)) return "Safety";
  if (/Detailing/.test(d)) return "Detailing";
  if (/^(Sales|Marketing)/.test(d)) return "Sales & Marketing";
  if (/^Human Resources|^HR\b/.test(d)) return "HR & Recruiting";
  if (/^SkyOps$/.test(d)) return "SkyOps";
  return null;
}
