import { clsx } from "clsx";

// "Different than normal", drawn the same way everywhere it appears.
//
// HIS STANDING RULE: a time or place that is not the usual one (9:30 AM – 3:00 PM
// at SkyShare HQ, 180 2400 W) is allowed, but it is FLAGGED as different than
// normal — visibly — and never just quietly written into an email or an invite.
// The sentences come from describeOffNormal in lib/orientation/places.ts; this
// file only decides how they look, so the session header, the time-and-place
// editor and the three send dialogs cannot drift into three different warnings.
//
// Amber, because amber is what this app uses for "look at this before you send".
// It is a flag, not an error: nothing is blocked by it.

export function OffNormalNotice({
  lines,
  note,
  className
}: {
  lines: string[];
  /** One more sentence under the list — what the flag means for THIS surface. */
  note?: React.ReactNode;
  className?: string;
}) {
  if (!lines.length) return null;
  return (
    <div
      role="note"
      className={clsx(
        "rounded border border-amber-400 bg-amber-50 p-2.5 text-[12px] text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
        className
      )}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-wide">Different than normal</p>
      <ul className="mt-1 space-y-0.5">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {note ? <p className="mt-1.5">{note}</p> : null}
    </div>
  );
}

/** The compact form for a header line. A rectangle, per the design system —
    pills are never rounded-full here. The sentences ride in the title so the
    chip stays one line; the notice above is the full version. */
export function OffNormalChip({ lines, className }: { lines: string[]; className?: string }) {
  if (!lines.length) return null;
  return (
    <span
      title={lines.join(" ")}
      className={clsx(
        "inline-flex items-center rounded border border-amber-400 bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-wide text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-200",
        className
      )}
    >
      Different than normal
    </span>
  );
}
