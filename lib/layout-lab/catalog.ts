// Catalog of every real app page and the major "boxes" (panels / cards / sections)
// a user sees on each one. Powers the Settings → Layout Lab, a redesign sandbox where
// boxes can be rearranged, resized, locked, hidden, and moved between pages.
//
// This file is pure data (no Prisma / server imports) so it is safe in a client bundle.

export type LabDomain = "Home" | "Recruiting" | "Publishing" | "People" | "Data" | "Admin";

export type LabPage = {
  id: string;
  label: string;
  route: string;
  domain: LabDomain;
};

export type LabBox = {
  id: string;
  page: string; // home page id
  title: string;
  summary: string;
};

export const DOMAIN_ORDER: LabDomain[] = ["Home", "Recruiting", "Publishing", "People", "Data", "Admin"];

export const DOMAIN_COLOR: Record<LabDomain, string> = {
  Home: "bg-indigo-600 text-white",
  Recruiting: "bg-brand-lea text-white",
  Publishing: "bg-emerald-600 text-white",
  People: "bg-fuchsia-700 text-white",
  Data: "bg-amber-600 text-white",
  Admin: "bg-slate-600 text-white"
};

export const DOMAIN_DOT: Record<LabDomain, string> = {
  Home: "bg-indigo-600",
  Recruiting: "bg-brand-lea",
  Publishing: "bg-emerald-600",
  People: "bg-fuchsia-700",
  Data: "bg-amber-600",
  Admin: "bg-slate-600"
};

export const LAB_PAGES: LabPage[] = [
  { id: "command-center", label: "Command Center", route: "/", domain: "Home" },

  { id: "candidates", label: "Candidates", route: "/candidates", domain: "Recruiting" },
  { id: "recruiting-jobs", label: "Jobs", route: "/recruiting-jobs", domain: "Recruiting" },
  { id: "pilot-requirements", label: "Pilot Requirements", route: "/pilot-requirements", domain: "Recruiting" },
  { id: "calendar", label: "Calendar", route: "/calendar", domain: "Recruiting" },

  { id: "jobs", label: "Job Post Builder", route: "/jobs", domain: "Publishing" },
  { id: "review", label: "Final Review", route: "/review", domain: "Publishing" },
  { id: "blocks", label: "Content Blocks", route: "/blocks", domain: "Publishing" },

  { id: "people", label: "Pre-onboarding", route: "/people", domain: "People" },
  { id: "orientation", label: "Orientation", route: "/orientation", domain: "People" },
  { id: "compliments", label: "Compliments", route: "/compliments", domain: "People" },

  { id: "imports", label: "Imports / Uploads", route: "/imports", domain: "Data" },
  { id: "duplicate-review", label: "Duplicate Review", route: "/duplicate-review", domain: "Data" },
  { id: "reports", label: "Reports", route: "/reports", domain: "Data" },

  { id: "settings", label: "Settings (General)", route: "/settings", domain: "Admin" },
  { id: "settings-users", label: "Team Members", route: "/settings/users", domain: "Admin" },
  { id: "settings-activity", label: "Activity", route: "/settings/activity", domain: "Admin" },
  { id: "settings-feedback", label: "Feedback", route: "/settings/feedback", domain: "Admin" },
  { id: "settings-templates", label: "Templates", route: "/settings/templates", domain: "Admin" },
  { id: "settings-content-blocks", label: "Block management", route: "/settings/content-blocks", domain: "Admin" }
];

