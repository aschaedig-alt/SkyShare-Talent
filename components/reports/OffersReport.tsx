import { clsx } from "clsx";
import { R } from "@/components/reports/report-ui";
import type { QohOfferYear } from "@/lib/quality-of-hire/report";

// Reports > Hiring > Offers. Until Nov 24 2026 this was two sections at the bottom of
// Hire quality; the redesign he picked gave it a report of its own. Counts only - the
// page builds this from Hire quality's data on the server and sends no names.

export type OffersData = {
  /** Oldest year first. */
  years: QohOfferYear[];
  declineReasons: Array<{ reason: string; count: number }>;
  neverStarted: number;
  /** Medians over hires with a real date, contractors at hire left out (Hire quality's rule). */
  toOffer: { median: number | null; of: number };
  toStart: { median: number | null; of: number };
};

const OTHER_DECLINE = "Usually another offer: better pay, no relocation, or a preferred schedule";
const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");

export function OffersReport({ data }: { data: OffersData }) {
  const latest = [...data.years].reverse().find((y) => y.accepted + y.declined > 0) ?? data.years[data.years.length - 1] ?? null;

  return (
    <section className={R.panel}>
      <p className={R.eyebrow}>Hiring</p>
      <h2 className={R.title}>Offers</h2>
      <p className={R.lede}>Offers made, accepted and turned down, by the year the person applied - and how long it takes to get there.</p>

      {latest ? (
        <div className={R.hero}>
          <div className={R.heroRow}>
            <span className={R.heroFigure}>{pct(latest.declined, latest.accepted + latest.declined)}</span>
            <span className={R.heroText}>of offers to people who applied in {latest.year} were turned down</span>
          </div>
          <p className={R.heroSub}>
            {latest.declined} declined, {latest.accepted} accepted · {latest.reached} reached an offer{latest.open ? ` · ${latest.open} still open` : ""}
          </p>
        </div>
      ) : null}

      <div className={R.tiles}>
        <div className={R.tile}>
          <div className={R.tileLabel}>Offers, {latest?.year ?? "—"}</div>
          <div className={R.tileValue}>{latest?.reached ?? 0}</div>
          <div className={R.tileSub}>people who reached an offer</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Rescinded, {latest?.year ?? "—"}</div>
          <div className={R.tileValue}>{latest?.rescinded ?? 0}</div>
          <div className={R.tileSub}>withdrawn by SkyShare</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Application to offer</div>
          <div className={R.tileValue}>{data.toOffer.median === null ? "—" : `${data.toOffer.median} days`}</div>
          <div className={R.tileSub}>median of {data.toOffer.of} hires with a real offer date</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Application to start</div>
          <div className={R.tileValue}>{data.toStart.median === null ? "—" : `${data.toStart.median} days`}</div>
          <div className={R.tileSub}>median of {data.toStart.of} hires</div>
        </div>
      </div>

      <div className={clsx(R.box, "grid gap-6 lg:grid-cols-[1.4fr_1fr]")}>
        <div className="min-w-0">
          <div className={R.sectionLabel}>Offers, by year applied - all roles</div>
          <div className={R.tableWrap}>
            <table className={clsx(R.table, R.stackTable)}>
              <thead className={R.thead}>
                <tr>
                  <th className={R.th}>Year</th>
                  <th className={clsx(R.th, "text-right")}>Reached an offer</th>
                  <th className={clsx(R.th, "text-right")}>Accepted</th>
                  <th className={clsx(R.th, "text-right")}>Declined</th>
                  <th className={clsx(R.th, "text-right")}>Rescinded</th>
                  <th className={clsx(R.th, "text-right")}>Turned down</th>
                </tr>
              </thead>
              <tbody className={R.tbody}>
                {[...data.years].reverse().map((o) => (
                  <tr key={o.year} className={R.tr}>
                    <td className={clsx(R.td, R.strong)}>{o.year}</td>
                    <td data-l="Reached an offer" className={R.num}>
                      {o.reached}
                    </td>
                    <td data-l="Accepted" className={R.num}>
                      {o.accepted}
                    </td>
                    <td data-l="Declined" className={R.num}>
                      {o.declined}
                    </td>
                    <td data-l="Rescinded" className={R.num}>
                      {o.rescinded}
                    </td>
                    <td data-l="Turned down" className={R.num}>
                      {pct(o.declined, o.accepted + o.declined)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={R.footnote}>
            One row per candidate per year. Applications start mid-2023, so earlier hires have no offer on file. Accepted and never started:{" "}
            {data.neverStarted}.
          </p>
        </div>
        <div className="min-w-0">
          <div className={R.sectionLabel}>Why offers were turned down</div>
          <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
            {data.declineReasons.map((r) => (
              <li key={r.reason} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className={r.reason === "No reason recorded" ? R.muted : undefined}>
                  {r.reason}
                  {/^other$/i.test(r.reason) ? <span className={clsx("block text-[11px]", R.muted)}>{OTHER_DECLINE}</span> : null}
                </span>
                <span className="tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="mt-4">
        <summary className={clsx(R.listTitle, "cursor-pointer marker:text-brand-gold")}>How this is counted</summary>
        <p className={R.lede}>
          A person counts once per year they applied, with their best outcome; someone who started within a year of applying counts as accepted,
          whatever the application says. Turned down is declined over accepted plus declined;
          rescinded offers are counted apart. The two speeds are medians over hires, contractors at hire left out, and real offer dates only begin in
          2026, so they stand on few hires. The reasons are counted per declined application. The same data as Hire quality.
        </p>
      </details>
    </section>
  );
}
