"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import { R } from "@/components/reports/report-ui";
import { CORE_VALUE_NAMES, RATING_LABEL, type RatingKey } from "@/lib/interviews/scorecard";
import { ROLE_PROGRESS_LABEL, isAnytimeDayMark, ratedCheckin, scoreColor, scoreWord } from "@/lib/onboarding/checkin-rating";
import type { CheckinReport as Report, CheckinRow } from "@/lib/quality-of-hire/checkins";
import { formatMomentDate } from "@/lib/dates/display";

// Reports > Check-ins - his pick, Nov 17 2026, from three mock-ups: option A's
// score grid and option C's follow-up list and check-in status, in ONE report panel
// (report-ui.ts). Phone first (always-works-on-mobile): no table, so nothing
// scrolls sideways; every row is a card on a phone and a grid row on a wide screen.
// The data and its rules are in lib/quality-of-hire/checkins.ts.

export const SHORT = ["Passion", "Team", "Wow", "Solutions"];
// An anytime check-in (past the first year) is labeled by tenure: "1 year 7 months".
const markLabel = (m: number) => ratedCheckin(m)?.short ?? "Check-in";
const isAnytime = (m: number) => isAnytimeDayMark(m);
const NOW: Record<CheckinRow["now"], string | null> = {
  POST_ONBOARD: null,
  ACTIVE: null,
  ARCHIVED: "Archived",
  LEFT: "Left",
  MISSING: "Record deleted"
};
type Filter = "all" | 90 | 180 | 365 | "anytime";

const avg = (xs: (number | null)[]) => {
  const n = xs.filter((x): x is number => x !== null);
  return n.length ? n.reduce((a, b) => a + b, 0) / n.length : null;
};
const f1 = (x: number | null) => (x === null ? "—" : x.toFixed(1));
const day = (iso: string) => formatMomentDate(iso) || "—";

/** One core-value score in the form's own color - also used by the profile's Check-ins tab. */
export function Score({ value, band, label }: { value: number | null; band: string | null; label: string }) {
  // An average of two supervisors can be a half (7.5): it takes its rounded score's color and word.
  const c = value !== null ? scoreColor(value) : null;
  return (
    <div
      title={value !== null ? `${label}: ${value}, ${scoreWord(Math.round(value))}` : band ? `${label}: ${RATING_LABEL[band as RatingKey] ?? band}` : `${label}: not seen yet`}
      className={clsx("rounded px-1 py-1 text-center text-sm font-semibold tabular-nums", !c && "bg-brand-cloudDancer/70 text-brand-grey dark:bg-white/10 dark:text-slate-400")}
      style={c ? { background: c.fill, color: c.text } : undefined}
    >
      <span className={clsx(R.tileLabel, "block sm:hidden", c && "!text-current opacity-80")}>{label}</span>
      {value ?? (band ? (RATING_LABEL[band as RatingKey] ?? band) : "—")}
    </div>
  );
}

function Person({ r }: { r: CheckinRow }) {
  const tag = NOW[r.now];
  return (
    <div className="min-w-0">
      {r.now === "MISSING" ? (
        <span className={R.strong}>{r.name}</span>
      ) : (
        <Link href={`/people/${r.newHireId}`} className={R.link}>
          {r.name}
        </Link>
      )}
      {tag ? <span className={clsx(R.chip, "ml-1.5")}>{tag}</span> : null}
      <span className={clsx("block truncate text-[11px]", R.muted)}>
        {[r.position ?? r.department, r.ratedBy ? `rated by ${r.ratedBy}` : null].filter(Boolean).join(" · ")}
      </span>
    </div>
  );
}

function Row({ r }: { r: CheckinRow }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2.5">
      <div className="grid grid-cols-4 items-center gap-1.5 sm:grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,0.55fr))_minmax(0,0.75fr)_minmax(0,0.55fr)] sm:gap-2">
        <div className="col-span-4 sm:col-span-1">
          <Person r={r} />
        </div>
        {CORE_VALUE_NAMES.map((v, i) => (
          <Score key={v} value={r.scores[i]} band={r.legacyBands?.[i] ?? null} label={SHORT[i]} />
        ))}
        <div className="col-span-2 sm:col-span-1">
          <span className={clsx(R.chip, r.progress === "BEHIND" && "border-red-600/60 text-red-700 dark:border-red-400/50 dark:text-red-300")}>
            {r.progress ? ROLE_PROGRESS_LABEL[r.progress] : "—"}
          </span>
        </div>
        <div className="col-span-2 text-right sm:col-span-1 sm:text-left">
          {r.hireAgain === null ? (
            <span className={R.muted}>—</span>
          ) : (
            <span className={clsx(R.chip, r.hireAgain === false && "border-red-600/60 text-red-700 dark:border-red-400/50 dark:text-red-300")}>
              {r.hireAgain ? "Hire again" : "Not again"}
            </span>
          )}
        </div>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px]">
        <span className={R.muted}>{day(r.ratedOn)}</span>
        {r.note ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className={clsx(R.smallButton, "!py-0.5")}>
            {open ? "Hide note" : "Manager's note"}
          </button>
        ) : null}
      </div>
      {open && r.note ? <p className={clsx(R.note, "whitespace-pre-line")}>{r.note}</p> : null}
    </li>
  );
}

