// A colour per traveller, for the hub calendar.
//
// Assignment is BY SORTED ID, round-robin — not by a hash of the name.
//
// A hash is stable but collides: with a nine-colour palette and a dozen
// travellers, two people sharing a colour on the same week is likely, and the
// whole point of colouring the calendar is telling them apart at a glance.
// Sorting by id and walking the palette guarantees the first eighteen (it was nine until Nov 3) are
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
  { key: "fuchsia", bar: "bg-fuchsia-500", dot: "bg-fuchsia-500", band: "bg-fuchsia-500/30 text-fuchsia-900 dark:bg-fuchsia-500/25 dark:text-fuchsia-100", chip: "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-200", ring: "ring-fuchsia-400" },
  // ---- 10 to 18, added Nov 3 for the onboarding calendar ----
  // His ask: "make sure we have enough colors available for new hires to not
  // need to reuse the same color as another active new hire." Nine wrapped at
  // the tenth person, and the most hires ever onboarding at once is TEN
  // (measured Nov 3, around Jun 29; 8 today). Eighteen leaves room. APPENDED,
  // never inserted: assignment is by position, so adding to the end leaves every
  // colour the first nine people already have — Travel's included — unchanged.
  // Ordered so neighbours differ (a lime after a fuchsia, not a green after an
  // emerald), because people next to each other in the sort sit next to each
  // other in the side list.
  { key: "lime", bar: "bg-lime-500", dot: "bg-lime-500", band: "bg-lime-500/30 text-lime-900 dark:bg-lime-500/25 dark:text-lime-100", chip: "bg-lime-50 text-lime-800 dark:bg-lime-500/20 dark:text-lime-200", ring: "ring-lime-400" },
  { key: "blue", bar: "bg-blue-500", dot: "bg-blue-500", band: "bg-blue-500/30 text-blue-900 dark:bg-blue-500/25 dark:text-blue-100", chip: "bg-blue-50 text-blue-700 dark:bg-blue-500/20 dark:text-blue-200", ring: "ring-blue-400" },
  { key: "red", bar: "bg-red-500", dot: "bg-red-500", band: "bg-red-500/30 text-red-900 dark:bg-red-500/25 dark:text-red-100", chip: "bg-red-50 text-red-700 dark:bg-red-500/20 dark:text-red-200", ring: "ring-red-400" },
  { key: "cyan", bar: "bg-cyan-500", dot: "bg-cyan-500", band: "bg-cyan-500/30 text-cyan-900 dark:bg-cyan-500/25 dark:text-cyan-100", chip: "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200", ring: "ring-cyan-400" },
  { key: "yellow", bar: "bg-yellow-500", dot: "bg-yellow-500", band: "bg-yellow-500/30 text-yellow-900 dark:bg-yellow-500/25 dark:text-yellow-100", chip: "bg-yellow-50 text-yellow-800 dark:bg-yellow-500/20 dark:text-yellow-200", ring: "ring-yellow-400" },
  { key: "purple", bar: "bg-purple-500", dot: "bg-purple-500", band: "bg-purple-500/30 text-purple-900 dark:bg-purple-500/25 dark:text-purple-100", chip: "bg-purple-50 text-purple-700 dark:bg-purple-500/20 dark:text-purple-200", ring: "ring-purple-400" },
  { key: "green", bar: "bg-green-600", dot: "bg-green-600", band: "bg-green-600/30 text-green-900 dark:bg-green-600/25 dark:text-green-100", chip: "bg-green-50 text-green-800 dark:bg-green-600/20 dark:text-green-200", ring: "ring-green-500" },
  { key: "pink", bar: "bg-pink-500", dot: "bg-pink-500", band: "bg-pink-500/30 text-pink-900 dark:bg-pink-500/25 dark:text-pink-100", chip: "bg-pink-50 text-pink-700 dark:bg-pink-500/20 dark:text-pink-200", ring: "ring-pink-400" },
  { key: "slate", bar: "bg-slate-500", dot: "bg-slate-500", band: "bg-slate-500/30 text-slate-900 dark:bg-slate-500/25 dark:text-slate-100", chip: "bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-200", ring: "ring-slate-400" }
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
