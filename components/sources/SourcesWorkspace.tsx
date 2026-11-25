"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { clsx } from "clsx";
import type { SourceAudit, SourceSpelling, SourceSummary } from "@/lib/data/sources";
import { R } from "@/components/reports/report-ui";

// Reports > Sources. His ask of 2026-09-29: "if someone lists more than one source
// we need to note all of them... we need to be able to audit the list of sources
// incase someone types one wrong for example BizJetJobs.com could be listed as just
// bizjet and its the same place." The first table answers "how do people find us";
// the second is the audit: every spelling that has ever arrived, and the one name
// it counts under. Changing a name here changes no application - only which name
// a spelling counts under - and each change is logged. Data: lib/data/sources.ts.
// Built from components/reports/report-ui.ts, the Reports design spec.

const n = (x: number) => x.toLocaleString("en-US");

async function save(body: unknown): Promise<string | null> {
  const res = await fetch("/api/sources/names", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = (await res.json().catch(() => null)) as { message?: string } | null;
  return data?.message ?? "That did not save.";
}

/**
 * Two places, one component, so the counts cannot drift between them (Nov 24 2026,
 * Reports phase 2):
 *   "report"  - Reports > Hiring > Where hires come from: the figures, read-only.
 *   "cleanup" - Data > Cleanup > Source names: renaming sources and naming
 *               spellings, which is upkeep rather than a report.
 */
export function SourcesWorkspace({ audit, canEdit, mode = "report" }: { audit: SourceAudit; canEdit: boolean; mode?: "report" | "cleanup" }) {
  const [filter, setFilter] = useState("");
  const [onlyName, setOnlyName] = useState<string | null>(null);
  const t = audit.totals;
  const top = audit.sources[0];
  const cleanup = mode === "cleanup";
  // Renaming happens on Cleanup only; the report never shows the inputs.
  const editHere = cleanup && canEdit;

  const spellings = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return audit.spellings.filter(
      (s) =>
        (!onlyName || s.canonical === onlyName) &&
        (!q || s.spellings.some((x) => x.toLowerCase().includes(q)) || (s.canonical ?? "").toLowerCase().includes(q))
    );
  }, [audit.spellings, filter, onlyName]);

  return (
    // Sits inside the Reports library (app/reports/layout.tsx), which supplies the
    // page, the side list and the way back - so no page header of its own.
    <div className="space-y-4">

      <section className={R.panel}>
        <div className={R.header}>
          {cleanup ? (
            <div>
              <p className={R.eyebrow}>Cleanup</p>
              <h2 className={R.title}>Source names</h2>
              <p className={R.lede}>
                Every spelling a source has arrived as, and the one name it counts under on Reports &gt; Where hires come from. Renaming a source, or
                giving a spelling a name, changes no application, and every change is on the Activity log.
              </p>
            </div>
          ) : (
            <div>
              <p className={R.eyebrow}>Hiring</p>
              <h2 className={R.title}>Where applicants and hires came from</h2>
              <p className={R.lede}>
                Paycom records two for each application — where they <span className={R.term}>arrived from</span>, and what they{" "}
                <span className={R.term}>said</span> when asked how they heard about us — and both are kept, on every application a person made. The
                JazzHR years carry one channel per person. Capitals, spaces, &ldquo;www.&rdquo; and &ldquo;.com&rdquo; never make a new source.
              </p>
            </div>
          )}
        </div>

        {cleanup ? (
          <div className={R.note}>
            <span className={R.strong}>{n(t.unmapped)}</span> {t.unmapped === 1 ? "spelling has" : "spellings have"} no name yet
            {t.unmapped ? " - they are listed first below, shaded." : ", so every source counts under one name."}
            {canEdit ? "" : " You can see these, but changing a name needs a recruiter, an admin, or edit rights on Reports."}
          </div>
        ) : null}

        {cleanup ? null : (
        <>
        <div className={R.hero}>
          <div className={R.heroRow}>
            <span className={R.heroFigure}>{n(audit.sources.length)}</span>
            <span className={R.heroText}>
              sources, from {n(audit.spellings.length)} spellings{top ? ` — the most people found us through ${top.name}` : ""}
            </span>
          </div>
          <p className={R.heroSub}>
            {n(t.paycomWithSource)} of the {n(t.paycomApplications)} Paycom applications here carry a source (Feb 2025 on) · {n(t.jazzPeople)} people from the
            JazzHR years
          </p>
        </div>

        <div className={R.tiles}>
          {[
            { label: "Two places on one application", value: n(t.paycomWithBoth), sub: "arrived from one, said another · both kept" },
            { label: "More than one, over time", value: n(t.peopleWithSeveral), sub: "people whose applications name 2+ sources" },
            { label: "Say who referred them", value: n(t.referralNames), sub: "applications with a referral name" },
            { label: "Spellings without a name", value: n(t.unmapped), sub: t.unmapped ? "named on Data > Cleanup" : "every spelling counts under a name" }
          ].map((c) => (
            <div key={c.label} className={R.tile}>
              <div className={R.tileLabel}>{c.label}</div>
              <div className={clsx(R.tileValue, c.label.startsWith("Spellings") && t.unmapped > 0 && "text-amber-600 dark:text-amber-300")}>{c.value}</div>
              <div className={R.tileSub}>{c.sub}</div>
            </div>
          ))}
        </div>
        </>
        )}

        <div className="mt-5">
          <div className={R.sectionLabel}>Sources — a person counts once under each source they named</div>
          <div className={R.tableWrap}>
            <table className={clsx(R.table, editHere ? "min-w-[760px]" : clsx("min-w-[520px]", R.stackTable))}>
              <thead className={R.thead}>
                <tr>
                  <th className={R.th}>Source</th>
                  <th className={clsx(R.th, "text-right")}>People</th>
                  <th className={clsx(R.th, "text-right")} title="Paycom applications naming it, either way">Paycom applications</th>
                  <th className={clsx(R.th, "text-right")} title="An application marked Hired, or an employee record">Hired</th>
                  <th className={clsx(R.th, "text-right")}>Spellings</th>
                  {editHere ? <th className={R.th}>Rename, or fold into another</th> : null}
                </tr>
              </thead>
              <tbody className={R.tbody}>
                {audit.sources.map((s) => (
                  <SourceRow
                    key={s.name}
                    s={s}
                    names={audit.names}
                    canEdit={editHere}
                    selected={onlyName === s.name}
                    onSelect={cleanup ? (name) => setOnlyName(onlyName === name ? null : name) : null}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {cleanup ? (
        <div className="mt-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div className={R.sectionLabel}>Every spelling — as it arrived, and the source it counts as</div>
            <div className="flex items-center gap-2">
              {onlyName ? (
                <button type="button" onClick={() => setOnlyName(null)} className={R.smallButton}>
                  {onlyName} ✕
                </button>
              ) : null}
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Find a spelling or source" aria-label="Find a spelling or source" className={clsx(R.input, "w-56")} />
            </div>
          </div>
          <div className={R.tableWrap}>
            <table className={clsx(R.table, "min-w-[820px]")}>
              <thead className={R.thead}>
                <tr>
                  <th className={R.th}>As it arrived</th>
                  <th className={clsx(R.th, "text-right")} title="Paycom's Traffic Source">Arrived from</th>
                  <th className={clsx(R.th, "text-right")} title="Paycom's Referral Source">Said</th>
                  <th className={clsx(R.th, "text-right")} title="The channel JazzHR recorded, before Paycom">JazzHR</th>
                  <th className={R.th}>Counts as</th>
                  <th className={R.th}>Last set by</th>
                </tr>
              </thead>
              <tbody className={R.tbody}>
                {spellings.map((s) => (
                  // Keyed by the name too, so a fold above re-seeds the row's input
                  // instead of leaving it holding the name it just lost.
                  <SpellingRow key={`${s.key}|${s.canonical ?? ""}`} s={s} canEdit={canEdit} />
                ))}
                {spellings.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={clsx(R.td, R.muted, "text-center")}>
                      No spelling matches.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <datalist id="source-names">
            {audit.names.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </div>
        ) : null}

        <p className={clsx(R.footnote, "mt-5")}>
          Paycom&apos;s two fields come from its applicant Source Report, matched to each application by its Paycom application number; an application
          newer than the last import picks its source up the next time the report is loaded. Hired means an application marked Hired, or an employee
          record. Renaming a source, or giving a spelling a name, changes no application — only the name it counts under — and every change is on the
          Activity log.
          {cleanup ? null : (
            <>
              {" "}
              Source names are kept on{" "}
              <Link href="/cleanup" className={R.link}>
                Data &gt; Cleanup
              </Link>
              .
            </>
          )}
        </p>
      </section>
    </div>
  );
}

function SourceRow({
  s,
  names,
  canEdit,
  selected,
  onSelect
}: {
  s: SourceSummary;
  names: string[];
  canEdit: boolean;
  selected: boolean;
  /** Cleanup only: a source name filters the spelling list below. */
  onSelect: ((name: string) => void) | null;
}) {
  const router = useRouter();
  const [to, setTo] = useState(s.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const folding = names.includes(to.trim()) && to.trim() !== s.name;
  return (
    <tr className={clsx(R.tr, selected && "bg-brand-gold/10")}>
      <td className={R.td}>
        {onSelect ? (
          <button type="button" onClick={() => onSelect(s.name)} aria-pressed={selected} className={clsx(R.link, "underline-offset-2 hover:underline")}>
            {s.name}
          </button>
        ) : (
          <span className={R.strong}>{s.name}</span>
        )}
        {!s.mapped ? <span className={clsx(R.chip, "ml-1.5 border-amber-400/60 text-amber-600 dark:text-amber-300")}>no name yet</span> : null}
      </td>
      <td data-l="People" className={clsx(R.num, "font-semibold text-brand-lea dark:text-slate-100")}>
        {n(s.people)}
      </td>
      <td data-l="Paycom applications" className={R.num}>
        {n(s.applications)}
      </td>
      <td data-l="Hired" className={clsx(R.num, !s.hired && R.muted)}>
        {n(s.hired)}
      </td>
      <td data-l="Spellings" className={R.num}>
        {s.spellings}
      </td>
      {canEdit ? (
        <td className={R.td}>
          <div className="flex items-center gap-1.5">
            <input value={to} onChange={(e) => setTo(e.target.value)} list="source-names" aria-label={`Rename ${s.name}`} className={R.input} />
            <button
              type="button"
              disabled={busy || !to.trim() || to.trim() === s.name}
              onClick={async () => {
                setBusy(true);
                setError(await save({ rename: { from: s.name, to } }));
                setBusy(false);
                router.refresh();
              }}
              className={R.smallButton}
            >
              {folding ? "Fold in" : "Rename"}
            </button>
          </div>
          {error ? <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-300">{error}</p> : null}
        </td>
      ) : null}
    </tr>
  );
}

function SpellingRow({ s, canEdit }: { s: SourceSpelling; canEdit: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(s.canonical ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const changed = name.trim() !== (s.canonical ?? "") && name.trim() !== "";
  const commit = async (value: string) => {
    setBusy(true);
    setError(await save({ spelling: s.spellings[0], name: value }));
    setBusy(false);
    router.refresh();
  };
  return (
    <tr className={clsx(R.tr, "align-top", !s.canonical && "bg-amber-50/70 dark:bg-amber-500/10")}>
      <td className={R.td}>
        <span className="font-semibold text-brand-lea dark:text-slate-100">{s.spellings[0]}</span>
        {s.spellings.length > 1 ? <span className={clsx("block text-[11px]", R.muted)}>also {s.spellings.slice(1).join(", ")}</span> : null}
      </td>
      <td className={clsx(R.num, !s.traffic && R.muted)}>{n(s.traffic)}</td>
      <td className={clsx(R.num, !s.referral && R.muted)}>{n(s.referral)}</td>
      <td className={clsx(R.num, !s.jazz && R.muted)}>{n(s.jazz)}</td>
      <td className={R.td}>
        {canEdit ? (
          <>
            <div className="flex items-center gap-1.5">
              <input value={name} onChange={(e) => setName(e.target.value)} list="source-names" placeholder="Give it a name" aria-label={`Name for ${s.spellings[0]}`} className={R.input} />
              <button type="button" disabled={busy || !changed} onClick={() => commit(name)} className={R.smallButton}>
                Save
              </button>
            </div>
            {!s.canonical && s.suggestion ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setName(s.suggestion as string);
                  void commit(s.suggestion as string);
                }}
                className={clsx("mt-1 text-[11px] font-semibold text-brand-eden underline-offset-2 hover:underline dark:text-slate-300")}
              >
                Use {s.suggestion}?
              </button>
            ) : null}
            {error ? <p className="mt-0.5 text-[11px] text-red-600 dark:text-red-300">{error}</p> : null}
          </>
        ) : (
          <span className={s.canonical ? "font-semibold text-brand-lea dark:text-slate-100" : "italic text-amber-600 dark:text-amber-300"}>{s.canonical ?? "No name yet"}</span>
        )}
      </td>
      <td className={clsx(R.td, "text-[11px]", R.muted)}>
        {s.updatedBy ? (
          <>
            {s.updatedBy === "import-paycom-sources" ? "First pass (import)" : s.updatedBy}
            <span className="block">{s.updatedAt ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Denver" }).format(new Date(s.updatedAt)) : ""}</span>
          </>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