export function CheckinReport({ report }: { report: Report }) {
  const [filter, setFilter] = useState<Filter>("all");
  const rows = useMemo(
    () => (filter === "all" ? report.rows : filter === "anytime" ? report.rows.filter((r) => isAnytime(r.dayMark)) : report.rows.filter((r) => r.dayMark === filter)),
    [report.rows, filter]
  );

  const again = rows.filter((r) => r.hireAgain === true).length;
  const answeredAgain = rows.filter((r) => r.hireAgain !== null).length;
  const allScores = rows.flatMap((r) => r.scores);
  const ahead = rows.filter((r) => r.progress === "AHEAD").length;
  const onTrack = rows.filter((r) => r.progress === "ON_TRACK").length;
  const behind = rows.filter((r) => r.progress === "BEHIND").length;
  const flags = rows.filter((r) => r.followUp.length);
  const scored = allScores.filter((s): s is number => s !== null);

  const byAvg = (a: CheckinRow, b: CheckinRow) => (avg(a.scores) ?? 11) - (avg(b.scores) ?? 11);
  const groups = [
    ...([90, 180, 365] as const).map((m) => ({ key: String(m), title: `${markLabel(m)} check-in`, rows: rows.filter((r) => r.dayMark === m).sort(byAvg) })),
    // One group for every anytime check-in, longest-serving last.
    { key: "anytime", title: "Anytime check-ins", rows: rows.filter((r) => isAnytime(r.dayMark)).sort((a, b) => a.dayMark - b.dayMark) }
  ].filter((g) => g.rows.length);

  const segs: Array<{ id: Filter; label: string }> = [
    { id: "all", label: "All" },
    { id: 90, label: "3-month" },
    { id: 180, label: "6-month" },
    { id: 365, label: "12-month" },
    { id: "anytime", label: "Anytime" }
  ];

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div className="min-w-0">
          <div className={R.eyebrow}>Quality of Hire</div>
          <h2 className={R.title}>Post-hire check-ins</h2>
          <p className={R.lede}>
            Every rating from the 3-, 6- and 12-month check-ins, and any anytime check-in sent after the first year: the hiring manager&apos;s 1 to 10 on each core value, how well the person has learned the role, and whether
            they would hire them again. People who have since been archived or left stay on this list.
          </p>
        </div>
        <div className={R.controls}>
          <div className={R.segmentGroup} role="group" aria-label="Which check-in">
            {segs.map((s) => (
              <button key={String(s.id)} type="button" onClick={() => setFilter(s.id)} aria-pressed={filter === s.id} className={clsx(R.segment, filter === s.id ? R.segmentOn : R.segmentOff)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className={R.note}>No ratings for this check-in yet. They appear here as soon as a hiring manager answers the emailed link, or HR enters one on Post-onboard.</p>
      ) : (
        <>
          <div className={R.hero}>
            <div className={R.heroRow}>
              <span className={R.heroFigure}>
                {again} of {answeredAgain}
              </span>
              <span className={R.heroText}>would be hired again by their manager</span>
            </div>
            <div className={R.heroSub}>
              {answeredAgain - again === 0 ? "Nobody answered No." : `${answeredAgain - again} would not.`} From {rows.length} rating{rows.length === 1 ? "" : "s"} by {new Set(rows.map((r) => r.ratedBy).filter(Boolean)).size} managers.
            </div>
          </div>

          <div className={R.tiles}>
            <div className={R.tile}>
              <div className={R.tileLabel}>Ratings in</div>
              <div className={R.tileValue}>{filter === "all" ? `${report.rows.length} of ${report.sent}` : rows.length}</div>
              <div className={R.tileSub}>{filter === "all" ? "rating links sent, answered" : "ratings for this check-in"}</div>
            </div>
            <div className={R.tile}>
              <div className={R.tileLabel}>Average score</div>
              <div className={R.tileValue}>{f1(avg(allScores))}</div>
              <div className={R.tileSub}>all four values, out of 10</div>
            </div>
            <div className={R.tile}>
              <div className={R.tileLabel}>Ahead in the role</div>
              <div className={R.tileValue}>
                {ahead} of {rows.length}
              </div>
              <div className={R.tileSub}>
                {onTrack} on track, {behind} behind
              </div>
            </div>
            <div className={R.tile}>
              <div className={R.tileLabel}>For HR to talk to</div>
              <div className={R.tileValue}>{flags.length}</div>
              <div className={R.tileSub}>{scored.length ? `lowest single score ${Math.min(...scored)}` : "no scores yet"}</div>
            </div>
          </div>

          <div className={R.box}>
            <div className={R.sectionLabel}>Talk to - {flags.length}</div>
            <p className={R.footnote}>
              The form never asks for a reason, so HR follows up with anyone who scored a value 1 to 3, answered No to hire again, or is Behind in the role.
            </p>
            {flags.length ? (
              <ul className="mt-2 space-y-2">
                {flags.map((r) => {
                  const scoresOnly = r.scores.filter((s): s is number => s !== null);
                  const lowest = scoresOnly.length ? Math.min(...scoresOnly) : null;
                  return (
                    <li key={r.id} className="rounded border border-brand-lea/10 border-l-4 border-l-red-600 bg-white p-3 dark:border-white/10 dark:border-l-red-400 dark:bg-white/5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <Person r={r} />
                        <span className={clsx("text-[11px]", R.muted)}>
                          {isAnytime(r.dayMark) ? `Check-in at ${markLabel(r.dayMark)}` : markLabel(r.dayMark)} · {day(r.ratedOn)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-brand-lea dark:text-slate-200">
                        {r.followUp.join(", ").replace(/^./, (c) => c.toUpperCase())}.
                        {lowest !== null ? ` Lowest score ${lowest} (${SHORT[r.scores.indexOf(lowest)]}).` : ""}
                      </p>
                      {r.note ? <p className={clsx(R.note, "whitespace-pre-line")}>{r.note}</p> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={R.note}>Nobody to follow up with in these ratings.</p>
            )}
          </div>
        </>
      )}

      <div className="grid gap-x-5 lg:grid-cols-2">
        <div className={R.box}>
          <div className={R.sectionLabel}>Where the check-ins stand</div>
          <ul className="mt-3 space-y-3">
            {report.status.map((s) => {
              const total = Math.max(1, s.answered + s.waiting + s.expired + s.dueNoRating);
              return (
                <li key={s.dayMark}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span className={R.listTitle}>{s.label}</span>
                    <span className={clsx("text-[11px]", R.muted)}>
                      {s.answered} rated · {s.waiting} waiting{s.expired ? ` · ${s.expired} expired` : ""} · {s.dueNoRating} due, not done
                    </span>
                  </div>
                  <div className="mt-1 flex h-3 overflow-hidden rounded bg-brand-cloudDancer/70 dark:bg-white/10">
                    <i className="block h-full bg-emerald-600 dark:bg-emerald-400" style={{ width: `${(s.answered / total) * 100}%` }} />
                    <i className="block h-full bg-brand-gold" style={{ width: `${(s.waiting / total) * 100}%` }} />
                    <i className="block h-full bg-brand-grey/50" style={{ width: `${(s.expired / total) * 100}%` }} />
                    <i className="block h-full bg-red-600/60 dark:bg-red-400/60" style={{ width: `${(s.dueNoRating / total) * 100}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className={R.legend}>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-400" />
              Rated
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-gold" />
              Link sent, waiting
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-brand-grey/50" />
              Link expired
            </span>
            <span className="inline-flex items-center gap-1">
              <i className="inline-block h-2.5 w-2.5 rounded-sm bg-red-600/60 dark:bg-red-400/60" />
              Due, not done
            </span>
          </div>
          <p className={R.footnote}>
            Due, not done: people on Post-onboard past the day mark whose check-in is still open. Some of them already have a link waiting, so the bars can overlap.
          </p>
        </div>
        <div className={R.box}>
          <div className={R.sectionLabel}>Rated, by manager</div>
          {report.managers.length ? (
            <ul className="mt-2 grid gap-2 sm:grid-cols-2">
              {report.managers.map((m) => (
                <li key={m.name} className="flex items-baseline justify-between gap-2 rounded border border-brand-lea/10 px-3 py-2 text-sm dark:border-white/10">
                  <span className="min-w-0 truncate text-brand-lea dark:text-slate-100">{m.name}</span>
                  <span className={clsx("tabular-nums", R.muted)}>{m.answered}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className={R.footnote}>No ratings yet.</p>
          )}
        </div>
      </div>

      {groups.length ? (
        <div className={R.box}>
          <div className={R.sectionLabel}>Every rating</div>
          <div className={clsx("mt-2 hidden grid-cols-[minmax(0,1.7fr)_repeat(4,minmax(0,0.55fr))_minmax(0,0.75fr)_minmax(0,0.55fr)] gap-2 sm:grid", R.thead, "bg-transparent dark:bg-transparent")}>
            <div className={R.th}>Person</div>
            {SHORT.map((s) => (
              <div key={s} className={clsx(R.th, "px-0 text-center")}>
                {s}
              </div>
            ))}
            <div className={clsx(R.th, "px-0")}>Role</div>
            <div className={clsx(R.th, "px-0")}>Again</div>
          </div>
          {groups.map((g) => (
            <div key={g.key} className="mt-3">
              <div className={R.listTitle}>
                {g.title} - {g.rows.length}
              </div>
              <ul className={R.tbody}>
                {g.rows.map((r) => (
                  <Row key={r.id} r={r} />
                ))}
              </ul>
            </div>
          ))}
          <div className={R.legend}>
            <span>1 to 3 red: below the bar</span>
            <span>4 to 5 amber: can develop</span>
            <span>6 to 10 green: meets or better</span>
            <span>— not seen yet</span>
          </div>
          <p className={R.footnote}>Lowest average first within each check-in. A name opens the person; a manager&apos;s note is HR-only, like this whole tab.</p>
        </div>
      ) : null}
    </section>
  );
}
