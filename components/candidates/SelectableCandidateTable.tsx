"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Check, BarChart3, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { CandidateListItem } from "@/lib/data/candidates";
import { CANDIDATE_DEPARTMENTS } from "@/lib/candidates/departments";
import { CandidateRow } from "@/components/candidates/CandidateRow";
import type { CandidateStage } from "@/lib/candidates/stages";
import { Button } from "@/components/ui";

/**
 * Column geometry, named once because the expanded application rows have to
 * emit exactly this many cells with the job title under the job column. Two
 * places counting columns independently is how the expanded block came to sit
 * under the wrong headings the first time.
 */
const COLUMN_COUNT = 7;
const JOB_COLUMN_INDEX = 3; // checkbox 1, Candidate 2, Last applied to 3

/** Wrap occurrences of query in <mark> for highlighted snippets. */
function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const parts = text.split(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
  return parts.map((part, i) =>
    part.toLowerCase() === q.toLowerCase() ? (
      <mark key={i} className="rounded-sm bg-brand-gold/40 px-0.5 text-brand-lea dark:text-slate-100">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

/** Color a stage pill by keyword so the pipeline reads at a glance. */
function stagePill(stage: string | null) {
  const s = (stage ?? "").toLowerCase();
  if (!stage) return "border-brand-lea/15 bg-brand-cloudDancer/60 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400";
  if (s.includes("hire") || s.includes("offer")) return "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
  if (s.includes("interview") || s.includes("screen")) return "border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300";
  if (s.includes("reject") || s.includes("declin") || s.includes("withdraw")) return "border-slate-200 dark:border-white/10 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400";
  if (s.includes("new") || s.includes("appl") || s.includes("lead")) return "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/15 text-amber-700 dark:text-amber-300";
  return "border-brand-gold/30 bg-brand-gold/10 text-brand-lea dark:text-slate-100";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * The candidate records table, with hand-picking.
 *
 * The workflow this exists for: search a former employer, select all the hits,
 * untick the few the word matched by accident, save the rest as a named view,
 * send that link to a hiring manager. Selection is deliberately page-local
 * state — it is a shortlist you are assembling right now, not a filter, and it
 * is not meant to survive a reload or follow you across a new search.
 */
export function SelectableCandidateTable({
  candidates,
  query,
  canEdit,
  stageList
}: {
  candidates: CandidateListItem[];
  query: string;
  canEdit: boolean;
  /** The live stage vocabulary, edited at /candidates/manage. */
  stageList?: CandidateStage[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shownIds = useMemo(() => candidates.map((c) => c.id), [candidates]);

  // Sorting by department, which the filter could already narrow to but the
  // table could never order by.
  //
  // CLIENT-SIDE, AND THAT IS A REAL LIMIT: the list arrives capped at 100 rows,
  // so this orders the page you are looking at, not the whole result set. It is
  // the same cap the select-all has. Server-side ordering would need the sort
  // pushed into the query, and department is DERIVED from the jobs applied to
  // rather than stored on the row, so there is no column to ORDER BY yet.
  const [deptSort, setDeptSort] = useState<"none" | "asc" | "desc">("none");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    if (deptSort === "none") return candidates;

    // A candidate can sit in more than one department, which is real — they
    // applied across them. Sort on the alphabetically first of their labels so
    // the ordering is stable rather than dependent on application order.
    const sortLabel = (c: CandidateListItem) =>
      c.departments
        .map((k) => CANDIDATE_DEPARTMENTS.find((d) => d.key === k)?.label)
        .filter((l): l is string => Boolean(l))
        .sort((a, b) => a.localeCompare(b))[0] ?? null;

    return [...candidates].sort((a, b) => {
      const la = sortLabel(a);
      const lb = sortLabel(b);
      // Unassigned sinks to the bottom in BOTH directions. It is the absence of
      // a department, not a value that belongs at one end of the alphabet, and
      // flipping the sort to hunt for it would be the wrong tool anyway — the
      // filter has an Unassigned option.
      if (!la && !lb) return a.displayName.localeCompare(b.displayName);
      if (!la) return 1;
      if (!lb) return -1;
      const cmp = la.localeCompare(lb);
      if (cmp !== 0) return deptSort === "asc" ? cmp : -cmp;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [candidates, deptSort]);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));

  // useCallback is LOAD-BEARING on both of these, not a habit. CandidateRow is
  // memoised so that expanding one row does not re-render the other ninety-nine
  // (each of which owns a select and a tag list). A fresh function identity every
  // render would break that memo and put the lag straight back.
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /**
   * Which rows have their applications open. Page-local on purpose: it is a
   * "let me look at this one" gesture, not a filter, and carrying it in the URL
   * would make a shared link open somebody else's expanded rows.
   */
  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  function toggleAllShown() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShownSelected) shownIds.forEach((id) => next.delete(id));
      else shownIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function saveView() {
    if (selected.size === 0) return;
    if (!name.trim()) {
      setError("Give the view a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/candidate-views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          note: note.trim() || null,
          // Keep the on-screen order, not Set insertion order, so the saved view
          // reads the same way the list did when it was picked.
          candidateIds: shownIds.filter((id) => selected.has(id))
        })
      });
      const body = (await res.json().catch(() => null)) as { view?: { id: string }; message?: string } | null;
      if (!res.ok || !body?.view) {
        setError(body?.message ?? `Could not save the view (${res.status}).`);
        setBusy(false);
        return;
      }
      router.push(`/candidates/views/${body.view.id}`);
    } catch {
      setError("Network error — the view was not saved.");
      setBusy(false);
    }
  }

  return (
    <>
      {/* Selection toolbar. Present only once something is ticked, so the table
          looks exactly as it did before for anyone not using this. */}
      {selected.size > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-brand-gold/40 bg-brand-sweet/15 px-5 py-3 dark:bg-brand-gold/10">
          <span className="text-sm font-semibold text-brand-lea dark:text-slate-100">
            {selected.size} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs font-semibold text-brand-grey underline transition hover:text-brand-lea dark:text-slate-400"
          >
            Clear
          </button>
          <div className="ml-auto flex items-center gap-2">
            {!naming ? (
              <Button onClick={() => setNaming(true)}>
                <BarChart3 className="h-4 w-4" /> Save as view
              </Button>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveView();
                    if (e.key === "Escape") setNaming(false);
                  }}
                  placeholder="View name — e.g. Elevate MRO alumni"
                  className="w-64 rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:ring-2 focus:ring-brand-gold/50 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveView();
                    if (e.key === "Escape") setNaming(false);
                  }}
                  placeholder="Note for the hiring manager (optional)"
                  className="w-72 rounded border border-brand-lea/20 bg-white px-3 py-2 text-sm text-brand-black outline-none transition focus:ring-2 focus:ring-brand-gold/50 dark:border-white/10 dark:bg-brand-panel dark:text-slate-100"
                />
                <Button onClick={() => void saveView()} disabled={busy}>
                  {busy ? "Saving…" : <><Check className="h-4 w-4" /> Save &amp; open</>}
                </Button>
                <Button variant="secondary" onClick={() => { setNaming(false); setError(null); }}>
                  <X className="h-4 w-4" /> Cancel
                </Button>
              </div>
            )}
          </div>
          {error && <p className="w-full text-xs font-semibold text-red-600 dark:text-red-300">{error}</p>}
        </div>
      )}

      {/* No vertical overflow here. The rows are the page's content, so the page
          is what scrolls; this used to be flex-1 inside a fixed 1028px grid slot,
          which put a second scrollbar over the table. The inner wrapper below
          keeps HORIZONTAL scrolling only, for the 1000px-min table on a narrow
          screen — that is a real axis of overflow, not a capped height. */}
      <div>
        {candidates.length > 0 ? (
          <div className="overflow-x-auto">
            {/* No min-width, and no horizontal scroll. The table is FIXED-layout
                on percentage widths, and narrow screens drop the columns that
                matter least rather than squeezing every one until the names
                truncate. A min-w-[1000px] here used to force a sideways
                scrollbar under 1000px, which this layout exists to avoid. */}
            <table className="w-full table-fixed border-collapse text-left text-sm">
              <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.16em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="w-[5%] py-3 pl-5 pr-2">
                    <input
                      type="checkbox"
                      checked={allShownSelected}
                      onChange={toggleAllShown}
                      aria-label={allShownSelected ? "Clear all shown" : "Select all shown"}
                      title={allShownSelected ? "Clear all shown" : "Select all shown"}
                      className="h-4 w-4 cursor-pointer rounded border-brand-lea/30 accent-brand-lea"
                    />
                  </th>
                  <th className="w-[19%] px-4 py-3 font-bold leading-[1.35] [overflow-wrap:anywhere] max-[1320px]:w-[31%] max-[1020px]:w-[38%] max-[760px]:w-[53%]">
                    <button
                      type="button"
                      onClick={() => setDeptSort((s) => (s === "none" ? "asc" : s === "asc" ? "desc" : "none"))}
                      title={
                        deptSort === "none"
                          ? "Sort by department"
                          : deptSort === "asc"
                            ? "Sorted A–Z — click for Z–A"
                            : "Sorted Z–A — click to clear"
                      }
                      className="inline-flex items-center gap-1 font-bold uppercase tracking-[0.16em] transition hover:text-brand-lea dark:hover:text-slate-100"
                    >
                      Candidate
                      {deptSort === "none" ? (
                        <ArrowUpDown className="h-[9px] w-[9px] opacity-40" />
                      ) : deptSort === "asc" ? (
                        <ArrowUp className="h-[9px] w-[9px] text-brand-gold" />
                      ) : (
                        <ArrowDown className="h-[9px] w-[9px] text-brand-gold" />
                      )}
                    </button>
                  </th>
                  {/* Widths are per breakpoint and each set must total 100 with
                      the columns still showing: 5+19+20+16+11+20+9 full,
                      5+31+27+20+17 at 1320 (Types, Activity gone),
                      5+38+33+24 at 1020 (Tags gone), 5+53+42 at 760 (Status
                      gone). A set that does not add up is not a visible bug —
                      table-fixed silently redistributes the remainder — which is
                      exactly why it is written down. */}
                  <th className="w-[20%] px-4 py-3 font-bold leading-[1.35] [overflow-wrap:anywhere] max-[1320px]:w-[27%] max-[1020px]:w-[33%] max-[760px]:w-[42%]">
                    Last applied to
                  </th>
                  <th className="w-[16%] px-4 py-3 font-bold leading-[1.35] [overflow-wrap:anywhere] max-[1320px]:w-[20%] max-[1020px]:w-[24%] max-[760px]:hidden">
                    Status
                  </th>
                  {/* Types and Activity shed first: both are repeated inside the
                      expanded row, so nothing is actually lost at narrow widths. */}
                  <th className="w-[11%] px-4 py-3 font-bold leading-[1.35] max-[1320px]:hidden">Types</th>
                  {/* Tags takes the width freed by narrowing Candidate and
                      Activity — it is the column that most often ran out of room
                      and pushed chips onto a fourth line. */}
                  <th className="w-[20%] px-4 py-3 font-bold leading-[1.35] max-[1320px]:w-[17%] max-[1020px]:hidden">
                    Tags
                  </th>
                  {/* Right-aligned: the counters below sit as a 2-up block against
                      the table's right edge, so the column only needs the width of
                      two chips rather than three in a row. */}
                  <th className="w-[9%] py-3 pl-4 pr-5 text-right font-bold leading-[1.35] max-[1320px]:hidden">
                    Activity
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
                {rows.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    query={query}
                    canEdit={canEdit}
                    isSelected={selected.has(candidate.id)}
                    isOpen={expanded.has(candidate.id)}
                    columnCount={COLUMN_COUNT}
                    jobColumnIndex={JOB_COLUMN_INDEX}
                    onToggleSelect={toggle}
                    onToggleExpanded={toggleExpanded}
                    highlight={highlight}
                    stagePill={stagePill}
                    initials={initials}
                    stageList={stageList}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-4 py-16 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-cloudDancer/70 dark:bg-white/5">
              <Search className="h-5 w-5 text-brand-grey dark:text-slate-400" />
            </div>
            <div className="mt-3 text-base font-semibold text-brand-lea dark:text-slate-100">No candidates found</div>
            <p className="mt-1 text-sm text-brand-grey dark:text-slate-400">
              Seed data will appear here after the local recruiting seed runs, or clear the search.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
