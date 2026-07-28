// The single source of truth for the in-app Handbook.
//
// One list drives three things: the /handbook index, the /handbook/[slug]
// viewer, and the on-page SOP bookmark. A chapter that is "published" has a
// `file` in docs/sops (the SAME file we publish as an artifact) and, if it maps
// to app pages, a list of `routePrefixes` where the bookmark appears. A
// "planned" chapter is a placeholder from the SOP coverage map — shown on the
// index as "coming soon", never linked, never a bookmark.

export type ChapterStatus = "published" | "planned";

export type HandbookChapter = {
  /** URL slug under /handbook. Also the public identity of the chapter. */
  slug: string;
  /** Filename in docs/sops, or null for a planned chapter with nothing to show yet. */
  file: string | null;
  title: string;
  blurb: string;
  status: ChapterStatus;
  /** Section heading on the index page. */
  group: string;
  /**
   * Route prefixes where the on-page bookmark links to this chapter. Matched by
   * startsWith, longest match wins. Empty = no bookmark (index-only).
   */
  routePrefixes: string[];
};

export const HANDBOOK_GROUPS = [
  "The hiring lifecycle",
  "Recruiting",
  "People",
  "Data",
  "Admin & cross-cutting"
] as const;

export const CHAPTERS: HandbookChapter[] = [
  // ── The hiring lifecycle ──────────────────────────────────────────────
  {
    slug: "pre-onboarding",
    file: "01-pre-onboarding.html",
    title: "Pre-onboarding a new hire",
    blurb: "Candidate → offer → onboarding board → onboarded, end to end.",
    status: "published",
    group: "The hiring lifecycle",
    routePrefixes: ["/people"]
  },
  {
    slug: "offers",
    file: "02-offers.html",
    title: "Offers",
    blurb: "The six offer steps, and moving someone in before they sign.",
    status: "published",
    group: "The hiring lifecycle",
    routePrefixes: ["/offers"]
  },
  {
    slug: "business-cards",
    file: "03-business-cards.html",
    title: "Business cards",
    blurb: "Ordering ahead of orientation, and the six after-order steps.",
    status: "published",
    group: "The hiring lifecycle",
    routePrefixes: ["/business-cards"]
  },
  {
    slug: "org-charts",
    file: "04-org-charts.html",
    title: "Org charts — adding & linking people",
    blurb: "Putting someone on a fleet card and linking their profile.",
    status: "published",
    group: "The hiring lifecycle",
    routePrefixes: ["/fleet/crew", "/fleet/maintenance"]
  },
  {
    slug: "orientation",
    file: "05-orientation.html",
    title: "Running an orientation",
    blurb: "Create the session, invite everyone, send the emails, close it out.",
    status: "published",
    group: "The hiring lifecycle",
    routePrefixes: ["/orientation"]
  },
  {
    slug: "travel",
    file: null,
    title: "Arranging travel",
    blurb: "Booking a trip, items and receipts, reimbursement, and auto-fill. Coming soon.",
    status: "planned",
    group: "The hiring lifecycle",
    routePrefixes: []
  },

  // ── Recruiting ────────────────────────────────────────────────────────
  { slug: "candidates", file: null, title: "Sourcing & working candidates", blurb: "Adding candidates, tags, pros/cons, folders, dispositions.", status: "planned", group: "Recruiting", routePrefixes: [] },
  { slug: "jobs", file: null, title: "Managing job openings", blurb: "Open positions, staffing targets, and keeping the job list clean.", status: "planned", group: "Recruiting", routePrefixes: [] },
  { slug: "job-posting", file: null, title: "Building & publishing a job post", blurb: "The publishing pipeline: builder → final review → content blocks.", status: "planned", group: "Recruiting", routePrefixes: [] },
  { slug: "matchboard", file: null, title: "Matching candidates to openings", blurb: "Using the Matchboard to line candidates up against reqs.", status: "planned", group: "Recruiting", routePrefixes: [] },
  { slug: "pilot-requirements", file: null, title: "Maintaining pilot requirements", blurb: "Keeping the pilot-requirement rules current.", status: "planned", group: "Recruiting", routePrefixes: [] },
  { slug: "scheduling", file: null, title: "Scheduling interviews", blurb: "Booking links, the calendar, and the interview question bank.", status: "planned", group: "Recruiting", routePrefixes: [] },
  { slug: "events", file: null, title: "Running a recruiting event", blurb: "Planning an event and tracking its supplies.", status: "planned", group: "Recruiting", routePrefixes: [] },

  // ── People ────────────────────────────────────────────────────────────
  { slug: "employees", file: null, title: "The employee directory & history", blurb: "Columns, filters, merging duplicates, stints and rehires.", status: "planned", group: "People", routePrefixes: [] },
  { slug: "role-change", file: null, title: "Recording a role change", blurb: "Logging a promotion/move on someone's employee journey.", status: "planned", group: "People", routePrefixes: [] },
  { slug: "compliments", file: null, title: "Recognition & compliments", blurb: "Giving recognition, points and redemptions, birthdays & anniversaries.", status: "planned", group: "People", routePrefixes: [] },
  { slug: "phone-contacts", file: null, title: "Setting up a new hire's phone contacts", blurb: "The vCard hand-off and curating who's on it.", status: "planned", group: "People", routePrefixes: [] },

  // ── Data ──────────────────────────────────────────────────────────────
  { slug: "imports", file: null, title: "Importing data", blurb: "Bringing in hires, jobs, and historical records from a file.", status: "planned", group: "Data", routePrefixes: [] },
  { slug: "duplicate-review", file: null, title: "Resolving duplicates", blurb: "Working the duplicate queue for candidates and jobs.", status: "planned", group: "Data", routePrefixes: [] },
  { slug: "reports", file: null, title: "Reading the reports", blurb: "What each report shows and how to use it.", status: "planned", group: "Data", routePrefixes: [] },
  { slug: "archive", file: null, title: "The historical candidate archive", blurb: "Searching and using the imported Jazz archive.", status: "planned", group: "Data", routePrefixes: [] },

  // ── Admin & cross-cutting ─────────────────────────────────────────────
  { slug: "team-access", file: null, title: "Managing team access & roles", blurb: "Adding people and setting Admin / Recruiter / Viewer.", status: "planned", group: "Admin & cross-cutting", routePrefixes: [] },
  { slug: "email-templates", file: null, title: "Email templates & the Front mailboxes", blurb: "How the app's templates map to Front, and who sends from where.", status: "planned", group: "Admin & cross-cutting", routePrefixes: [] },
  { slug: "test-data", file: null, title: "Testing safely & cleaning up test data", blurb: "TEST tags, throwaway logins, and full teardown on the shared live DB.", status: "planned", group: "Admin & cross-cutting", routePrefixes: [] },
  { slug: "fleet-positions", file: null, title: "Fleet positions registry", blurb: "Editing the master list of fleet positions the app draws from.", status: "planned", group: "Admin & cross-cutting", routePrefixes: [] }
];