export const LAB_BOXES: LabBox[] = [
  // ---- Command Center ----
  { id: "cc-hero", page: "command-center", title: "Command Center header", summary: "Operational overview intro banner" },
  { id: "cc-stats", page: "command-center", title: "Quick stat tiles", summary: "Candidates · Files · Jobs · Pilot requirements · Import queue · Interviews, with progress bars" },
  { id: "cc-attention", page: "command-center", title: "Needs action", summary: "Clickable items that require attention" },
  { id: "cc-readiness", page: "command-center", title: "Candidate readiness", summary: "Pipeline readiness metrics" },
  { id: "cc-recent-candidates", page: "command-center", title: "Recent candidates", summary: "Last few added candidates" },
  { id: "cc-recent-jobs", page: "command-center", title: "Recent jobs", summary: "Latest job posts" },
  { id: "cc-roadmap-progress", page: "command-center", title: "Roadmap progress", summary: "Progress bar, % complete, X of Y items" },
  { id: "cc-roadmap-sections", page: "command-center", title: "Roadmap checklist", summary: "Collapsible task sections with status badges" },

  // ---- Candidates ----
  { id: "cand-header", page: "candidates", title: "Candidate operations header", summary: "Heading, description, search input" },
  { id: "cand-stats", page: "candidates", title: "Candidate statistics", summary: "Total · Active · With files · With applications · Scheduled interviews" },
  { id: "cand-table", page: "candidates", title: "Candidate records table", summary: "Candidate · Stage · Contact · Tags · Activity · Updated" },

  // ---- Recruiting Jobs ----
  { id: "rjobs-header", page: "recruiting-jobs", title: "Role operations header", summary: "Heading, description, search input" },
  { id: "rjobs-stats", page: "recruiting-jobs", title: "Job statistics", summary: "Imported · Open · Pilot · Support · With candidates" },
  { id: "rjobs-pilot-list", page: "recruiting-jobs", title: "Pilot jobs list", summary: "Left sidebar of pilot job cards (title, dept/status/location, badge, counts)" },
  { id: "rjobs-support-list", page: "recruiting-jobs", title: "Support jobs list", summary: "Left sidebar of support job cards" },
  { id: "rjobs-detail-header", page: "recruiting-jobs", title: "Job detail header", summary: "Title, classification editor (Pilot/Support, seat, aircraft), stat boxes" },
  { id: "rjobs-linked-reqs", page: "recruiting-jobs", title: "Linked requirements", summary: "Linked pilot requirement profiles" },
  { id: "rjobs-linked-cands", page: "recruiting-jobs", title: "Linked candidates", summary: "Candidates linked to this job" },
  { id: "rjobs-source", page: "recruiting-jobs", title: "Source record", summary: "Req ID, recruiter, source filename, imported job text" },

  // ---- Pilot Requirements ----
  { id: "preq-header", page: "pilot-requirements", title: "Pilot gates header", summary: "Heading, description, search input" },
  { id: "preq-stats", page: "pilot-requirements", title: "Requirement statistics", summary: "Profiles · Active · Need review · Catalog gates" },
  { id: "preq-list", page: "pilot-requirements", title: "Profiles sidebar", summary: "Requirement cards (title, seat/status, operator type, aircraft/base, mini-cards)" },
  { id: "preq-detail-header", page: "pilot-requirements", title: "Requirement header", summary: "Title, version/status badges, numeric summary cards" },
  { id: "preq-gates", page: "pilot-requirements", title: "Hard gates", summary: "Enabled gates grouped by category with label + value" },
  { id: "preq-evidence", page: "pilot-requirements", title: "Source evidence", summary: "Original imported job text (Preserved)" },
  { id: "preq-matches", page: "pilot-requirements", title: "Suggested candidates", summary: "Top matches: name, stage, score, readiness, matched signals, gaps" },
  { id: "preq-extraction", page: "pilot-requirements", title: "Extraction status", summary: "Confidence % + extraction warnings" },
  { id: "preq-linked-source", page: "pilot-requirements", title: "Linked source", summary: "Source job title, status, pay scale" },

  // ---- Calendar ----
  { id: "cal-header", page: "calendar", title: "Interview operations header", summary: "Heading + view toggle (Month/Week/Day/List)" },
  { id: "cal-stats", page: "calendar", title: "Interview statistics", summary: "Scheduled · This week · Completed · Candidate options" },
  { id: "cal-upcoming", page: "calendar", title: "Upcoming interviews", summary: "Sidebar list of upcoming interviews" },
  { id: "cal-schedule-form", page: "calendar", title: "Schedule interview form", summary: "Candidate, job, date/time inputs" },
  { id: "cal-google-sync", page: "calendar", title: "Google sync status", summary: "Google Calendar sync status card" },
  { id: "cal-month", page: "calendar", title: "Month view", summary: "Month grid with interview event blocks" },
  { id: "cal-week", page: "calendar", title: "Week view", summary: "Hourly time grid (week)" },
  { id: "cal-day", page: "calendar", title: "Day view", summary: "Hourly time grid (single day)" },
  { id: "cal-list", page: "calendar", title: "All interviews list", summary: "Interview manifest cards (contact, type/status, time, interviewer, location)" },

  // ---- Job Post Builder ----
  { id: "jpb-header", page: "jobs", title: "Builder top bar", summary: "Steps, Template Locked, Save Draft, Archive/Restore, Export menu" },
  { id: "jpb-job-list", page: "jobs", title: "Edit job data (left)", summary: "Active/Archived/All tabs, search, job selector, bulk actions" },
  { id: "jpb-fields", page: "jobs", title: "Field editor", summary: "5 groups: Public, Internal, Offer/HR, Paycom, Aviation (draggable fields)" },
  { id: "jpb-preview", page: "jobs", title: "Formatted preview", summary: "Final rendered job post" },
  { id: "jpb-readiness", page: "jobs", title: "Readiness card", summary: "Warnings + publish readiness state" },
  { id: "jpb-export", page: "jobs", title: "Export menu", summary: "Download / copy in various formats" },

  // ---- Final Review ----
  { id: "rev-header", page: "review", title: "Final Review bar", summary: "Template Locked + readiness status badge" },
  { id: "rev-selector", page: "review", title: "Job selection", summary: "Search jobs + dropdown + status badge" },
  { id: "rev-preview", page: "review", title: "Formatted preview", summary: "Complete formatted job layout" },
  { id: "rev-readiness", page: "review", title: "Publish readiness", summary: "Warnings checklist (compact)" },
  { id: "rev-export", page: "review", title: "Export controls", summary: "Limited HTML / Plain Text toggle, copy buttons, code textarea" },

  // ---- Content Blocks ----
  { id: "blk-header", page: "blocks", title: "Content Blocks bar", summary: "Duplicate + Create New Block" },
  { id: "blk-view-toggle", page: "blocks", title: "View switcher", summary: "Block Library / Template Board" },
  { id: "blk-status", page: "blocks", title: "Activity feedback", summary: "Save / duplicate / apply messages" },
  { id: "blk-library-sidebar", page: "blocks", title: "Library browser", summary: "Search, group/sort, filter chips, collapsible block list" },
  { id: "blk-editor", page: "blocks", title: "Block editor", summary: "Name, Description, Category, Scope, Placement, Content, format, color, change note" },
  { id: "blk-format-preview", page: "blocks", title: "Formatting preview", summary: "Sample render of block formatting" },
  { id: "blk-adoption", page: "blocks", title: "Version deployment", summary: "Apply-new-version radio options + job checkboxes" },
  { id: "blk-apply", page: "blocks", title: "Apply to jobs", summary: "All / Selected jobs + job checklist" },
  { id: "blk-version-history", page: "blocks", title: "Version history", summary: "Previous versions + Current badge" },

  // ---- Pre-onboarding ----
  { id: "ppl-header", page: "people", title: "Pre-onboarding header", summary: "Title + Add new hire" },
  { id: "ppl-tabs", page: "people", title: "Tabs", summary: "Dashboard / Grid / Milestones / Post-onboard / Archived" },
  { id: "ppl-metrics", page: "people", title: "Dashboard metrics", summary: "Starting in 7d · Missing items · Urgent/blocked · Avg completion %" },
  { id: "ppl-status-chart", page: "people", title: "By status chart", summary: "Donut: In process / Ready / Urgent / Blocked" },
  { id: "ppl-dept-chart", page: "people", title: "By department chart", summary: "Horizontal bars by department" },
  { id: "ppl-weekly-chart", page: "people", title: "Starts by week chart", summary: "Vertical bars of start dates by week" },
  { id: "ppl-funnel", page: "people", title: "Process funnel", summary: "Where active hires are in onboarding" },
  { id: "ppl-alerts", page: "people", title: "Needs attention", summary: "Blocked / Urgent / Missing list" },
  { id: "ppl-upcoming", page: "people", title: "Upcoming start dates", summary: "Names + positions" },
  { id: "ppl-grid", page: "people", title: "Onboarding grid", summary: "Task rows × hire columns, progress + status" },
  { id: "ppl-milestones-table", page: "people", title: "Milestones progress", summary: "Hire rows × milestone columns" },
  { id: "ppl-postonboard", page: "people", title: "Post-onboard table", summary: "Employee · Dept · Started · Onboarded · 30/60/90 · Benefits" },
  { id: "ppl-archived", page: "people", title: "Archived hires", summary: "Name · Position · Dept · Start · Restore" },

  // ---- Orientation ----
  { id: "ori-header", page: "orientation", title: "Orientation header", summary: "Title + New session" },
  { id: "ori-tabs", page: "orientation", title: "Tabs", summary: "Sessions / Cohorts & calendar" },
  { id: "ori-upcoming", page: "orientation", title: "Upcoming sessions", summary: "Session cards (date, location, attendees, prep, alerts)" },
  { id: "ori-past", page: "orientation", title: "Past sessions", summary: "Completed session cards" },
  { id: "ori-calendar", page: "orientation", title: "Calendar mini-months", summary: "Session + orientation-date markers" },
  { id: "ori-cohorts", page: "orientation", title: "Cohorts by date", summary: "Cohort cards + create/add actions" },

  // ---- Compliments ----
  { id: "comp-metrics", page: "compliments", title: "Recognition metrics", summary: "This month · All-time · Streak · Points · People celebrated · Participation %" },
  { id: "comp-goal", page: "compliments", title: "Monthly goal", summary: "Progress bar + Give recognition" },
  { id: "comp-top-recognizers", page: "compliments", title: "Top recognizers", summary: "Leaderboard of givers" },
  { id: "comp-most-celebrated", page: "compliments", title: "Most celebrated", summary: "Leaderboard of recipients" },
  { id: "comp-most-loved", page: "compliments", title: "Most loved spotlight", summary: "Featured recognition with message + likes" },
  { id: "comp-values", page: "compliments", title: "Values in action", summary: "Value bars + counts" },

  // ---- Imports ----
  { id: "imp-header", page: "imports", title: "Imports / Uploads header", summary: "Data intake header" },
  { id: "imp-stats", page: "imports", title: "Import statistics", summary: "Batches · Rows · Warnings · Errors · Pending" },
  { id: "imp-actions", page: "imports", title: "Import actions", summary: "Candidate CSV · Resume upload · Jobs CSV · Job PDF · Catalog import" },
  { id: "imp-history", page: "imports", title: "Recent batches", summary: "Batch list with status + counts" },
  { id: "imp-queue", page: "imports", title: "Recent rows", summary: "Rows pending review" },

  // ---- Duplicate Review ----
  { id: "dup-header", page: "duplicate-review", title: "Duplicate Review header", summary: "Review control header" },
  { id: "dup-stats", page: "duplicate-review", title: "Statistics", summary: "Open · Candidate dupes · Job dupes · File issues · Resolved" },
  { id: "dup-cand-scan", page: "duplicate-review", title: "Candidate scan", summary: "Candidate duplicate detection" },
  { id: "dup-job-scan", page: "duplicate-review", title: "Job scan", summary: "Job variant detection" },
  { id: "dup-queue", page: "duplicate-review", title: "Review queue", summary: "Items with status, reason, confidence, actions" },

  // ---- Reports ----
  { id: "rep-header", page: "reports", title: "Reports header", summary: "Insights header + workspace logo" },
  { id: "rep-pipeline", page: "reports", title: "Candidates by stage", summary: "Stage bars" },
  { id: "rep-source", page: "reports", title: "Candidates by source", summary: "Source bars" },
  { id: "rep-coverage", page: "reports", title: "Candidates by job", summary: "Job assignment bars" },
  { id: "rep-readiness", page: "reports", title: "Documents & requirements", summary: "With/Missing files · Active/Draft requirements" },

  // ---- Settings (General) ----
  { id: "set-header", page: "settings", title: "Settings header", summary: "Admin foundation header" },
  { id: "set-counts", page: "settings", title: "Data summary", summary: "Candidates · Jobs · Requirements · Files · Interviews · Batches" },
  { id: "set-env", page: "settings", title: "Current runtime", summary: "App env · Node env · Database · Files storage" },
  { id: "set-deploy", page: "settings", title: "AWS readiness", summary: "Deployment guidance + saved files" },
  { id: "set-prod-checks", page: "settings", title: "Deployment checks", summary: "prod:check status cards" },
  { id: "set-google", page: "settings", title: "Calendar connection", summary: "Calendar sync configuration status" },
  { id: "set-backup", page: "settings", title: "Backup runbook", summary: "Backup strategy guidance" },
  { id: "set-security", page: "settings", title: "Before real data", summary: "Auth mode, security checklist, role cards" },
  { id: "set-branding", page: "settings", title: "Logos", summary: "Logo library + slot assignments (sidebar/login/reports)" },
  { id: "set-access", page: "settings", title: "Module Visibility & Access", summary: "Roles × modules access matrix (Full/View/Hidden)" },

  // ---- Team Members ----
  { id: "usr-header", page: "settings-users", title: "Team Members header", summary: "Header" },
  { id: "usr-table", page: "settings-users", title: "User management", summary: "Name · Email · Role · Actions" },
  { id: "usr-roles", page: "settings-users", title: "Role permissions", summary: "Role definitions + assigned permissions" },

  // ---- Activity ----
  { id: "act-header", page: "settings-activity", title: "Activity Dashboard header", summary: "Header + timeframe" },
  { id: "act-summary", page: "settings-activity", title: "Activity summary", summary: "Total · Types · Members · Avg per person" },
  { id: "act-breakdown", page: "settings-activity", title: "Activity breakdown", summary: "Activity types + counts" },
  { id: "act-team", page: "settings-activity", title: "Team contribution", summary: "Top contributors" },
  { id: "act-recent", page: "settings-activity", title: "Recent activity", summary: "Filterable list of recent activity" },

  // ---- Feedback ----
  { id: "fb-stats", page: "settings-feedback", title: "Feedback statistics", summary: "Total · New · Ideas · Bugs" },
  { id: "fb-filters", page: "settings-feedback", title: "Filters", summary: "Type + Status dropdowns" },
  { id: "fb-list", page: "settings-feedback", title: "Feedback items", summary: "Cards with status + actions" },

  // ---- Templates ----
  { id: "tpl-header", page: "settings-templates", title: "Templates header", summary: "Header" },
  { id: "tpl-colors", page: "settings-templates", title: "Color palette", summary: "Token swatches + hex values" },
  { id: "tpl-type", page: "settings-templates", title: "Typography scale", summary: "Type tokens + sizing" },
  { id: "tpl-layout", page: "settings-templates", title: "Layout & components", summary: "Layout tokens (locked)" },

  // ---- Block management ----
  { id: "bm-header", page: "settings-content-blocks", title: "Block management header", summary: "Header" },
  { id: "bm-list", page: "settings-content-blocks", title: "Search & select blocks", summary: "Search + block list with usage counts" },
  { id: "bm-details", page: "settings-content-blocks", title: "Selected block details", summary: "Name, description, jobs using" },
  { id: "bm-migration", page: "settings-content-blocks", title: "Migration & actions", summary: "Replacement block + update-jobs checkbox" },
  { id: "bm-actions", page: "settings-content-blocks", title: "Retire options", summary: "Archive / Delete" }
];

// Rough default height (grid rows) per box, used when auto-arranging.
export function defaultBoxHeight(id: string): number {
  if (id.endsWith("-table") || id.includes("table") || id.includes("queue") || id.includes("list")) return 7;
  if (id.includes("preview") || id.includes("month") || id.includes("week") || id.includes("day")) return 12;
  if (id.includes("stats") || id.includes("metrics") || id.includes("counts")) return 4;
  if (id.includes("header") || id.includes("tabs") || id.includes("toggle") || id.includes("status")) return 3;
  if (id.includes("chart") || id.includes("editor") || id.includes("gates") || id.includes("sidebar")) return 7;
  return 5;
}

export function pageById(id: string): LabPage | undefined {
  return LAB_PAGES.find((p) => p.id === id);
}

export function domainColor(pageId: string): string {
  const p = pageById(pageId);
  return p ? DOMAIN_COLOR[p.domain] : "bg-slate-600 text-white";
}

export function domainDot(pageId: string): string {
  const p = pageById(pageId);
  return p ? DOMAIN_DOT[p.domain] : "bg-slate-600";
}
