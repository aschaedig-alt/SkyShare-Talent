"use client";

/**
 * The split fit score: a Qualified half (meets-the-minimums, green) next to a
 * Bonus half (add-only nice-to-haves, gold), with the combined total alongside.
 * When a HARD requirement is missing the candidate is "gated" — the qualified
 * half turns red with an ✕ and the total reads "gated".
 */
export function ScoreSplit({
  qualified,
  bonus,
  gated,
  size = "md"
}: {
  qualified: number;
  bonus: number;
  gated: boolean;
  size?: "sm" | "md";
}) {
  const valText = size === "sm" ? "text-base" : "text-xl";
  const pad = size === "sm" ? "px-2 py-0.5" : "px-2.5 py-1";

  return (
    <div className="inline-flex items-center gap-2">
      <div className="flex items-stretch overflow-hidden rounded border border-brand-lea/15 dark:border-white/10">
        <div className={`${pad} text-center ${gated ? "bg-value-customerFocus-light" : "bg-value-teamwork-light"}`}>
          <div className={`text-[8px] font-bold uppercase tracking-wide ${gated ? "text-value-customerFocus-dark" : "text-value-teamwork-dark"}`}>
            Qualified
          </div>
          <div className={`${valText} font-semibold leading-tight ${gated ? "text-value-customerFocus-dark" : "text-value-teamwork-dark"}`}>
            {gated ? "✕" : qualified}
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
