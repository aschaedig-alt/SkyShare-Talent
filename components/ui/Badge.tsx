import { clsx } from "clsx";

// Shared status/label pill. Tones carry consistent light + dark styling so
// status badges stop being one-off color strings. Defaults mirror the existing
// `rounded px-2.5 py-0.5 text-xs font-semibold` shape used across the app.

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-brand-cloudDancer text-brand-grey dark:bg-white/5 dark:text-slate-400",
  success: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300",
  warning: "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  danger: "bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  info: "bg-sky-50 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300",
  brand: "bg-brand-gold/15 text-brand-lea dark:text-slate-100"
};

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
};

export function Badge({ tone = "neutral", className, ...rest }: BadgeProps) {
  return <span className={clsx("inline-flex items-center gap-1 rounded px-2.5 py-0.5 text-xs font-semibold", TONES[tone], className)} {...rest} />;
}
