"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { clsx } from "clsx";
import type { QohHire, QualityOfHire } from "@/lib/quality-of-hire/report";
import { R } from "@/components/reports/report-ui";
import { formatCalendarDay } from "@/lib/dates/display";

// Quality of Hire > Interviews: everything the calendar file holds, not just the one
// "left within a year by interviews" table. Asked for 2026-10-29: "can i see the data
// from the calendar interviews outside of the one place". Three views of the same
// hires the tab's filters pick: by hire year, by interviewer, and hire by hire with
// each interview listed. Interviewer handles become names only where a person has
// exactly that SkyShare address (lib/quality-of-hire/report.ts).

const KINDS = ["recruiter_screen", "manager_video", "in_person", "other"] as const;
const KIND_LABEL: Record<(typeof KINDS)[number], string> = {
  recruiter_screen: "Recruiter screen",
  manager_video: "Manager interview",
  in_person: "In person",
  other: "Other"
};

function pct(part: number, whole: number): string {
  return whole ? `${Math.round((part / whole) * 100)}%` : "—";
}

function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

function Early({ hs }: { hs: QohHire[] }) {
  const known = hs.filter((h) => h.left365 !== null);
  const left = known.filter((h) => h.left365 === 1).length;
  return (
    <td className={R.num}>
      {known.length ? (
        <>
          {pct(left, known.length)} <span className={R.muted}>({left}/{known.length})</span>
        </>
      ) : (
        <span className={R.muted}>—</span>
      )}
    </td>
  );
}

