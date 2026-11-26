"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { R } from "@/components/reports/report-ui";
import { formatCalendarDay } from "@/lib/dates/display";
import { CATEGORY_META, CATEGORY_ORDER, DECIDED, type QohCategory } from "@/lib/quality-of-hire/categories";
import type { BaselineNumbers, BaselineRow } from "@/lib/quality-of-hire/baseline";
import type { FrozenBaseline } from "@/lib/quality-of-hire/baseline-store";

// Reports > Hiring > Hire quality baseline - Quality of Hire Milestone 3, due Dec 3 2026:
// "a one-page summary published: the approved definitions applied to 2021-2025 hires,
// giving the starting numbers." Counts only, so it can be printed (Export PDF) and
// handed to leadership. Live until an admin freezes it; frozen, it never moves again.
// Numbers: lib/quality-of-hire/baseline.ts. Built from report-ui.ts like every report.

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "—");
const BAR: Partial<Record<QohCategory, string>> = {
  GOOD: "bg-brand-lea dark:bg-brand-sweet",
  BAD: "bg-brand-gold",
  REGRETTED: "bg-brand-eden"
};

function FreezeControl({ frozen }: { frozen: boolean }) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (action: "freeze" | "unfreeze") => {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/reports/quality-of-hire/baseline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = (await res.json().catch(() => null)) as { message?: string } | null;
    setBusy(false);
    setAsking(false);
    if (!res.ok) setError(data?.message ?? "That did not save.");
    else router.refresh();
  };
  if (!asking) {
    return (
      <div className="flex flex-col items-end gap-1 print:hidden">
        <button type="button" onClick={() => setAsking(true)} className={R.smallButton}>
          {frozen ? "Unfreeze" : "Freeze the baseline"}
        </button>
        {error ? <span className="text-[11px] text-red-600 dark:text-red-300">{error}</span> : null}
      </div>
    );
  }
  return (
    <div className="flex max-w-xs flex-col items-end gap-1.5 text-right print:hidden">
      <span className={R.tileSub}>
        {frozen
          ? "Go back to live numbers? The frozen copy is kept, and you can freeze again."
          : "Keep today's numbers as the baseline? Q1 targets are set against them, and they will not move again."}
      </span>
      <span className="flex gap-1.5">
        <button type="button" disabled={busy} onClick={() => setAsking(false)} className={R.smallButton}>
          Cancel
        </button>
        <button type="button" disabled={busy} onClick={() => send(frozen ? "unfreeze" : "freeze")} className={clsx(R.smallButton, "bg-brand-lea text-white ring-1 ring-brand-gold dark:bg-brand-lea")}>
          {busy ? "Saving…" : frozen ? "Unfreeze" : "Freeze"}
        </button>
      </span>
    </div>
  );
}

