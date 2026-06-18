/**
 * Canonical department taxonomy for the calendar (and any department-aware view).
 *
 * Four top-level departments, each with a distinct color used to color-code
 * interviews. Some departments have sub-groups used for the calendar's
 * drill-down filter (color is always the parent's color).
 *
 * Interviews don't store a department directly — it is derived from the linked
 * job's free-form `Job.department` via resolveDepartmentKey(). That mapping is
 * the editable bridge between whatever strings live on jobs today and this
 * fixed structure; adjust the regexes below as the real department names settle.
 */

export type DeptKey = "crew" | "maintenance" | "fbo" | "support" | "unassigned";

export type DepartmentSub = { key: string; label: string };
export type Department = { key: Exclude<DeptKey, "unassigned">; label: string; subs: DepartmentSub[] };

export type DepartmentColorMeta = {
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

export const DEPARTMENT_META: Record<DeptKey, DepartmentColorMeta> = {
  crew: { chip: "bg-sky-600 text-white hover:bg-sky-700", dot: "bg-sky-600", accent: "border-l-sky-600", label: "Crew" },
  maintenance: {
    chip: "bg-amber-500 text-white hover:bg-amber-600",
    dot: "bg-amber-500",
    accent: "border-l-amber-500",
    label: "Maintenance"
  },
  fbo: { chip: "bg-violet-600 text-white hover:bg-violet-700", dot: "bg-violet-600", accent: "border-l-violet-600", label: "FBO" },
  support: { chip: "bg-teal-600 text-white hover:bg-teal-700", dot: "bg-teal-600", accent: "border-l-teal-600", label: "Support" },
  unassigned: {
    chip: "bg-slate-400 text-white hover:bg-slate-500",
    dot: "bg-slate-400",
    accent: "border-l-slate-400",
    label: "Unassigned"
  }
};

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

export function departmentColorMeta(raw: string | null | undefined): DepartmentColorMeta {
  return DEPARTMENT_META[resolveDepartmentKey(raw).deptKey];
}
