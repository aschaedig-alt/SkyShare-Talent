// A colour per traveller, for the hub calendar.
//
// Assignment is BY SORTED ID, round-robin — not by a hash of the name.
//
// A hash is stable but collides: with a nine-colour palette and a dozen
// travellers, two people sharing a colour on the same week is likely, and the
// whole point of colouring the calendar is telling them apart at a glance.
// Sorting by id and walking the palette guarantees the first nine travellers are
// all different, and because ids are cuids (roughly time-ordered), a NEW
// traveller sorts to the end and takes the next colour rather than shifting
// everybody else's. So colours stay put for the people already on the calendar,
// which is what makes the legend worth learning.

// `band` is the rail's name header. It deliberately uses the SAME hue at the SAME
// 30% as the connector rule between the dates, so the header and the line on the
// grid read as one colour rather than a solid and a tint of loosely related
// shades. Text goes dark-on-tint instead of white-on-solid for the same reason.
export const TRAVELER_COLORS = [
  { key: "sky", bar: "bg-sky-500", dot: "bg-sky-500", band: "bg-sky-500/30 text-sky-900 dark:bg-sky-500/25 dark:text-sky-100", chip: "bg-sky-50 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200", ring: "ring-sky-400" },
  { key: "emerald", bar: "bg-emerald-500", dot: "bg-emerald-500", band: "bg-emerald-500/30 text-emerald-900 dark:bg-emerald-500/25 dark:text-emerald-100", chip: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200", ring: "ring-emerald-400" },
  { key: "violet", bar: "bg-violet-500", dot: "bg-violet-500", band: "bg-violet-500/30 text-violet-900 dark:bg-violet-500/25 dark:text-violet-100", chip: "bg-violet-50 text-violet-700 dark:bg-violet-500/20 dark:text-violet-200", ring: "ring-violet-400" },
  { key: "amber", bar: "bg-amber-500", dot: "bg-amber-500", band: "bg-amber-500/30 text-amber-900 dark:bg-amber-500/25 dark:text-amber-100", chip: "bg-amber-50 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200", ring: "ring-amber-400" },
  { key: "rose", bar: "bg-rose-500", dot: "bg-rose-500", band: "bg-rose-500/30 text-rose-900 dark:bg-rose-500/25 dark:text-rose-100", chip: "bg-rose-50 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200", ring: "ring-rose-400" },
  { key: "teal", bar: "bg-teal-500", dot: "bg-teal-500", band: "bg-teal-500/30 text-teal-900 dark:bg-teal-500/25 dark:text-teal-100", chip: "bg-teal-50 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200", ring: "ring-teal-400" },
  { key: "indigo", bar: "bg-indigo-500", dot: "bg-indigo-500", band: "bg-indigo-500/30 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-100", chip: "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200", ring: "ring-indigo-400" },
  { key: "orange", bar: "bg-orange-500", dot: "bg-orange-500", band: "bg-orange-500/30 text-orange-900 dark:bg-orange-500/25 dark:text-orange-100", chip: "bg-orange-50 text-orange-800 dark:bg-orange-500/20 dark:text-orange-200", ring: "ring-orange-400" },
  { key: "fuchsia", bar: "bg-fuchsia-500", dot: "bg-fuchsia-500", band: "bg-fuchsia-500/30 text-fuchsia-900 dark:bg-fuchsia-500/25 dark:text-fuchsia-100", chip: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-200", ring: "ring-fuchsia-400" }
] as const;

export type TravelerColor = (typeof TRAVELER_COLORS)[number];

/**
 * Map traveller keys to colours, stably.
 *
 * Pass every traveller on the calendar at once — the assignment depends on the
 * whole set, so colouring them one at a time would not agree between the legend
 * and the grid.
 */
export function assignTravelerColors(keys: string[]): Map<string, TravelerColor> {
  const out = new Map<string, TravelerColor>();
  [...new Set(keys)]
    .sort((a, b) => a.localeCompare(b))
    .forEach((key, i) => {
      out.set(key, TRAVELER_COLORS[i % TRAVELER_COLORS.length]);
    });
  return out;
}

export const FALLBACK_TRAVELER_COLOR: TravelerColor = TRAVELER_COLORS[0];
