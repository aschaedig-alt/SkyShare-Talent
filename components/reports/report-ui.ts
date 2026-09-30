// THE REPORTS DESIGN SPEC - one set of classes every report and data page uses.
//
// Lifted exactly from Fleet Progression (components/reports/ReportsWorkspace.tsx,
// PilotProgressions), which he pointed at on 2026-09-29 as the reference: "i want to
// make sure this new tenure tab (and the other tabs) match the formatting exactly.
// same size fonts, same boldness, same spacing, same font itself, same colors, same
// spacing... dont use random different sizes and stuff like youve done in the
// past. figure out the design specs and note them so you always use them."
//
// So: build a report out of THESE, not out of fresh Tailwind strings. A size, weight
// or letter-spacing that is not below does not belong on a report. If something
// genuinely new is needed, add it here once, beside its siblings, and use it.
//
// The type scale, in one place:
//   11px bold uppercase, tracking 0.2em, gold       eyebrow over a title
//   20px (text-xl) semibold, navy                   report title / tile value
//   14px (text-sm), grey                            lede, notes, table body
//   30px (text-3xl) bold, gold on navy              the one headline figure
//   12px (text-xs)                                  controls, hero sub-line
//   11px                                            footnotes, legends, chart axes, table heads (uppercase, 0.14em)
//   10px bold uppercase, tracking 0.16em, grey      tile labels, section labels
// Colours are the brand tokens only (navy lea, gold, eden, sweet, cloudDancer,
// grey); every class carries its dark-mode pair.

