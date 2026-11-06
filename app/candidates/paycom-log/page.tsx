import Link from "next/link";
import { clsx } from "clsx";
import { requireModulePageAccess } from "@/lib/data/module-access";
import { FAMILIES, OUTCOMES, getPaycomLog, listMonths, type PaycomFamily, type PaycomOutcome } from "@/lib/paycom/email-log";
import { formatMomentDateTime } from "@/lib/dates/display";
import { R } from "@/components/reports/report-ui";

export const dynamic = "force-dynamic";

/**
 * Every Paycom email Aimee's Gmail has received since 2025-01-01 and what the app did
 * with it — filed as notes, an interview recorded, an offer step the sweep ticked, or
 * skipped and why. See lib/paycom/email-log.ts for where the rows come from and what a
 * row is never allowed to hold.
 *
 * Built from components/reports/report-ui.ts like every data page (CLAUDE.md).
 */
export default async function PaycomLogPage({
  searchParams
}: {
  searchParams: Promise<{ month?: string; family?: string; outcome?: string; q?: string }>;
}) {
  const access = await requireModulePageAccess("candidates");
  const params = await searchParams;
  const family = params.family && params.family in FAMILIES ? (params.family as PaycomFamily) : null;
  const outcome = params.outcome && params.outcome in OUTCOMES ? (params.outcome as PaycomOutcome) : null;
  const q = params.q?.trim() || null;
  // Opens on the newest month: the whole log is a few thousand rows, and a search or a
  // family filter is what reaches further back ("all" shows everything).
  const months = await listMonths();
  const monthShown =
    params.month === "all" ? null : params.month && months.includes(params.month) ? params.month : q || family ? null : (months.at(-1) ?? null);
  const view = await getPaycomLog({ viewer: access.viewer, month: monthShown, family, outcome, q });

  function href(next: { month?: string | null; family?: string | null; outcome?: string | null }) {
    const p = new URLSearchParams();
    const m = next.month === undefined ? (params.month ?? null) : next.month;
    const f = next.family === undefined ? family : next.family;
    const o = next.outcome === undefined ? outcome : next.outcome;
    if (m) p.set("month", m);
    if (f) p.set("family", f);
    if (o) p.set("outcome", o);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/candidates/paycom-log${s ? `?${s}` : ""}`;
  }
  const monthLabel = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  const filed = (view.outcomeCounts["note-filed"] ?? 0) + (view.outcomeCounts["interview-recorded"] ?? 0) + (view.outcomeCounts["offer-step"] ?? 0);

  return (
    <div className={R.page}>
      <div className={R.panel}>
        <div className={R.header}>
          <div>
            <p className={R.eyebrow}>Candidates</p>
            <h1 className={R.title}>Paycom email log</h1>
            <p className={R.lede}>
              Every email from Paycom since January 1, 2025, and what happened to it: <span className={R.term}>filed</span> into a
              profile, <span className={R.term}>left to the onboarding sweep</span>, or <span className={R.term}>skipped</span> with
              the reason. Personal Paycom mail is listed by date and kind only.
            </p>
          </div>
          <div className={R.controls}>
            <Link href="/candidates/recent-notes" className={R.smallButton}>
              Recent notes
            </Link>
            <form action="/candidates/paycom-log" className="flex items-center gap-2">
              {params.month ? <input type="hidden" name="month" value={params.month} /> : null}
              <input name="q" defaultValue={q ?? ""} placeholder="Name, Paycom id, requisition" className={R.input} />
            </form>
          </div>
        </div>

        <div className={R.hero}>
          <div className={R.heroRow}>
            <span className={R.heroFigure}>{view.rows.length.toLocaleString()}</span>
            <span className={R.heroText}>
              Paycom emails {monthShown ? `in ${monthLabel(monthShown)}` : "in this view"} · {filed.toLocaleString()} acted on in the app
            </span>
          </div>
          <p className={R.heroSub}>
            {view.total.toLocaleString()} logged in {view.months.length ? `${monthLabel(view.months[0])} – ${monthLabel(view.months.at(-1)!)}` : "no month yet"}
            {view.hiddenForPrivacy ? ` · ${view.hiddenForPrivacy} HR-only or personal rows hidden for your access` : ""}
          </p>
        </div>

        <div className={R.tiles}>
          {(["note-filed", "interview-recorded", "offer-step", "skipped"] as const).map((o) => (
            <Link key={o} href={href({ outcome: outcome === o ? null : o })} className={clsx(R.tile, outcome === o && "ring-1 ring-brand-gold")}>
              <p className={R.tileLabel}>{OUTCOMES[o]}</p>
              <p className={R.tileValue}>{(view.outcomeCounts[o] ?? 0).toLocaleString()}</p>
            </Link>
          ))}
        </div>

        <div className={R.box}>
          <p className={R.sectionLabel}>Month</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Link href={href({ month: "all" })} className={clsx(R.segment, "text-xs font-semibold", !monthShown ? R.segmentOn : R.segmentOff)}>
              All
            </Link>
            {[...view.months].reverse().map((m) => (
              <Link key={m} href={href({ month: m })} className={clsx(R.segment, "text-xs font-semibold", monthShown === m ? R.segmentOn : R.segmentOff)}>
                {monthLabel(m)}
              </Link>
            ))}
          </div>
          <p className={clsx(R.sectionLabel, "mt-3")}>Kind of email</p>
          <div className="mt-2 flex flex-wrap gap-1">
            <Link href={href({ family: null })} className={clsx(R.segment, "text-xs font-semibold", !family ? R.segmentOn : R.segmentOff)}>
              All kinds
            </Link>
            {(Object.keys(FAMILIES) as PaycomFamily[])
              .filter((f) => view.familyCounts[f])
              .map((f) => (
                <Link key={f} href={href({ family: family === f ? null : f })} className={clsx(R.segment, "text-xs font-semibold", family === f ? R.segmentOn : R.segmentOff)}>
                  {FAMILIES[f].label} <span className="opacity-60">({view.familyCounts[f]})</span>
                </Link>
              ))}
          </div>
        </div>

        {view.rows.length === 0 ? (
          <p className={R.note}>Nothing logged{q ? ` matching "${q}"` : ""} in this view.</p>
        ) : (
          <div className={R.tableWrap}>
            <table className={R.table}>
              <thead className={R.thead}>
                <tr>
                  <th className={R.th}>Received</th>
                  <th className={R.th}>Kind</th>
                  <th className={R.th}>About</th>
                  <th className={R.th}>What happened</th>
                  <th className={R.th}>Front</th>
                </tr>
              </thead>
              <tbody className={R.tbody}>
                {view.rows.map((r) => (
                  <tr key={r.id} className={R.tr}>
                    <td className={clsx(R.td, "whitespace-nowrap", R.muted)}>{formatMomentDateTime(r.at)}</td>
                    <td className={R.td}>
                      <span className={R.chip}>{FAMILIES[r.family]?.label ?? r.family}</span>
                      {r.subject && r.family !== "personal" ? <span className={clsx("mt-1 block text-[11px]", R.muted)}>{r.subject}</span> : null}
                    </td>
                    <td className={R.td}>
                      {r.candidateId ? (
                        // A real link: it changes the whole screen.
                        <Link href={`/candidates/${r.candidateId}`} className={R.link}>
                          {r.candidateName ?? r.person ?? "Candidate"}
                        </Link>
                      ) : (
                        <span className={R.strong}>{r.person ?? "—"}</span>
                      )}
                      {r.paycomId || r.requisition ? (
                        <span className={clsx("block text-[11px]", R.muted)}>
                          {[r.paycomId ? `Paycom ${r.paycomId}` : null, r.requisition ? `Req ${r.requisition}` : null].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </td>
                    <td className={R.td}>
                      <span className={R.strong}>{OUTCOMES[r.outcome] ?? r.outcome}</span>
                      {r.hrOnly ? <span className={clsx("ml-2", R.chip)}>HR only</span> : null}
                      {r.reason ? <span className={clsx("block text-[11px]", R.muted)}>{r.reason}</span> : null}
                      {r.interview?.when ? (
                        <span className={clsx("block text-[11px]", R.muted)}>
                          {[r.interview.step, r.interview.when, r.interview.where].filter(Boolean).join(" · ")}
                        </span>
                      ) : null}
                    </td>
                    <td className={clsx(R.td, "whitespace-nowrap text-[11px]", R.muted)}>
                      {r.front ? [r.front.tagged ? `tagged ${r.front.tagged}` : null, r.front.archived ? `archived ${r.front.archived}` : null, r.front.note ?? null].filter(Boolean).join(" · ") || "—" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={R.footnote}>
          Rows are added by the Paycom notes scan each time it runs. Emails are read from Aimee&apos;s Gmail; Front copies are tagged and
          archived only after the note or interview has been saved.
        </p>
      </div>
    </div>
  );
}
