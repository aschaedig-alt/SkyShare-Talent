import Link from "next/link";
import { R } from "@/components/reports/report-ui";
import { formatCalendarDay } from "@/lib/dates/display";
import type { QohMismatch } from "@/lib/quality-of-hire/report";

// Paycom says these people left and Journey has no last day near it. It was a
// section of Hire quality until Nov 24 2026; it is upkeep, not a report, so it sits
// on Data > Cleanup now. Admins only: it comes from Hire quality's data, which names
// why people left. Nothing here changes a record.

export function PaycomMismatches({ mismatches }: { mismatches: QohMismatch[] }) {
  return (
    <section className={R.panel}>
      <p className={R.eyebrow}>Cleanup · HR only</p>
      <h2 className={R.title}>Paycom and Journey disagree - {mismatches.length}</h2>
      <p className={R.lede}>
        Paycom says these people left, and Journey has no last day near it. Most are a leaver Journey has not been told about; a Dec 31 date is a year-end
        roster, where Paycom&apos;s is the real day. Open the person to fix their dates. Nothing here changes anybody&apos;s record.
      </p>
      {mismatches.length ? (
        <ul className="mt-3 divide-y divide-brand-lea/10 dark:divide-white/10">
          {mismatches.map((m) => (
            <li key={`${m.name}-${m.paycomLeft}`} className="flex flex-wrap items-baseline justify-between gap-3 py-2 text-sm">
              {m.id ? (
                <Link href={`/people/${m.id}`} className={R.link}>
                  {m.name}
                </Link>
              ) : (
                <span className={R.strong}>{m.name}</span>
              )}
              <span className={R.muted}>
                Paycom: left {formatCalendarDay(m.paycomLeft) || "—"} · Journey:{" "}
                {m.journey
                  .split(", ")
                  .map((x) => (/^\d{4}-\d{2}-\d{2}$/.test(x) ? `left ${formatCalendarDay(x)}` : x))
                  .join(", ")}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={R.note}>Nothing to fix: every leaver Paycom knows about has a last day in Journey.</p>
      )}
    </section>
  );
}