function VerdictTable({ rows, first }: { rows: BaselineRow[]; first: string }) {
  return (
    <div className={R.tableWrap}>
      <table className={clsx(R.table, R.stackTable)}>
        <thead className={R.thead}>
          <tr>
            <th className={R.th}>{first}</th>
            <th className={clsx(R.th, "text-right")}>Hires</th>
            <th className={clsx(R.th, "text-right")}>With a verdict</th>
            <th className={clsx(R.th, "text-right")}>Good</th>
            <th className={clsx(R.th, "text-right")}>Bad</th>
            <th className={clsx(R.th, "text-right")}>Regretted loss</th>
            <th className={clsx(R.th, "text-right")}>Too soon</th>
            <th className={clsx(R.th, "text-right")}>Needs a call</th>
          </tr>
        </thead>
        <tbody className={R.tbody}>
          {rows.map((r) => (
            <tr key={r.label} className={R.tr}>
              <td className={clsx(R.td, R.strong)}>{r.label}</td>
              <td data-l="Hires" className={R.num}>
                {r.hires}
              </td>
              <td data-l="With a verdict" className={R.num}>
                {r.decided}
              </td>
              <td data-l="Good" className={R.num}>
                {pct(r.counts.GOOD, r.decided)} <span className={R.muted}>({r.counts.GOOD})</span>
              </td>
              <td data-l="Bad" className={R.num}>
                {pct(r.counts.BAD, r.decided)} <span className={R.muted}>({r.counts.BAD})</span>
              </td>
              <td data-l="Regretted loss" className={R.num}>
                {pct(r.counts.REGRETTED, r.decided)} <span className={R.muted}>({r.counts.REGRETTED})</span>
              </td>
              <td data-l="Too soon" className={clsx(R.num, !r.counts.TOO_SOON && R.muted)}>
                {r.counts.TOO_SOON}
              </td>
              <td data-l="Needs a call" className={clsx(R.num, !r.counts.NEEDS_CALL && R.muted)}>
                {r.counts.NEEDS_CALL}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function QualityBaseline({ live, frozen, canFreeze }: { live: BaselineNumbers; frozen: FrozenBaseline | null; canFreeze: boolean }) {
  const b = frozen?.numbers ?? live;
  const c = b.counts;
  const m = b.measures;
  const maxCount = Math.max(...CATEGORY_ORDER.map((k) => c[k]), 1);
  const liveGood = live.decided ? Math.round((live.counts.GOOD / live.decided) * 100) : 0;
  const frozenGood = b.decided ? Math.round((c.GOOD / b.decided) * 100) : 0;

  return (
    <section className={R.panel}>
      <div className={R.header}>
        <div>
          <p className={R.eyebrow}>Quality of Hire · Milestone 3</p>
          <h2 className={R.title}>
            Hire quality baseline, {b.from}–{b.to}
          </h2>
          <p className={R.lede}>
            The Good Hire Criteria applied to everyone hired {b.from} to {b.to}: the starting numbers Q1 targets are set against. Counts only - no names
            - so this page can be printed and shared.
          </p>
        </div>
        {canFreeze ? (
          <div className={R.controls}>
            <FreezeControl frozen={Boolean(frozen)} />
          </div>
        ) : null}
      </div>

      <div className={R.note}>
        {frozen ? (
          <>
            <span className={R.strong}>Frozen on {formatCalendarDay(frozen.frozenAt.slice(0, 10))}</span>
            {frozen.frozenBy ? ` by ${frozen.frozenBy}` : ""}. These numbers will not move. Live today: {liveGood}% good hires
            {liveGood !== frozenGood ? ` (${liveGood > frozenGood ? "up" : "down"} ${Math.abs(liveGood - frozenGood)} pts)` : ", the same"}
            {live.counts.NEEDS_CALL ? `, ${live.counts.NEEDS_CALL} still waiting for HR's call` : ""}.
          </>
        ) : (
          <>
            <span className={R.strong}>Live numbers, not yet frozen.</span> They move as HR makes calls and check-ins come in.
            {c.NEEDS_CALL ? ` ${c.NEEDS_CALL} ${c.NEEDS_CALL === 1 ? "hire still needs" : "hires still need"} HR's call - make those on Hire quality, then freeze.` : " Every hire has a verdict or is too soon to say, so it is ready to freeze."}
          </>
        )}
      </div>

      <div className={R.hero}>
        <div className={R.heroRow}>
          <span className={R.heroFigure}>{pct(c.GOOD, b.decided)}</span>
          <span className={R.heroText}>
            of the {b.decided} hires with a verdict were good hires
          </span>
        </div>
        <p className={R.heroSub}>
          {b.hires} people hired {b.from}–{b.to}, contractors left out · {c.TOO_SOON} too soon to say · {c.NOT_COUNTED} not counted
          {c.NEEDS_CALL ? ` · ${c.NEEDS_CALL} waiting for HR's call` : ""}
        </p>
      </div>

      <div className={R.tiles}>
        <div className={R.tile}>
          <div className={R.tileLabel}>Bad hires</div>
          <div className={R.tileValue}>{pct(c.BAD, b.decided)}</div>
          <div className={R.tileSub}>{c.BAD} of the hires with a verdict</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Regretted losses</div>
          <div className={R.tileValue}>{pct(c.REGRETTED, b.decided)}</div>
          <div className={R.tileSub}>{c.REGRETTED} left whom we would have kept</div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Left in their first year</div>
          <div className={R.tileValue}>{pct(m.leftYearOne.left, m.leftYearOne.of)}</div>
          <div className={R.tileSub}>
            {m.leftYearOne.left} of {m.leftYearOne.of} hires old enough to tell
          </div>
        </div>
        <div className={R.tile}>
          <div className={R.tileLabel}>Offers turned down</div>
          <div className={R.tileValue}>{pct(m.offers.declined, m.offers.accepted + m.offers.declined)}</div>
          <div className={R.tileSub}>
            {m.offers.declined} of {m.offers.accepted + m.offers.declined}
            {m.offers.firstYear ? `, applied ${m.offers.firstYear}–${b.to}` : ""}
          </div>
        </div>
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>Every hire, by the Good Hire Criteria</div>
        <ul className="mt-2 space-y-2.5">
          {CATEGORY_ORDER.map((k) => {
            const decided = DECIDED.includes(k);
            return (
              <li key={k} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 text-sm max-sm:grid-cols-[minmax(0,1fr)_auto]">
                <span className={R.strong}>{CATEGORY_META[k].label}</span>
                <span className="h-2.5 rounded-sm bg-brand-lea/10 max-sm:order-3 max-sm:col-span-2 dark:bg-white/10">
                  <span className={clsx("block h-full rounded-sm", BAR[k] ?? "bg-brand-sweet dark:bg-brand-sweet/60")} style={{ width: `${Math.max(1, (c[k] / maxCount) * 100)}%` }} />
                </span>
                <span className="text-right tabular-nums">
                  <span className={R.strong}>{c[k]}</span>
                  {decided ? <span className={clsx(R.muted, "ml-1.5")}>{pct(c[k], b.decided)}</span> : null}
                </span>
                <span className={clsx(R.tileSub, "col-span-3 max-sm:order-4 max-sm:col-span-2")}>{CATEGORY_META[k].hint}</span>
              </li>
            );
          })}
        </ul>
        <p className={R.footnote}>Shares are of the {b.decided} hires with a verdict. Too soon, not counted and waiting for a call are counts only.</p>
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>By year hired</div>
        <VerdictTable rows={b.byYear} first="Year" />
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>Pilots and support roles</div>
        <VerdictTable rows={b.byGroup} first="Role at hire" />
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>By department, 10 or more hires</div>
        <VerdictTable rows={b.byDepartment} first="Department" />
        <p className={R.footnote}>The same 13 departments as Turnover; smaller ones are together in the last row.</p>
      </div>

      <div className={R.box}>
        <div className={R.sectionLabel}>The other starting numbers</div>
        <div className={R.tiles}>
          <div className={R.tile}>
            <div className={R.tileLabel}>Left within 90 days</div>
            <div className={R.tileValue}>{pct(m.left90.left, m.left90.of)}</div>
            <div className={R.tileSub}>
              {m.left90.left} of {m.left90.of}
            </div>
          </div>
          <div className={R.tile}>
            <div className={R.tileLabel}>Interviews per hire</div>
            <div className={R.tileValue}>{m.interviews.median ?? "—"}</div>
            <div className={R.tileSub}>
              median where any were found · {m.interviews.withAny} of {m.interviews.searched} searched hires had one
            </div>
          </div>
          <div className={R.tile}>
            <div className={R.tileLabel}>Application to offer</div>
            <div className={R.tileValue}>{m.toOffer.median === null ? "—" : `${m.toOffer.median} days`}</div>
            <div className={R.tileSub}>
              {m.toOffer.of ? `median of ${m.toOffer.of} hires with a real offer date` : "no real offer dates before 2026, so no baseline yet"}
            </div>
          </div>
          <div className={R.tile}>
            <div className={R.tileLabel}>Still here today</div>
            <div className={R.tileValue}>{pct(m.stillHere.here, m.stillHere.of)}</div>
            <div className={R.tileSub}>
              {m.stillHere.here} of {m.stillHere.of}, on {formatCalendarDay(b.computedAt.slice(0, 10))}
            </div>
          </div>
        </div>
      </div>

      <details className="mt-4">
        <summary className={clsx(R.listTitle, "cursor-pointer marker:text-brand-gold")}>How this is counted</summary>
        <p className={R.lede}>
          A hire is one employment period, so a rehire counts again; contractors at hire are left out of everything. Each hire is sorted by the Good Hire
          Criteria HR agreed on Nov 23 2026: from the 12-month check-in where there is one, from how and when they left where there is not, and by HR&apos;s
          own call for anyone let go after their first year. The same rules as Reports &gt; Hire quality, which lists every hire by name. Interviews come
          from the calendar file and from interviews logged in Journey; offers start with applications in mid-2023.
        </p>
      </details>
    </section>
  );
}