export function QualityOfHireInterviews({ hires, interviewers }: { hires: QohHire[]; interviewers: QualityOfHire["interviewers"] }) {
  const [open, setOpen] = useState<string | null>(null);
  const searched = hires.filter((h) => h.interviews !== null);
  const years = [...new Set(searched.map((h) => h.year))].sort((a, b) => b - a);

  const who = (handle: string) => interviewers[handle]?.name ?? handle;
  const byPerson = new Map<string, QohHire[]>();
  for (const h of searched) {
    for (const handle of new Set(h.interviewList.flatMap((i) => i.interviewers))) {
      const list = byPerson.get(handle) ?? [];
      list.push(h);
      byPerson.set(handle, list);
    }
  }
  const people = [...byPerson.entries()]
    .map(([handle, hs]) => ({ handle, hs, interviews: hs.reduce((n, h) => n + h.interviewList.filter((i) => i.interviewers.includes(handle)).length, 0) }))
    .filter((p) => p.hs.length >= 3)
    .sort((a, b) => b.hs.length - a.hs.length);

  const withList = searched.filter((h) => h.interviewList.length);

  return (
    <div className={R.box}>
      <div className={R.sectionLabel}>Interviews before hire</div>
      <p className={R.footnote}>
        From the calendar file you uploaded, and interviews logged in the app. Follows the filters above. Before 2022 nothing was searched.
      </p>

      <div className="mt-3">
        <div className={R.listTitle}>By hire year</div>
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[860px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Hired</th>
                <th className={clsx(R.th, "text-right")}>Hires searched</th>
                <th className={clsx(R.th, "text-right")}>With an interview</th>
                <th className={clsx(R.th, "text-right")}>Interviews</th>
                <th className={clsx(R.th, "text-right")}>Typical per hire</th>
                {KINDS.map((k) => (
                  <th key={k} className={clsx(R.th, "text-right")}>
                    {KIND_LABEL[k]}
                  </th>
                ))}
                <th className={clsx(R.th, "text-right")}>Met Cory</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {years.map((y) => {
                const hs = searched.filter((h) => h.year === y);
                const any = hs.filter((h) => (h.interviews ?? 0) > 0);
                return (
                  <tr key={y} className={R.tr}>
                    <td className={R.td}>{y}</td>
                    <td className={R.num}>{hs.length}</td>
                    <td className={R.num}>
                      {any.length} <span className={R.muted}>({pct(any.length, hs.length)})</span>
                    </td>
                    <td className={R.num}>{hs.reduce((n, h) => n + (h.interviews ?? 0), 0)}</td>
                    <td className={R.num}>{median(any.map((h) => h.interviews ?? 0)) ?? "—"}</td>
                    {KINDS.map((k) => (
                      <td key={k} className={R.num}>
                        {hs.reduce((n, h) => n + h.kinds[k], 0)}
                      </td>
                    ))}
                    <td className={R.num}>{hs.filter((h) => h.metCeo).length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5">
        <div className={R.listTitle}>Who interviewed - people in on 3 or more hires</div>
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[720px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Interviewer</th>
                <th className={clsx(R.th, "text-right")}>Hires they met</th>
                <th className={clsx(R.th, "text-right")}>Interviews</th>
                <th className={clsx(R.th, "text-right")}>Those hires: left within a year</th>
                <th className={clsx(R.th, "text-right")}>Still here</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {people.map((p) => {
                const person = interviewers[p.handle];
                return (
                  <tr key={p.handle} className={R.tr}>
                    <td className={R.td}>
                      {person?.id ? (
                        <Link href={`/people/${person.id}`} className={R.link}>
                          {person.name}
                        </Link>
                      ) : (
                        <span className={person ? R.strong : R.muted}>{who(p.handle)}</span>
                      )}
                    </td>
                    <td className={R.num}>{p.hs.length}</td>
                    <td className={R.num}>{p.interviews}</td>
                    <Early hs={p.hs} />
                    <td className={R.num}>{pct(p.hs.filter((h) => h.stillHere).length, p.hs.length)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className={R.footnote}>
          Anyone invited counts, including people whose own calendars could not be read (David, Harry): their interviews show here when somebody else&apos;s
          calendar had them on the invite. Small groups are noise; the left-within-a-year column reflects the roles each person hires for as much as the person.
        </p>
      </div>

      <details className="mt-5">
        <summary className={clsx(R.listTitle, "cursor-pointer")}>Each hire&apos;s interviews - {withList.length} hires</summary>
        <div className={R.tableWrap}>
          <table className={clsx(R.table, "min-w-[860px]")}>
            <thead className={R.thead}>
              <tr>
                <th className={R.th}>Person</th>
                <th className={R.th}>Started</th>
                <th className={R.th}>Role at hire</th>
                <th className={clsx(R.th, "text-right")}>Interviews</th>
                <th className={R.th}>First interview</th>
                <th className={R.th}>Stayed</th>
              </tr>
            </thead>
            <tbody className={R.tbody}>
              {withList.map((h) => {
                const key = `${h.id}-${h.start}`;
                const isOpen = open === key;
                return (
                  <Fragment key={key}>
                    <tr className={clsx(R.tr, isOpen && "bg-brand-gold/10")}>
                      <td className={R.td}>
                        <Link href={`/people/${h.id}`} className={R.link}>
                          {h.name}
                        </Link>
                      </td>
                      <td className={R.td}>{formatCalendarDay(h.start)}</td>
                      <td className={R.td}>{h.role ?? <span className={R.muted}>not recorded</span>}</td>
                      <td className={R.num}>
                        <button type="button" className={R.smallButton} onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen}>
                          {h.interviews} {isOpen ? "▴" : "▾"}
                        </button>
                      </td>
                      <td className={R.td}>{formatCalendarDay(h.interviewList[0]?.date) || "—"}</td>
                      <td className={R.td}>
                        {h.stillHere ? <span className={R.muted}>still here</span> : h.left365 === 1 ? "left in year one" : "left later"}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="bg-brand-gold/10">
                        <td className={R.td} colSpan={6}>
                          <ul className="space-y-1">
                            {h.interviewList.map((i, n) => (
                              <li key={n} className="flex flex-wrap gap-x-3 text-sm">
                                <span className="tabular-nums">{formatCalendarDay(i.date)}</span>
                                <span className={R.strong}>{KIND_LABEL[i.kind]}</span>
                                <span className={R.muted}>
                                  {i.interviewers.length ? i.interviewers.map(who).join(", ") : h.interviewsFrom === "app" ? "logged in the app" : "no one named"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
