import { clsx } from "clsx";
import { tagChipClass } from "@/lib/tags/colors";

/**
 * One candidate tag, coloured. 4px corners like every other pill in the app —
 * pills are rectangles here, rounded-full is for circles only.
 */
export function CandidateTagPill({
  label,
  color,
  className
}: {
  label: string;
  color?: string | null;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold",
        tagChipClass(label, color),
        className
      )}
    >
      {label}
    </span>
  );
}
