import { clsx } from "clsx";
import { valueColorClasses } from "@/lib/compliments/value-colors";

type ValueTagProps = {
  name: string;
  colorKey: string;
  className?: string;
};

/** A value chip: light fill + dark same-family text, element radius (handoff §3). */
export function ValueTag({ name, colorKey, className }: ValueTagProps) {
  const colors = valueColorClasses(colorKey);
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-element px-2.5 py-1 text-xs font-medium",
        colors.tag,
        className
      )}
    >
      {name}
    </span>
  );
}

/** Neutral points pill, sized to sit alongside value tags. */
export function PointsTag({ points, className }: { points: number; className?: string }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-element bg-brand-cloudDancer px-2.5 py-1 text-xs font-medium text-brand-black dark:bg-white/5 dark:text-slate-100",
        className
      )}
    >
      +{points} points
    </span>
  );
}
