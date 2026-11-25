// THE REPORTS LIBRARY - every report, its group and its own URL, in one place.
//
// He picked the "Library" redesign on 2026-11-24 (redesign 3 of 5 in the clickable
// prototype): a side list grouped People / Pilots / Hiring / Costs, "At a glance"
// pinned first, one report at a time, each on a link that can be sent to somebody.
// The side list, the phone menu and the At a glance cards all read this list, so a
// report cannot be in one and missing from another.
//
// Client-safe: no Prisma, no server imports.

export type ReportGroup = "People" | "Pilots" | "Hiring" | "Costs";

export type ReportEntry = {
  id: string;
  group: ReportGroup;
  title: string;
  /** The question the report answers, for search and the At a glance cards. */
  question: string;
  href: string;
  /** Admins only: the report names why people left, or carries managers' notes. */
  hrOnly?: boolean;
};

export const REPORT_GROUPS: ReportGroup[] = ["People", "Pilots", "Hiring", "Costs"];

export const REPORTS: ReportEntry[] = [
  { id: "headcount", group: "People", title: "Headcount & tenure", question: "Who works here, and how long do people stay?", href: "/reports/people/headcount" },
  { id: "turnover", group: "People", title: "Turnover", question: "How many people leave in a year?", href: "/reports/people/turnover" },
  { id: "progression", group: "Pilots", title: "Fleet progression", question: "Are pilot seats filled, and how do pilots move up?", href: "/reports/pilots/progression" },
  { id: "quality", group: "Hiring", title: "Hire quality", question: "Are we hiring well?", href: "/reports/hiring/quality", hrOnly: true },
  { id: "check-ins", group: "Hiring", title: "Manager check-ins", question: "What do managers say about new hires?", href: "/reports/hiring/check-ins", hrOnly: true },
  { id: "sources", group: "Hiring", title: "Where hires come from", question: "How did people find us?", href: "/reports/hiring/sources" },
  { id: "travel", group: "Costs", title: "Hiring travel", question: "What does hiring travel cost?", href: "/reports/costs/travel" }
];

export const GLANCE_HREF = "/reports";

/** The reports this viewer can open. */
export function reportsFor(isHr: boolean): ReportEntry[] {
  return REPORTS.filter((r) => isHr || !r.hrOnly);
}

/** The report a path belongs to, or null for At a glance and anything else. */
export function reportAt(pathname: string): ReportEntry | null {
  return REPORTS.find((r) => pathname === r.href || pathname.startsWith(`${r.href}/`)) ?? null;
}