/** The combined book — all published chapters in one document. */
export const HANDBOOK_BOOK = {
  slug: "book",
  file: "00-handbook.html",
  title: "The whole book",
  blurb: "Every published chapter in one place."
} as const;

export function publishedChapters(): HandbookChapter[] {
  return CHAPTERS.filter((c) => c.status === "published");
}

/** Resolve a slug to a chapter that has a file to render (published, or the book). */
export function chapterFileForSlug(slug: string): { title: string; file: string } | null {
  if (slug === HANDBOOK_BOOK.slug) return { title: HANDBOOK_BOOK.title, file: HANDBOOK_BOOK.file };
  const c = CHAPTERS.find((x) => x.slug === slug && x.status === "published" && x.file);
  return c && c.file ? { title: c.title, file: c.file } : null;
}

/**
 * The bookmark target for a given app pathname, or null. Longest matching
 * route prefix wins, so /fleet/crew beats a hypothetical /fleet.
 */
export function chapterForPathname(pathname: string): { slug: string; title: string } | null {
  let best: { slug: string; title: string; len: number } | null = null;
  for (const c of CHAPTERS) {
    if (c.status !== "published") continue;
    for (const prefix of c.routePrefixes) {
      if ((pathname === prefix || pathname.startsWith(prefix + "/")) && (!best || prefix.length > best.len)) {
        best = { slug: c.slug, title: c.title, len: prefix.length };
      }
    }
  }
  return best ? { slug: best.slug, title: best.title } : null;
}
