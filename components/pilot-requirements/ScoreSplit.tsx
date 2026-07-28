"use client";

/**
 * The split fit score: a Qualified half (meets-the-minimums, green) next to a
 * Bonus half (add-only nice-to-haves, gold), with the combined total alongside.
 *
 * Three states, deliberately distinct:
 *  - gated     — a HARD requirement is confirmed NOT met. Red, ✕, total "gated".
 *  - unverified — a HARD requirement has no evidence either way. Muted slate,
 *                 total "no data". This is a data gap to go close, NOT a
 *                 rejection, and it must never look like a passing score: a
 *                 blank profile used to render as a confident "Qualified 100".
 *  - otherwise  — a real, assessable score.
 */
export function ScoreSplit({
  qualified,
  bonus,
  gated,
  unverified = false,
  size = "md"
}: {
  qualified: number;
  bonus: number;
  gated: boolean;
  unverified?: boolean;
  size?: "sm" | "md";
}) {
  const valText = size === "sm" ? "text-base" : "text-xl";
  const pad = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  // Gated outranks unverified: a confirmed failure is more decisive than a gap.
  const bg = gated ? "bg-value-customerFocus-light" : unverified ? "bg-brand-lea/5" : "bg-value-teamwork-light";
  const fg = gated
    ? "text-value-customerFocus-dark"
    : unverified
      ? "text-brand-grey dark:text-slate-400"
      : "text-value-teamwork-dark";

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex items-stretch overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
        <div className={`${pad} text-center ${bg}`}>
          <div className={`text-[8px] font-bold uppercase tracking-wide ${fg}`}>
            {gated ? "Qualified" : unverified ? "Unverified" : "Qualified"}
          </div>
          <div className={`${valText} font-semibold leading-tight ${fg}`}>
            {gated ? "✕" : unverified ? "?" : qualified}
          </div>
        </div>
        <div className={`${pad} text-center bg-value-leadership-light`}>
          <div className="text-[8px] font-bold uppercase tracking-wide text-value-leadership-dark">Bonus</div>
          <div className={`${valText} font-semibold leading-tight text-value-leadership-dark`}>+{bonus}</div>
        </div>
      </div>
      <div className="text-center">
        <div className="text-[8px] font-bold uppercase tracking-wide text-brand-grey dark:text-slate-400">Total</div>
        <div className={`${valText} font-semibold leading-tight ${gated ? "text-value-customerFocus-dark" : "text-brand-lea dark:text-slate-100"}`}>
          {gated ? "gated" : qualified + bonus}
        </div>
      </div>
    </div>
  );
}
