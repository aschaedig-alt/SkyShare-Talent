"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Send, StickyNote, Mail, Phone, Search, X, Check, BarChart3, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { CandidateListItem } from "@/lib/data/candidates";
import { CANDIDATE_DEPARTMENTS } from "@/lib/candidates/departments";
import { CandidateStageCell } from "@/components/candidates/CandidateStageCell";
import { CandidateTagCell } from "@/components/candidates/CandidateTagCell";
import { Button } from "@/components/ui";
import { formatMomentDate } from "@/lib/dates/display";

function formatDate(value: string) {
  return formatMomentDate(value);
}

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
  canEdit
}: {
  candidates: CandidateListItem[];
  query: string;
  canEdit: boolean;
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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

      <div className="min-h-0 flex-1 overflow-auto">
        {candidates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
              <thead className="bg-brand-cloudDancer/60 text-[11px] uppercase tracking-[0.16em] text-brand-grey dark:bg-white/5 dark:text-slate-400">
                <tr>
                  <th className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allShownSelected}
                      onChange={toggleAllShown}
                      aria-label={allShownSelected ? "Clear all shown" : "Select all shown"}
                      title={allShownSelected ? "Clear all shown" : "Select all shown"}
                      className="h-4 w-4 cursor-pointer rounded border-brand-lea/30 accent-brand-lea"
                    />
                  </th>
                  <th className="px-5 py-3 font-bold">Candidate</th>
                  <th className="px-4 py-3 font-bold">
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
                      Department
                      {deptSort === "none" ? (
                        <ArrowUpDown className="h-3 w-3 opacity-40" />
                      ) : deptSort === "asc" ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 font-bold">Stage</th>
                  <th className="px-4 py-3 font-bold">Contact</th>
                  <th className="px-4 py-3 font-bold">Tags</th>
                  <th className="px-4 py-3 font-bold">Activity</th>
                  <th className="px-4 py-3 font-bold">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-lea/10 dark:divide-white/10">
                {rows.map((candidate) => {
                  const isSelected = selected.has(candidate.id);
                  return (
                    <tr
                      key={candidate.id}
                      className={`row-wash align-top ${isSelected ? "bg-brand-sweet/20 dark:bg-brand-gold/10" : ""}`}
                    >
                      <td className="px-3 py-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(candidate.id)}
                          aria-label={`Select ${candidate.displayName}`}
                          className="h-4 w-4 cursor-pointer rounded border-brand-lea/30 accent-brand-lea"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex gap-3">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-lea/10 text-xs font-bold text-brand-lea dark:text-slate-100">
                            {initials(candidate.displayName) || "—"}
                          </span>
                          <div className="min-w-0">
                            <span className="inline-flex items-center gap-1.5">
                              <Link href={`/candidates/${candidate.id}`} prefetch={false} className="font-semibold text-brand-lea hover:text-brand-eden dark:text-slate-100">
                                {candidate.displayName}
                              </Link>
                              {candidate.paycomLink && (
                                <a
                                  href={candidate.paycomLink}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open in Paycom"
                                  aria-label={`Open ${candidate.displayName} in Paycom`}
                                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] text-[8px] font-black leading-none text-white transition hover:brightness-110"
                                  style={{ backgroundColor: "#2E9E5B" }}
                                >
                                  P
                                </a>
                              )}
                            </span>
                            <div className="text-xs text-brand-grey dark:text-slate-400">{candidate.currentTitle ?? "No current role"}</div>
                            {candidate.docMatch && (
                              <div className="mt-1.5 max-w-[380px] rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-2.5 py-1.5 text-[11px] leading-5 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                                <span className="font-semibold text-brand-lea dark:text-slate-100">{candidate.docMatch.filename}: </span>
                                {highlight(candidate.docMatch.snippet, query)}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {/* Derived from the jobs they applied to, never stored.
                            More than one chip means they applied across
                            departments, which is real. */}
                        <div className="flex flex-wrap gap-1">
                          {candidate.departments.map((key) => {
                            const dept = CANDIDATE_DEPARTMENTS.find((d) => d.key === key);
                            if (!dept) return null;
                            return (
                              <span
                                key={key}
                                className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold ${dept.chip}`}
                              >
                                {dept.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <CandidateStageCell
                          candidateId={candidate.id}
                          candidateName={candidate.displayName}
                          stage={candidate.stage}
                          pillClass={stagePill(candidate.stage)}
                          canEdit={canEdit}
                        />
                      </td>
                      <td className="px-4 py-4">
                        <div className="space-y-1 text-xs text-brand-grey dark:text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <Mail className="h-3 w-3 shrink-0 text-brand-lea/50" />
                            <span className="min-w-0 truncate">{candidate.primaryEmail ?? "No email"}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3 w-3 shrink-0 text-brand-lea/50" />
                            <span>{candidate.primaryPhone ?? "No phone"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <CandidateTagCell chips={candidate.tagChips} />
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5 text-[11px] font-medium text-brand-grey dark:text-slate-400">
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 dark:bg-amber-500/15 px-1.5 py-0.5 text-amber-700 dark:text-amber-300" title="Files">
                            <FileText className="h-3 w-3" /> {candidate.fileCount}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-brand-cloudDancer/70 px-1.5 py-0.5 text-brand-lea dark:bg-white/5 dark:text-slate-100" title="Notes">
                            <StickyNote className="h-3 w-3" /> {candidate.noteCount}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" title="Applications">
                            <Send className="h-3 w-3" /> {candidate.applicationCount}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs text-brand-grey dark:text-slate-400">{formatDate(candidate.updatedAt)}</td>
                    </tr>
                  );
                })}
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
