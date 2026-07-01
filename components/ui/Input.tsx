import { forwardRef } from "react";
import { clsx } from "clsx";

// Shared text field primitives (Input + Textarea). Default styling matches the
// dominant existing field classes (border-brand-lea/20, gold focus border) so
// swapping an inline <input> for <Input> is visually identical. Keyboard focus
// ring is handled globally via :focus-visible.

const FIELD =
  "w-full rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-lea outline-none transition focus:border-brand-gold disabled:opacity-60 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref
) {
  return <input ref={ref} className={clsx(FIELD, className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref
) {
  return <textarea ref={ref} className={clsx(FIELD, "resize-y", className)} {...rest} />;
});
