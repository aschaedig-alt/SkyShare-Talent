/**
 * Canonical department taxonomy for the calendar (and any department-aware view).
 *
 * Four top-level departments, each with a distinct color used to color-code
 * interviews. Some departments have sub-groups used for the calendar's
 * drill-down filter (color is always the parent's color).
 *
 * Colors are chosen from a fixed on-brand PALETTE. Each department has a default
 * color, and admins can override the choice from the calendar (stored as a
 * WorkspaceSetting — see department-colors.server.ts). Tailwind classes must be
 * present as literals here so the compiler emits them.
 *
 * Interviews don't store a department directly — it is derived from a free-form
 * `Job.department` string via resolveDepartmentKey(). That mapping is the
 * editable bridge between whatever strings live on jobs today and this fixed
 * structure; adjust the regexes below as the real department names settle.
 *
 * Which job that string comes from is interviewDepartmentRaw() — see the note
 * there, because the obvious answer (the interview's own linked job) is wrong
 * for essentially every interview we actually have.
 */

export type DeptKey = "crew" | "maintenance" | "fbo" | "support" | "unassigned";

export type DepartmentSub = { key: string; label: string };
export type Department = { key: Exclude<DeptKey, "unassigned">; label: string; subs: DepartmentSub[] };

export type ColorMeta = {
  /** Solid chip background + text */
  chip: string;
  /** Dot/legend swatch */
  dot: string;
  /** Left accent border */
  accent: string;
  label: string;
};

// The fixed top-level structure shown in the filter (always all four).
export const DEPARTMENTS: Department[] = [
  {
    key: "crew",
    label: "Crew",
    subs: [
      { key: "pilots", label: "Pilots" },
      { key: "cabin", label: "Cabin Attendants" }
    ]
  },
  { key: "maintenance", label: "Maintenance", subs: [] },
  {
    key: "fbo",
    label: "FBO",
    subs: [
      { key: "svr", label: "SVR" },
      { key: "dvo", label: "DVO" }
    ]
  },
  {
    key: "support",
    label: "Support",
    subs: [
      { key: "skyops", label: "SkyOps" },
      { key: "accounting", label: "Accounting" },
      { key: "other", label: "Other" }
    ]
  }
];

export const DEPARTMENT_LABELS: Record<DeptKey, string> = {
  crew: "Crew",
  maintenance: "Maintenance",
  fbo: "FBO",
  support: "Support",
  unassigned: "Unassigned"
};

// ---------------------------------------------------------------------------
// Color palette (on-brand, fixed set). swatch = preview background for pickers.
// ---------------------------------------------------------------------------

export type ColorName =
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "teal"
  | "emerald"
  | "amber"
  | "orange"
  | "red"
  | "pink"
  | "slate"
  | "gray";

export type PaletteEntry = { label: string; swatch: string; chip: string; dot: string; accent: string };

export const COLOR_PALETTE: Record<ColorName, PaletteEntry> = {
  sky: { label: "Sky", swatch: "bg-sky-600", chip: "bg-sky-600 text-white hover:bg-sky-700", dot: "bg-sky-600", accent: "border-l-sky-600" },
  blue: { label: "Blue", swatch: "bg-blue-600", chip: "bg-blue-600 text-white hover:bg-blue-700", dot: "bg-blue-600", accent: "border-l-blue-600" },
  indigo: { label: "Indigo", swatch: "bg-indigo-600", chip: "bg-indigo-600 text-white hover:bg-indigo-700", dot: "bg-indigo-600", accent: "border-l-indigo-600" },
  violet: { label: "Violet", swatch: "bg-violet-600", chip: "bg-violet-600 text-white hover:bg-violet-700", dot: "bg-violet-600", accent: "border-l-violet-600" },
  teal: { label: "Teal", swatch: "bg-teal-600", chip: "bg-teal-600 text-white hover:bg-teal-700", dot: "bg-teal-600", accent: "border-l-teal-600" },
  emerald: { label: "Green", swatch: "bg-emerald-600", chip: "bg-emerald-600 text-white hover:bg-emerald-700", dot: "bg-emerald-600", accent: "border-l-emerald-600" },
  amber: { label: "Amber", swatch: "bg-amber-500", chip: "bg-amber-500 text-white hover:bg-amber-600", dot: "bg-amber-500", accent: "border-l-amber-500" },
  orange: { label: "Orange", swatch: "bg-orange-500", chip: "bg-orange-500 text-white hover:bg-orange-600", dot: "bg-orange-500", accent: "border-l-orange-500" },
  red: { label: "Red", swatch: "bg-red-600", chip: "bg-red-600 text-white hover:bg-red-700", dot: "bg-red-600", accent: "border-l-red-600" },
  pink: { label: "Pink", swatch: "bg-pink-600", chip: "bg-pink-600 text-white hover:bg-pink-700", dot: "bg-pink-600", accent: "border-l-pink-600" },
  slate: { label: "Slate", swatch: "bg-slate-500", chip: "bg-slate-500 text-white hover:bg-slate-600", dot: "bg-slate-500", accent: "border-l-slate-500" },
  gray: { label: "Gray", swatch: "bg-gray-500", chip: "bg-gray-500 text-white hover:bg-gray-600", dot: "bg-gray-500", accent: "border-l-gray-500" }
};

