import { findStage, type CandidateStage } from "@/lib/candidates/stages";
import { tagChipClass } from "@/lib/tags/colors";

/**
 * The colour of a candidate's stage pill / stage dropdown.
 *
 * Lives here, not inside a table component, because more than one page draws
 * the stage control: the Candidates list and Recent interviews (asked for on
 * 2026-11-16 — "the drop down status option on the main candidates page, id
 * like to have it on the recent interviews page as well"). Two private copies
 * would drift the first time a colour changed.
 */

/** Keyword fallback: color a stage by the words in its NAME. */
export function stagePill(stage: string | null) {
  const s = (stage ?? "").toLowerCase();
  if (!stage) return "border-brand-lea/15 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400";
  if (s.includes("hire") || s.includes("offer")) return "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (s.includes("interview") || s.includes("screen")) return "border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (s.includes("reject") || s.includes("declin") || s.includes("withdraw")) return "border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400";
  if (s.includes("new") || s.includes("appl") || s.includes("lead")) return "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "border-brand-gold/30 bg-brand-gold/10 text-brand-lea dark:text-slate-100";
}

/**
 * The stage's own colour (set at /candidates/manage) beats the keyword guess,
 * which quietly stops working the moment somebody renames a stage. Same rule
 * CandidateRow applies on the Candidates list.
 */
export function stagePillClass(stage: string | null, stageList?: CandidateStage[]) {
  const entry = findStage(stage, stageList);
  return entry?.color ? tagChipClass(stage ?? "", entry.color) : stagePill(stage);
}
