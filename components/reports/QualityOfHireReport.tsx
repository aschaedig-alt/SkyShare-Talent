"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import type { QohHire, QualityOfHire } from "@/lib/quality-of-hire/report";
import { QualityOfHireUploads } from "@/components/reports/QualityOfHireUploads";
import { R } from "@/components/reports/report-ui";
import { formatCalendarDay } from "@/lib/dates/display";

// The Reports "Quality of Hire" tab - the Q4 2026 rock. His measures: interviews per
// candidate, time from application to offer, how often offers are turned down, and
// early turnover, read against who stayed and who did not. Every rule behind the
// figures is in lib/quality-of-hire/report.ts; the uploads it reads are described in
// lib/quality-of-hire/imports.ts. Built from report-ui.ts like every report.
//
// No hire is called "good" or "bad" here: those definitions are waiting on
// leadership's sign-off (roadmap, Quality of Hire). Until then the report says what
// happened - left inside a year, voluntarily or not - and leaves the verdict alone.

type Group = "all" | "pilots" | "others";
const GROUPS: Array<{ id: Group; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "pilots", label: "Pilots" },
  { id: "others", label: "Support roles" }
];

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

/** Left within a year, over the hires that can answer it. */
function early(hs: QohHire[]): { left: number; of: number } {
  const known = hs.filter((h) => h.left365 !== null);
  return { left: known.filter((h) => h.left365 === 1).length, of: known.length };
}

function Rate({ hs }: { hs: QohHire[] }) {
  const e = early(hs);
  return (
    <td className={R.num}>
      {e.of ? (
        <>
          {pct(e.left, e.of)} <span className={R.muted}>({e.left}/{e.of})</span>
        </>
      ) : (
        <span className={R.muted}>—</span>
      )}
    </td>
  );
}

const KIND_LABEL: Record<keyof QohHire["kinds"], string> = {
  recruiter_screen: "recruiter screen",
  manager_video: "manager interview",
  in_person: "in person",
  other: "other"
};

function interviewTitle(h: QohHire): string {
  const parts = (Object.keys(h.kinds) as Array<keyof QohHire["kinds"]>).filter((k) => h.kinds[k]).map((k) => `${h.kinds[k]} ${KIND_LABEL[k]}`);
  const from = h.interviewsFrom === "calendar" ? "from the calendar file" : "logged in the app";
  return parts.length ? `${parts.join(", ")} - ${from}${h.metCeo ? ", met Cory" : ""}` : `none found - ${from}`;
}