export const PALETTE_ORDER: ColorName[] = [
  "sky",
  "blue",
  "indigo",
  "violet",
  "teal",
  "emerald",
  "amber",
  "orange",
  "red",
  "pink",
  "slate",
  "gray"
];

// Department keys an admin can recolor (Unassigned stays neutral/fixed).
export const COLORABLE_DEPARTMENTS: Array<Exclude<DeptKey, "unassigned">> = ["crew", "maintenance", "fbo", "support"];

export const DEFAULT_DEPARTMENT_COLORS: Record<DeptKey, ColorName> = {
  crew: "sky",
  maintenance: "amber",
  fbo: "violet",
  support: "teal",
  unassigned: "slate"
};

export type DepartmentColorOverrides = Partial<Record<DeptKey, ColorName>>;

export function isColorName(value: unknown): value is ColorName {
  return typeof value === "string" && value in COLOR_PALETTE;
}

/** Merge stored overrides over the defaults and resolve to ready-to-use class sets. */
export function buildDepartmentColors(overrides?: DepartmentColorOverrides | null): Record<DeptKey, ColorMeta> {
  const result = {} as Record<DeptKey, ColorMeta>;
  (Object.keys(DEPARTMENT_LABELS) as DeptKey[]).forEach((key) => {
    const chosen = overrides?.[key];
    const colorName = isColorName(chosen) ? chosen : DEFAULT_DEPARTMENT_COLORS[key];
    const palette = COLOR_PALETTE[colorName];
    result[key] = { chip: palette.chip, dot: palette.dot, accent: palette.accent, label: DEPARTMENT_LABELS[key] };
  });
  return result;
}

/** The default color map (no overrides) — used as a fallback when a prop is omitted. */
export const DEFAULT_DEPARTMENT_COLOR_META = buildDepartmentColors(null);

/**
 * Pick the raw department string that best describes an interview.
 *
 * `Interview.jobId` is nullable and in practice is ALWAYS null: interviews are
 * created from the scheduling form and the Google sync without a job link. As of
 * Jul 2026 all 200 interviews the calendar loads have no linked job, so reading
 * `interview.job.department` alone resolved every single event to "Unassigned" —
 * which made the department filter look broken (pick any department, get an empty
 * calendar) and flattened the color-coding to one gray.
 *
 * So fall back to the departments of the candidate's job-linked applications,
 * which is what a recruiter means by "what department is this interview for".
 * That recovers 199/200. `applicationDepartments` must be passed
 * most-relevant-first; the first non-empty one wins. About 9 candidates have
 * applications spanning several departments, so this is genuinely ambiguous for
 * them — the ordering makes it at least deterministic and stable.
 *
 * The real fix is to populate Interview.jobId at scheduling time; then the first
 * branch here wins and the fallback quietly stops mattering.
 */
export function interviewDepartmentRaw(
  jobDepartment: string | null | undefined,
  applicationDepartments: Array<string | null | undefined> = []
): string | null {
  if (jobDepartment && jobDepartment.trim()) return jobDepartment;
  for (const candidate of applicationDepartments) {
    if (candidate && candidate.trim()) return candidate;
  }
  return null;
}

/**
 * Map a free-form Job.department string onto the canonical department + sub-group.
 * Order matters: more specific rules come first (e.g. "Flight Operations" is Crew,
 * checked before the generic operations rule that routes to SkyOps).
 */
export function resolveDepartmentKey(raw: string | null | undefined): { deptKey: DeptKey; subKey: string | null } {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return { deptKey: "unassigned", subKey: null };

  // Crew — cabin first, then pilots / flight ops.
  if (/(cabin|flight attendant|\battendant\b)/.test(v)) return { deptKey: "crew", subKey: "cabin" };
  if (/(pilot|first officer|captain|\bsic\b|\bpic\b|flight op|managed aircraft|\bcrew\b|aviator)/.test(v)) {
    return { deptKey: "crew", subKey: "pilots" };
  }

  // Maintenance
  if (/(maintenance|mechanic|\ba&p\b|avionics)/.test(v)) return { deptKey: "maintenance", subKey: null };

  // FBO (SVR / DVO are the two locations)
  if (/\bsvr\b/.test(v)) return { deptKey: "fbo", subKey: "svr" };
  if (/\bdvo\b/.test(v)) return { deptKey: "fbo", subKey: "dvo" };
  if (/(fbo|line service|line tech|ramp|customer service)/.test(v)) return { deptKey: "fbo", subKey: null };

  // Support
  if (/(accounting|finance|payroll|bookkeep)/.test(v)) return { deptKey: "support", subKey: "accounting" };
  if (/(skyops|sky ops|dispatch|scheduling|operations control)/.test(v)) return { deptKey: "support", subKey: "skyops" };
  if (/\bsupport\b/.test(v)) return { deptKey: "support", subKey: null };

  // Everything else administrative rolls into Support / Other so it stays visible.
  return { deptKey: "support", subKey: "other" };
}
