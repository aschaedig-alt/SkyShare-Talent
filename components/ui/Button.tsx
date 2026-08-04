import { forwardRef } from "react";
import { clsx } from "clsx";

// Shared button primitive — the one source of truth for button styling so the
// ~250 previously-inline button variants stay consistent (hover / focus /
// disabled). Defaults match the dominant existing classes exactly (primary
// bg-brand-lea + hover:bg-brand-eden, secondary border-brand-lea/20), so
// migrating a button to <Button> is a visual no-op. The gold keyboard focus
// ring comes from the global :focus-visible rule in globals.css.

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "gold" | "toolbar" | "link";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded font-semibold transition disabled:opacity-50 disabled:pointer-events-none";

// `hover:shadow-glow` is the locked site-wide "you're interacting" cue (gold
// glow). It lives on the variants rather than BASE because two variants must not
// have it: `danger`, where a friendly gold bloom is the wrong signal for a
// destructive action (red buttons app-wide use a darker red hover instead), and
// `link`, which has no box to glow and underlines instead.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand-lea text-white hover:bg-brand-eden hover:shadow-glow dark:bg-brand-eden dark:hover:bg-brand-sweet dark:hover:text-brand-lea",
  secondary:
    "border border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 hover:shadow-glow dark:border-white/10 dark:bg-white/5 dark:text-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost:
    "text-brand-grey hover:bg-brand-cloudDancer/60 hover:text-brand-lea hover:shadow-glow dark:text-slate-400 dark:hover:bg-white/10",
  // Accent call-to-action (e.g. "New candidate", "Upload"). Gold fill, navy text.
  gold: "bg-brand-gold text-brand-lea hover:bg-brand-sweet hover:shadow-glow",
  // Outlined button that sits on a dark header/toolbar (white on navy).
  toolbar: "border border-white/20 text-white hover:bg-white/10 hover:shadow-glow",
  // Text/link-style button — for actions that read as a link inside a sentence
  // ("Clear all filters", "Scan again"). Matches the dominant hand-rolled idiom:
  // eden text, underline on hover, brand-sweet in dark mode.
  link: "text-brand-eden underline-offset-2 hover:underline dark:text-brand-sweet"
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm"
};

// The link variant takes the text size but none of the padding or fill, so it
// sits inline the way the hand-rolled link-buttons it replaces do.
const LINK_SIZES: Record<ButtonSize, string> = {
  sm: "text-xs",
  md: "text-sm"
};

// Class string only — for styling a non-<button> element (e.g. a Next <Link>
// that looks like a button, or an <a>). Keeps link-buttons consistent too.
export function buttonClasses(opts?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }): string {
  const { variant = "primary", size = "md", className } = opts ?? {};
  const sizeClasses = variant === "link" ? LINK_SIZES[size] : SIZES[size];
  return clsx(BASE, VARIANTS[variant], sizeClasses, className);
}

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", type = "button", className, ...rest },
  ref
) {
  return <button ref={ref} type={type} className={buttonClasses({ variant, size, className })} {...rest} />;
});