export function QualityOfHireReport({ qoh, canUpload }: { qoh: QualityOfHire; canUpload: boolean }) {
  const years = useMemo(() => [...new Set(qoh.hires.map((h) => h.year))].sort((a, b) => a - b), [qoh.hires]);
  const [group, setGroup] = useState<Group>("all");
  const [year, setYear] = useState<number | "all">("all");

  const inYear = (y: number) => year === "all" || y === year;
  const hires = qoh.hires.filter(
    (h) => !h.contractor && inYear(h.year) && (group === "all" || (group === "pilots" ? h.pilot === "Pilot" : h.pilot === "Non-pilot"))
  );
  const e1 = early(hires);
  const e90 = { left: hires.filter((h) => h.left90 === 1).length, of: hires.filter((h) => h.left90 !== null).length };
  const toOffer = hires.flatMap((h) => (h.daysApplyToOffer === null ? [] : [h.daysApplyToOffer]));
  const toStart = hires.flatMap((h) => (h.daysApplyToStart === null ? [] : [h.daysApplyToStart]));
  const searched = hires.filter((h) => h.interviews !== null);
  const withAny = searched.filter((h) => (h.interviews ?? 0) > 0);
  const offers = qoh.offers.filter((o) => inYear(o.year));
  const accepted = offers.reduce((s, o) => s + o.accepted, 0);
  const declined = offers.reduce((s, o) => s + o.declined, 0);
  const leavers = hires.filter((h) => !h.stillHere);
  const earlyLeavers = hires.filter((h) => h.left365 === 1);
  const vol = earlyLeavers.filter((h) => h.voluntary === "V").length;
  const invol = earlyLeavers.filter((h) => h.voluntary === "I").length;
  const groupWord = group === "all" ? "people" : group === "pilots" ? "pilots" : "support-role people";
  const yearWord = year === "all" ? `since ${years[0] ?? ""}` : `in ${year}`;

  // left within a year, by interviews on record
  const ivBuckets = ["0", "1", "2", "3", "4+"].map((label) => ({
    label,
    hs: searched.filter((h) => {
      const n = h.interviews ?? 0;
      return label === "4+" ? n >= 4 : n === Number(label);
    })
  }));

  const depts = [...new Set(hires.map((h) => h.department || "Not recorded"))]
    .map((d) => ({ d, hs: hires.filter((h) => (h.department || "Not recorded") === d) }))
    .filter((x) => x.hs.length >= 3)
    .sort((a, b) => b.hs.length - a.hs.length);

  const reasons = new Map<string, { v: string; n: number }>();
  for (const h of leavers) {
    const k = h.voluntary ? `${h.voluntary}|${h.reason ?? "No reason given"}` : "?|Not recorded yet";
    const r = reasons.get(k) ?? { v: k.split("|")[0], n: 0 };
    r.n += 1;
    reasons.set(k, r);
  }
  const reasonRows = [...reasons.entries()].sort((a, b) => b[1].n - a[1].n);

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div>
          <p className={R.eyebrow}>Q4 2026 rock</p>
          <h2 className={R.title}>Quality of Hire</h2>
          <p className={R.lede}>
            Who we hired, how we hired them, and whether they stayed. A <span className={R.term}>hire</span> is one employment period, so a rehire counts
            again; contractors at hire are left out of every rate.
          </p>
        </div>
        <div className={R.controls}>
          <div className={R.segmentGroup}>
            {GROUPS.map((g) => (
              <button key={g.id} type="button" onClick={() => setGroup(g.id)} aria-pressed={group === g.id} className={clsx(R.segment, group === g.id ? R.segmentOn : R.segmentOff)}>
                {g.label}
              </button>
            ))}
          </div>
          <select className={R.select} value={year} onChange={(ev) => setYear(ev.target.value === "all" ? "all" : Number(ev.target.value))} aria-label="Hire year">
            <option value="all">All years</option>
            {[...years].reverse().map((y) => (
              <option key={y} value={y}>
                Hired in {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={R.hero}>
        <div className={R.heroRow}>
          <span className={R.heroFigure}>{pct(e1.left, e1.of)}</span>
          <span className={R.heroText}>
            of the {groupWord} hired {yearWord} left within their first year
          </span>
        </div>
        <p className={R.heroSub}>
          {e1.left} of {e1.of} hires old enough to tell
          {e1.of < hires.length ? ` · ${hires.length - e1.of} more are under a year in, or left on a year-end roster date that cannot say when` : ""}
        </p>
      </div>

      <div className={R.tiles}>
        <div className={R.tile}>
          <div className={R.tileLabel}>Left within 90 days</div>
          <div className={R.tileValue}>{pct(e90.left, e90.of)}</div>
          <div className={R.tileSub}>
            {e90.left} of {e90.of}
          </div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Application to offer</div>
          <div className={R.tileValue}>{median(toOffer) === null ? "—" : `${median(toOffer)} days`}</div>
          <div className={R.tileSub}>
            median of {toOffer.length} with a real offer date · to start {median(toStart) ?? "—"} days ({toStart.length})
          </div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Offers turned down</div>
          <div className={R.tileValue}>{pct(declined, accepted + declined)}</div>
          <div className={R.tileSub}>
            {declined} declined, {accepted} accepted · by year applied, all roles
          </div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Interviews per hire</div>
          <div className={R.tileValue}>{median(withAny.map((h) => h.interviews ?? 0)) ?? "—"}</div>
          <div className={R.tileSub}>
            median where any were found · {withAny.length} of {searched.length} searched hires had one
          </div>
        </div>
      </div>
      <div className={R.tiles}>
        <div className={R.tile}>
          <div className={R.tileLabel}>Left in year one, involuntary</div>
          <div className={R.tileValue}>{invol}</div>
          <div className={R.tileSub}>let go inside a year - the clearest miss</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Left in year one, voluntary</div>
          <div className={R.tileValue}>{vol}</div>
          <div className={R.tileSub}>chose to leave inside a year</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Left in year one, not typed</div>
          <div className={R.tileValue}>{earlyLeavers.length - vol - invol}</div>
          <div className={R.tileSub}>no voluntary or involuntary on file yet</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Still here today</div>
          <div className={R.tileValue}>{pct(hires.length - leavers.length, hires.length)}</div>
          <div className={R.tileSub}>
            {hires.length - leavers.length} of {hires.length} hires
          </div>
        </div>
      </div>

      <div className={clsx(R.box, "grid gap-6 lg:grid-cols-2")}>
        <div>
          <div className={R.sectionLabel}>Left within a year, by interviews on record</div>
          <div className={R.tableWrap}>
            <table className={R.table}>
              <thead className={R.thead}>
                <tr>
                  <th className={R.th}>Interviews</th>
                  <th className={clsx(R.th, "text-right")}>Hires</th>
                  <th className={clsx(R.th, "text-right")}>Left within a year</th>
                </tr>
              </thead>
              <tbody className={R.tbody}>
                {ivBuckets.map((b) => (
                  <tr key={b.label} className={R.tr}>
                    <td className={R.td}>{b.label}</td>
                    <td className={R.num}>{b.hs.length}</td>
                    <Rate hs={b.hs} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={R.footnote}>
            A lead, not proof: &quot;0&quot; includes hires whose interviews happened but were never on a calendar the search could read (FBO line hiring, David&apos;s
            and Harry&apos;s). Hires nothing searched are left out.
          </p>
        </div>
        <div>
          <div className={R.sectionLabel}>Why people left</div>
          <div className={R.tableWrap}>
            <table className={R.table}>
              <thead className={R.thead}>
                <tr>
                  <th className={R.th}>Reason</th>
                  <th className={clsx(R.th, "text-right")}>Leavers</th>
                </tr>
              </thead>
              <tbody className={R.tbody}>
                {reasonRows.map(([k, r]) => (
                  <tr key={k} className={R.tr}>
                    <td className={R.td}>
                      {r.v !== "?" ? <span className={clsx(R.chip, "mr-2")}>{r.v === "V" ? "Voluntary" : "Involuntary"}</span> : null}
                      <span className={r.v === "?" ? R.muted : undefined}>{k.split("|")[1]}</span>
                    </td>
                    <td className={R.num}>{r.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={R.footnote}>From Paycom&apos;s terminations report, and HR&apos;s sheet for older leavers Paycom never typed. &quot;Unknown&quot; is an accepted answer.</p>
        </div>
      </div>

      <div className="mt-5">
        <div className={R.sectionLabel}>By department at hire (3 or more hires)</div>
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[720px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Department</th>
                <th className={clsx(R.th, "text-right")}>Hires</th>
                <th className={clsx(R.th, "text-right")}>Left within a year</th>
                <th className={clsx(R.th, "text-right")}>Involuntary in year one</th>
                <th className={clsx(R.th, "text-right")}>Interview on record</th>
                <th className={clsx(R.th, "text-right")}>Still here</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {depts.map(({ d, hs }) => {
                const s = hs.filter((h) => h.interviews !== null);
                return (
                  <tr key={d} className={R.tr}>
                    <td className={R.td}>{d}</td>
                    <td className={R.num}>{hs.length}</td>
                    <Rate hs={hs} />
                    <td className={R.num}>{hs.filter((h) => h.left365 === 1 && h.voluntary === "I").length}</td>
                    <td className={R.num}>{s.length ? pct(s.filter((h) => (h.interviews ?? 0) > 0).length, s.length) : "—"}</td>
                    <td className={R.num}>{pct(hs.filter((h) => h.stillHere).length, hs.length)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className={clsx(R.box, "grid gap-6 lg:grid-cols-[1.4fr_1fr]")}>
        <div>
          <div className={R.sectionLabel}>Offers, by year applied - all roles</div>
          <div className={R.tableWrap}>
            <table className={R.table}>
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
                {[...qoh.offers].reverse().map((o) => (
                  <tr key={o.year} className={clsx(R.tr, year === o.year && "bg-brand-gold/10")}>
                    <td className={R.td}>{o.year}</td>
                    <td className={R.num}>{o.reached}</td>
                    <td className={R.num}>{o.accepted}</td>
                    <td className={R.num}>{o.declined}</td>
                    <td className={R.num}>{o.rescinded}</td>
                    <td className={R.num}>{pct(o.declined, o.accepted + o.declined)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={R.footnote}>
            One row per candidate per year. Applications start mid-2023, so earlier hires have no offer on file. Accepted and never started: {qoh.neverStarted}.
          </p>
        </div>
        <div>
          <div className={R.sectionLabel}>Why offers were turned down</div>
          <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
            {qoh.declineReasons.map((r) => (
              <li key={r.reason} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                <span className={r.reason === "No reason recorded" ? R.muted : undefined}>{r.reason}</span>
                <span className="tabular-nums">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {qoh.mismatches.length ? (
        <div className={R.box}>
          <div className={R.sectionLabel}>Paycom and Journey disagree - {qoh.mismatches.length}</div>
          <p className={R.footnote}>
            Paycom says these people left, and Journey has no last day near it. Most are a leaver Journey has not been told about; a Dec 31 date is a year-end
            roster, where Paycom&apos;s is the real day. Nothing here changes anybody&apos;s record.
          </p>
          <ul className="mt-2 divide-y divide-brand-lea/10 dark:divide-white/10">
            {qoh.mismatches.map((m) => (
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
        </div>
      ) : null}

      <details className="mt-5">
        <summary className={clsx(R.listTitle, "cursor-pointer")}>Every hire in this view - {hires.length}</summary>
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[960px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Person</th>
                <th className={R.th}>Started</th>
                <th className={R.th}>Role at hire</th>
                <th className={clsx(R.th, "text-right")}>Interviews</th>
                <th className={clsx(R.th, "text-right")}>Apply to offer</th>
                <th className={R.th}>Left</th>
                <th className={R.th}>Why</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {hires.map((h) => (
                <tr key={`${h.id}-${h.start}`} className={R.tr}>
                  <td className={R.td}>
                    <Link href={`/people/${h.id}`} className={R.link}>
                      {h.name}
                    </Link>
                    {h.rehire ? <span className={clsx(R.chip, "ml-2")}>rehire</span> : null}
                  </td>
                  <td className={R.td}>{formatCalendarDay(h.start)}</td>
                  <td className={R.td}>
                    {h.role ?? <span className={R.muted}>not recorded</span>}
                    <span className={clsx("block text-[11px]", R.muted)}>{h.department || "—"}</span>
                  </td>
                  <td className={R.num} title={h.interviews === null ? "Not searched" : interviewTitle(h)}>
                    {h.interviews ?? <span className={R.muted}>—</span>}
                    {h.metCeo ? <span className={clsx(R.chip, "ml-2")}>Cory</span> : null}
                  </td>
                  <td className={R.num}>{h.daysApplyToOffer === null ? <span className={R.muted}>—</span> : `${h.daysApplyToOffer} d`}</td>
                  <td className={R.td}>
                    {h.stillHere ? (
                      <span className={R.muted}>still here</span>
                    ) : (
                      <>
                        {formatCalendarDay(h.end)}
                        {h.rosterExit ? <span className={R.muted} title="A year-end roster date - the real last day is later"> †</span> : null}
                        {h.left365 === 1 ? <span className={clsx(R.chip, "ml-2")}>year one</span> : null}
                      </>
                    )}
                  </td>
                  <td className={R.td}>
                    {h.voluntary ? <span className={clsx(R.chip, "mr-2")}>{h.voluntary === "V" ? "Voluntary" : "Involuntary"}</span> : null}
                    <span className={h.reason ? undefined : R.muted}>{h.stillHere ? "" : h.reason ?? "not recorded"}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className={R.footnote}>
        Interviews come from the calendar file
        {qoh.calendarSpan ? ` (hires ${formatCalendarDay(qoh.calendarSpan.from)} to ${formatCalendarDay(qoh.calendarSpan.to)})` : ""}, and from interviews
        logged in the app, whichever found more. The calendar file cannot see David&apos;s or Harry&apos;s own calendars, nor most FBO line hiring; a hire
        after it was made counts only what is logged in the app. Applications begin mid-2023 and real offer dates in 2026, so the speed figures stand on few
        hires. Protected characteristics are not read anywhere in this report.
      </p>

      {canUpload ? <QualityOfHireUploads imports={qoh.imports} /> : null}
    </section>
  );
}
