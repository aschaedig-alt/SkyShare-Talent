import { AlertTriangle } from "lucide-react";
import { clsx } from "clsx";
import { formatPhone } from "@/lib/formatting/phone";

/**
 * A candidate's or employee's phone number, always as 111.111.1111.
 *
 * A number that is not a US one is shown exactly as stored, in red with a
 * warning mark and the reason on hover — her rule is that it "show an error",
 * not that it be hidden. See lib/formatting/phone.ts.
 */
export function PhoneNumber({
  value,
  empty = null,
  link = false,
  className
}: {
  value: string | null | undefined;
  /** What to render when there is no number at all. */
  empty?: React.ReactNode;
  /** Render a US number as a tel: link. */
  link?: boolean;
  className?: string;
}) {
  const f = formatPhone(value);
  if (!f) return <>{empty}</>;

  if (!f.ok) {
    return (
      <span
        className={clsx("inline-flex items-center gap-1 text-red-700 dark:text-red-300", className)}
        title={`${f.reason ?? "Not a US number"} — expected 111.111.1111`}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
        <span>{f.text}</span>
        <span className="sr-only">({f.reason ?? "Not a US number"})</span>
      </span>
    );
  }

  if (link) {
    return (
      <a href={`tel:+1${f.text.replace(/\D/g, "").slice(0, 10)}`} className={clsx("hover:underline", className)}>
        {f.text}
      </a>
    );
  }
  return <span className={className}>{f.text}</span>;
}

/** The inline error under a phone input, or nothing when the number is fine. */
export function PhoneInputError({ value }: { value: string | null | undefined }) {
  const f = formatPhone(value);
  if (!f || f.ok) return null;
  return (
    <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-red-700 dark:text-red-300">
      <AlertTriangle className="h-3 w-3" aria-hidden /> {f.reason ?? "Not a US number"} — US numbers show as 111.111.1111
    </p>
  );
}
