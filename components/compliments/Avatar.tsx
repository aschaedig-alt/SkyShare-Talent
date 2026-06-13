import { clsx } from "clsx";
import { avatarPalette, valueColorClasses } from "@/lib/compliments/value-colors";
import { initialsFromName } from "@/lib/compliments/format";

type AvatarProps = {
  name: string;
  /** Pre-derived initials; falls back to deriving from `name`. */
  initials?: string | null;
  /** Tie the chip color to a value; otherwise a stable per-name tint is used. */
  colorKey?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-base"
};

/** Circular initials chip: light tint bg, dark same-family text (handoff §3). */
export function Avatar({ name, initials, colorKey, size = "md", className }: AvatarProps) {
  const palette = colorKey
    ? { bg: valueColorClasses(colorKey).avatarBg, text: valueColorClasses(colorKey).avatarText }
    : avatarPalette(name);
  const text = (initials ?? initialsFromName(name)).slice(0, 2);

  return (
    <span
      aria-hidden="true"
      className={clsx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-medium",
        SIZES[size],
        palette.bg,
        palette.text,
        className
      )}
    >
      {text}
    </span>
  );
}
