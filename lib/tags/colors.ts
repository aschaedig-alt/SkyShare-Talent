// Candidate tag colors.
//
// The employee side (components/employees/EmployeeTags.tsx) maps a FIXED set of
// known tag names to classes, which works there because those tags are a closed
// list nobody invents. Candidate tags are the opposite: they are created by hand
// as the work needs them, so the colour has to live with the tag rather than in
// a lookup table in the code.
//
// Hence Tag.color, which has existed unused since the Jazz import. It stores one
// of the palette VALUES below, never a raw hex or a Tailwind class — a class
// string in the database would not survive a Tailwind rebuild (the JIT compiler
// only emits classes it can see in source), and hex would not adapt to dark mode.

export const TAG_COLORS = [
  { value: "slate", label: "Grey", chip: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300", dot: "bg-slate-400" },
  { value: "rose", label: "Red", chip: "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300", dot: "bg-rose-500" },
  { value: "orange", label: "Orange", chip: "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", dot: "bg-orange-500" },
  { value: "amber", label: "Amber", chip: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300", dot: "bg-amber-500" },
  { value: "emerald", label: "Green", chip: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300", dot: "bg-emerald-500" },
  { value: "teal", label: "Teal", chip: "bg-teal-50 text-teal-700 dark:bg-teal-500/15 dark:text-teal-300", dot: "bg-teal-500" },
  { value: "sky", label: "Blue", chip: "bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300", dot: "bg-sky-500" },
  { value: "indigo", label: "Indigo", chip: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300", dot: "bg-indigo-500" },
  { value: "violet", label: "Violet", chip: "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300", dot: "bg-violet-500" }
] as const;

export type TagColor = (typeof TAG_COLORS)[number]["value"];

export function isTagColor(v: unknown): v is TagColor {
  return typeof v === "string" && TAG_COLORS.some((c) => c.value === v);
}

/**
 * A stable colour for a tag that has never been given one.
 *
 * Every tag imported from Jazz has color = null, and leaving 1,600-odd links
 * rendering identical grey would make the column useless at a glance. Derived
 * from the label so it never changes between renders or between machines —
 * picking at random would give the same tag a different colour on every page
 * load, which reads as a bug.
 *
 * Skips index 0 (grey) so an auto-coloured tag is always visibly coloured;
 * grey stays available as a deliberate choice.
 */
export function autoTagColor(label: string): TagColor {
  let hash = 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (hash * 31 + label.charCodeAt(i)) % 100000;
  }
  const pickable = TAG_COLORS.length - 1;
  return TAG_COLORS[1 + (hash % pickable)].value;
}

export function resolveTagColor(label: string, color: string | null | undefined): TagColor {
  return isTagColor(color) ? color : autoTagColor(label);
}

/** Tailwind classes for the pill body. */
export function tagChipClass(label: string, color: string | null | undefined): string {
  const resolved = resolveTagColor(label, color);
  return TAG_COLORS.find((c) => c.value === resolved)?.chip ?? TAG_COLORS[0].chip;
}

/** Tailwind classes for a small solid swatch, used in the colour picker. */
export function tagDotClass(label: string, color: string | null | undefined): string {
  const resolved = resolveTagColor(label, color);
  return TAG_COLORS.find((c) => c.value === resolved)?.dot ?? TAG_COLORS[0].dot;
}

/**
 * One tag as the UI needs it.
 *
 * `historical` splits the two populations that share this table. Everything that
 * arrived from the JazzHR import — 38 tags across 1,648 links — describes a
 * workflow we no longer run ("2.2 Pilot App Complete", "1.3 H Manager Interview
 * Scheduled"). It is worth keeping and worth being able to read, but shown at
 * equal weight it buries the handful of tags somebody actually chose. So
 * historical tags render grey and collapsed; tags applied by hand render in
 * colour.
 *
 * Derived from CandidateTag.source rather than a new column: every existing row
 * is already marked JAZZ, and anything added by hand is MARKED MANUAL, so the
 * line already exists in the data.
 */
export type TagChip = { label: string; color: string | null; historical: boolean };

/** Grey, for tags carried over from the import. */
export const HISTORICAL_CHIP_CLASS =
  "bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400";
