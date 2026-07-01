import { forwardRef } from "react";
import { clsx } from "clsx";

// Shared button primitive — the one source of truth for button styling so the
// ~250 previously-inline button variants stay consistent (hover / focus /
// disabled). Defaults match the dominant existing classes exactly (primary
// bg-brand-lea + hover:bg-brand-eden, secondary border-brand-lea/20), so
// migrating a button to <Button> is a visual no-op. The gold keyboard focus
// ring comes from the global :focus-visible rule in globals.css.

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "gold" | "toolbar";
export type ButtonSize = "sm" | "md";

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded font-semibold transition disabled:opacity-50 disabled:pointer-events-none";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand-lea text-white hover:bg-brand-eden",
  secondary:
    "border border-brand-lea/20 text-brand-lea hover:bg-brand-cloudDancer/60 dark:border-white/10 dark:bg-white/5 dark:text-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700",
  ghost: "text-brand-grey hover:bg-brand-cloudDancer/60 hover:text-brand-lea dark:text-slate-400 dark:hover:bg-white/10",
  // Accent call-to-action (e.g. "New candidate", "Upload"). Gold fill, navy text.
  gold: "bg-brand-gold text-brand-lea hover:bg-brand-sweet dark:text-slate-100",
  // Outlined button that sits on a dark header/toolbar (white on navy).
  toolbar: "border border-white/20 text-white hover:bg-white/10"
};

const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm"
};

// Class string only — for styling a non-<button> element (e.g. a Next <Link>
// that looks like a button, or an <a>). Keeps link-buttons consistent too.
export function buttonClasses(opts?: { variant?: ButtonVariant; size?: ButtonSize; className?: string }): string {
  const { variant = "primary", size = "md", className } = opts ?? {};
  return clsx(BASE, VARIANTS[variant], SIZES[size], className);
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