export const R = {
  /** A page of reports (Reports, Reports > Sources): its padding, its header card, its tab bar. */
  page: "space-y-4 px-5 py-5 lg:px-8",
  pageHeader: "flex items-start justify-between gap-4 rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10",
  pageTitle: "text-2xl font-semibold text-brand-lea dark:text-slate-100",
  pageLede: "mt-1 max-w-3xl text-sm text-brand-grey dark:text-slate-400",
  tabBar: "flex flex-wrap gap-1 rounded bg-white p-1 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10 print:hidden",
  tab: "rounded px-4 py-2 text-sm font-semibold transition",
  /** "Export PDF" - a page-level action, a size up from smallButton. */
  pageButton:
    "inline-flex items-center gap-1.5 rounded border border-brand-lea/20 px-3 py-2 text-sm font-semibold text-brand-lea transition hover:bg-brand-cloudDancer/60 print:hidden dark:border-white/10 dark:text-slate-100 dark:hover:bg-white/5",

  /** The one panel a report sits in - Fleet Progression is ONE of these, not a stack. */
  panel: "rounded bg-white p-5 shadow-panel ring-1 ring-brand-lea/10 dark:bg-brand-panel dark:ring-white/10",
  header: "flex flex-wrap items-start justify-between gap-3",
  eyebrow: "text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold",
  title: "text-xl font-semibold text-brand-lea dark:text-slate-100",
  lede: "mt-1 max-w-2xl text-sm text-brand-grey dark:text-slate-400",
  /** A defined word inside the lede ("an upgrade is..."). */
  term: "font-medium text-brand-eden dark:text-slate-300",

  /** The navy headline strip: one gold figure and the sentence it answers. */
  hero: "mt-4 rounded bg-brand-lea p-4 text-white dark:ring-1 dark:ring-brand-gold/25",
  heroRow: "flex flex-wrap items-baseline gap-x-3 gap-y-1",
  heroFigure: "text-3xl font-bold text-brand-gold",
  heroText: "text-sm font-medium",
  heroSub: "mt-1 text-xs text-white/70",

  /** Stat tiles: four across on a wide screen, two rows at most. */
  tiles: "mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4",
  tile: "rounded border border-brand-lea/10 bg-brand-cloudDancer/45 p-3 dark:border-white/10 dark:bg-white/5",
  tileLabel: "text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400",
  tileValue: "mt-1 text-xl font-semibold text-brand-lea dark:text-slate-100",
  tileSub: "text-[11px] text-brand-grey dark:text-slate-400",

  /** A boxed sentence (Fleet's "former pilots in this view" line). */
  note: "mt-3 rounded border border-brand-lea/10 bg-brand-cloudDancer/45 px-3 py-2 text-sm text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
  strong: "font-semibold text-brand-lea dark:text-slate-200",
  /** What a report cannot see, said plainly under the figures. */
  footnote: "mt-2 text-[11px] text-brand-grey dark:text-slate-400",

  /** A chart, or any sub-section, inside the panel. */
  box: "mt-5 rounded border border-brand-lea/10 bg-gradient-to-b from-brand-cloudDancer/40 to-transparent p-4 dark:border-white/10 dark:from-white/5",
  sectionLabel: "text-[10px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400",
  /** A section heading that is a sentence ("Upgraded - 22 pilots"). */
  listTitle: "text-sm font-semibold text-brand-lea dark:text-slate-100",
  legend: "mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 pl-1 text-[11px] font-medium text-brand-grey dark:text-slate-400",

  /** Controls, top right of the header. */
  controls: "flex shrink-0 flex-wrap items-center gap-2",
  segmentGroup: "inline-flex rounded border border-brand-lea/15 p-0.5 text-xs font-semibold dark:border-white/10",
  segment: "rounded px-3 py-1.5 transition",
  segmentOn: "bg-brand-lea text-white ring-1 ring-brand-gold",
  segmentOff: "text-brand-grey hover:text-brand-lea hover:shadow-glow dark:text-slate-400 dark:hover:text-slate-100",
  select:
    "rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-lea outline-none transition focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100",
  /** A text field - the select, typed into. */
  input:
    "w-full min-w-0 rounded border border-brand-lea/15 bg-white px-2.5 py-1.5 text-xs font-semibold text-brand-lea outline-none transition placeholder:font-normal placeholder:text-brand-grey focus:border-brand-gold dark:border-white/10 dark:bg-brand-field dark:text-slate-100",
  /** Fleet's "Download CSV". */
  smallButton:
    "inline-flex items-center gap-1 rounded border border-brand-lea/20 px-2 py-1 text-[11px] font-semibold text-brand-lea transition hover:border-brand-gold/50 hover:shadow-glow disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/10 dark:text-slate-200",

  /** Tables (Document Currency's). The wrapper pins overflow-y - see CLAUDE.md. */
  tableWrap: "mt-2 overflow-x-auto overflow-y-hidden",
  table: "w-full border-collapse text-left text-sm",
  thead: "bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.14em] text-brand-grey dark:bg-white/5 dark:text-slate-400",
  th: "px-3 py-2 font-bold",
  tbody: "divide-y divide-brand-lea/10 dark:divide-white/10",
  tr: "row-wash",
  td: "px-3 py-2",
  num: "px-3 py-2 text-right tabular-nums",
  muted: "text-brand-grey dark:text-slate-400",
  /** A person's name, linking to them. */
  link: "font-semibold text-brand-lea transition hover:text-brand-eden dark:text-slate-100 dark:hover:text-brand-edenOnDark",
  /** A small label beside a name ("pilot", "contractor"). */
  chip: "rounded border border-brand-lea/15 px-1.5 py-0.5 text-[10px] font-semibold text-brand-grey dark:border-white/10 dark:text-slate-400",

  /** Charts: draw in this box and the 11px text renders the same size as Fleet's. */
  chart: {
    W: 720,
    H: 240,
    padL: 40,
    padR: 16,
    padT: 18,
    padB: 30,
    svg: "h-auto w-full min-w-[420px]",
    axisText: "fill-brand-grey text-[11px] dark:fill-slate-400",
    gridLine: "text-brand-lea/10 dark:text-white/10"
  }
} as const;
