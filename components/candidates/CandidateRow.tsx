"use client";

import { Fragment, memo } from "react";
import Link from "next/link";
import { FileText, Send, StickyNote, ChevronRight, ChevronDown } from "lucide-react";
import type { CandidateListItem } from "@/lib/data/candidates";
import { CANDIDATE_DEPARTMENTS } from "@/lib/candidates/departments";
import { reasonLine } from "@/lib/candidates/buckets";
import type { CandidateStage } from "@/lib/candidates/stages";
import { CandidateApplicationRows } from "@/components/candidates/CandidateApplicationRows";
import { CandidateReasonCell } from "@/components/candidates/CandidateReasonCell";
import { CandidateStageCell } from "@/components/candidates/CandidateStageCell";
import { CandidateTagCell } from "@/components/candidates/CandidateTagCell";

type CandidateRowProps = {
  candidate: CandidateListItem;
  query: string;
  canEdit: boolean;
  isSelected: boolean;
  isOpen: boolean;
  columnCount: number;
  jobColumnIndex: number;
  onToggleSelect: (id: string) => void;
  onToggleExpanded: (id: string) => void;
  /** Wrap matches in the document-snippet preview. */
  highlight: (text: string, query: string) => React.ReactNode;
  /** Colour a stage pill by keyword. */
  stagePill: (stage: string | null) => string;
  initials: (name: string) => string;
  /** The live stage vocabulary, threaded down so the dropdown reflects edits. */
  stageList?: CandidateStage[];
};

/**
 * One candidate row, plus its expanded applications.
 *
 * MEMOISED, and that is the point of the file existing.
 *
 * Every row carries a CandidateStageCell (its own select and client state) and a
 * CandidateTagCell. With all 100 rows inlined in the table, expanding a single
 * row re-rendered all of them — a hundred selects and tag lists rebuilt to show
 * three extra lines, which is what made expanding feel laggy. Split out and
 * wrapped in memo, toggling one row re-renders one row.
 *
 * That only holds while the callbacks and helpers passed in keep stable
 * identities: the parent hands them over from useCallback, so do not inline
 * arrow functions at the call site or this goes straight back to re-rendering
 * everything.
 */
function CandidateRowInner({
  candidate,
  query,
  canEdit,
  isSelected,
  isOpen,
  columnCount,
  jobColumnIndex,
  onToggleSelect,
  onToggleExpanded,
  highlight,
  stagePill,
  initials,
  stageList
}: CandidateRowProps) {
  // applications[0] is the most recent — sorted once in the data layer so this
  // cell and the expanded rows below cannot disagree about which application is
  // being described.
  const lead = candidate.applications[0] ?? null;
  const leadReason = lead ? reasonLine(lead.group, lead.statusText, lead.outcome) : null;
  // Derived from the jobs applied to, never stored. More than one is real —
  // somebody applied across departments — so they are joined rather than one
  // silently winning.
  const departmentLabel = candidate.departments
    .map((key) => CANDIDATE_DEPARTMENTS.find((d) => d.key === key)?.label ?? key)
    .join(" · ");

  const toggle = (id: string) => onToggleSelect(id);
  const toggleExpanded = (id: string) => onToggleExpanded(id);

  return (
    <Fragment>
      <tr
        className={`row-wash align-top ${
          isOpen ? "bg-brand-sweet/20 dark:bg-brand-gold/10" : isSelected ? "bg-brand-sweet/20 dark:bg-brand-gold/10" : ""
        }`}
      >
        <td className="py-4 pl-5 pr-2">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => toggle(candidate.id)}
            aria-label={`Select ${candidate.displayName}`}
            className="h-4 w-4 cursor-pointer rounded border-brand-lea/30 accent-brand-lea dark:border-white/25"
          />
        </td>
        <td className="px-4 py-4">
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
                {/* Why this row is here twice.
                    Search deliberately spans archived and historical records so
                    legacy Jazz candidates stay findable, which means one person
                    can come back as two rows: the record people work, and a
                    tombstone a merge left behind. Without this badge those looked
                    identical, so a resolved duplicate read as an unfixed one —
                    reported after two Matt Smiths kept appearing in search. Only
                    ever set on a row outside the live pool, so the default list
                    never shows it. */}
                {candidate.archivedAs && (
                  <span
                    title={
                      candidate.archivedAs === "MERGED"
                        ? "Merged into another record and kept for history. Not in the live pool."
                        : "Archived. Not in the live pool."
                    }
                    className="shrink-0 rounded border border-brand-lea/15 bg-brand-cloudDancer/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-grey dark:border-white/15 dark:bg-white/10 dark:text-slate-300"
                  >
                    {candidate.archivedAs === "MERGED" ? "merged" : "archived"}
                  </span>
                )}
              </span>
              {/* Department moved OUT of its own column and under
                  the name: it is context for who this is, not a
                  field you scan down, and giving it a column cost
                  the width that names needed to stop truncating.
                  Plain text rather than a chip so it does not
                  compete with the name above it. */}
              {/* "Department | Sub-department", with the sub muted so the
                  department is what you scan and the function is detail. Split
                  on the pipe the label already carries rather than inventing a
                  second field — labels without one simply render as-is. */}
              <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                {departmentLabel ? (
                  departmentLabel.split(" | ").map((part, i) => (
                    <span key={i} className={i > 0 ? "opacity-75" : undefined}>
                      {i > 0 && <span className="opacity-60"> | </span>}
                      {part}
                    </span>
                  ))
                ) : (
                  (candidate.currentTitle ?? "Unassigned")
                )}
              </div>
              {candidate.docMatch && (
                <div className="mt-1.5 max-w-[380px] rounded border border-brand-lea/10 bg-brand-cloudDancer/50 px-2.5 py-1.5 text-[11px] leading-5 text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
                  <span className="font-semibold text-brand-lea dark:text-slate-100">{candidate.docMatch.filename}: </span>
                  {highlight(candidate.docMatch.snippet, query)}
                </div>
              )}
            </div>
          </div>
        </td>
        <td className="px-4 py-4 [overflow-wrap:anywhere]">
          {/* Job title, with the application count pushed to the far right of
              the column so it lands immediately left of the status control.
              It lives HERE rather than in the Status cell because Status is
              hidden below 760px and the expand control must not vanish with it.
              The date is gone: every application carries its own in the rows
              this opens. */}
          {lead ? (
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0 text-[13px] text-brand-lea dark:text-slate-100">
                {lead.jobTitle ?? "No job on record"}
              </span>
              {candidate.applications.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggleExpanded(candidate.id)}
                  aria-expanded={isOpen}
                  aria-label={`${isOpen ? "Hide" : "Show"} all ${candidate.applications.length} applications for ${candidate.displayName}`}
                  title={`${candidate.applications.length} ${candidate.applications.length === 1 ? "application" : "applications"}`}
                  className="inline-flex shrink-0 items-center gap-0.5 rounded border border-brand-lea/15 bg-white py-[3px] pl-0.5 pr-1.5 text-[11px] font-semibold tabular-nums text-brand-grey transition hover:text-brand-lea hover:shadow-glow dark:border-white/15 dark:bg-brand-panel dark:text-slate-400 dark:hover:text-slate-100"
                >
                  {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  {candidate.applications.length}
                </button>
              )}
            </div>
          ) : (
            <span className="text-xs text-brand-grey dark:text-slate-400">No applications</span>
          )}
        </td>
        <td className="px-4 py-4 max-[760px]:hidden">
          {/* The stage is the candidate's own pipeline position and the only
              writable control on this row. It is deliberately NOT merged with
              the Paycom outcome: one dropdown covering both would let a
              recruiter appear to change a Paycom outcome it cannot write. */}
          <CandidateStageCell
            candidateId={candidate.id}
            candidateName={candidate.displayName}
            stage={candidate.stage}
            pillClass={stagePill(candidate.stage)}
            canEdit={canEdit}
            stageList={stageList}
          />
          {/* THE REASON ONLY — no outcome word above it.
              The outcome was a third way of saying what the dropdown already
              says: "Rejected" in the control, "Denied" under it, and the same
              thing again in the expanded row. The reason is the line that
              actually adds something, because "Denied" does not tell you
              whether to look at this person again and "Not Selected - Future
              Consideration" does. Per-application outcomes still show in the
              expanded rows, where they describe different applications rather
              than restating one.
              Editable: this is the raw Paycom wording, and it is what decides
              which reason group the application falls into, so correcting it
              here corrects both. */}
          {lead && leadReason && (
            <div className="mt-1 text-xs text-brand-grey dark:text-slate-400">
              <CandidateReasonCell
                applicationId={lead.id}
                candidateId={candidate.id}
                value={lead.statusText}
                placeholder={leadReason}
                canEdit={canEdit}
                className="text-xs text-brand-grey dark:text-slate-400"
              />
            </div>
          )}
        </td>
        <td className="px-4 py-4 max-[1320px]:hidden">
          {candidate.typeRatings.length > 0 ? (
            <div className="flex flex-wrap gap-[3px]">
              {candidate.typeRatings.map((rating) => (
                <span
                  key={rating}
                  className="inline-flex items-center gap-[3px] rounded border border-brand-lea/15 px-1.5 py-px text-[11px] font-semibold text-brand-grey dark:border-white/15 dark:text-slate-400"
                >
                  {rating}
                </span>
              ))}
            </div>
          ) : (
            <span className="text-xs text-brand-grey dark:text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-4 max-[1020px]:hidden">
          <CandidateTagCell chips={candidate.tagChips} />
        </td>
        <td className="py-4 pl-4 pr-5 max-[1320px]:hidden">
          {/* Two per row, two rows at most, pushed to the right
              edge. Three chips in a single line needed most of the
              column's width and left a gap beside them; stacked
              2-up the column gives that width back to Tags.
              Zeros stay visible at reduced opacity rather than
              disappearing — "no notes" and "notes not loaded" must
              not look the same. */}
          <div className="ml-auto grid w-fit grid-cols-2 justify-items-end gap-[3px] text-[11px] font-semibold tabular-nums">
            <span
              className={`inline-flex items-center gap-[3px] rounded border border-amber-200 bg-amber-50 px-[5px] py-px text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-300 ${candidate.fileCount ? "" : "opacity-45"}`}
              title={`${candidate.fileCount} ${candidate.fileCount === 1 ? "document" : "documents"}`}
            >
              <FileText className="h-[11px] w-[11px]" /> {candidate.fileCount}
            </span>
            <span
              className={`inline-flex items-center gap-[3px] rounded border border-brand-lea/15 bg-brand-cloudDancer/60 px-[5px] py-px text-brand-grey dark:border-white/10 dark:bg-white/5 dark:text-slate-400 ${candidate.noteCount ? "" : "opacity-45"}`}
              title={`${candidate.noteCount} ${candidate.noteCount === 1 ? "note" : "notes"}`}
            >
              <StickyNote className="h-[11px] w-[11px]" /> {candidate.noteCount}
            </span>
            <span
              className={`inline-flex items-center gap-[3px] rounded border border-indigo-200 bg-indigo-50 px-[5px] py-px text-indigo-700 dark:border-indigo-500/30 dark:bg-indigo-500/15 dark:text-indigo-300 ${candidate.applicationCount ? "" : "opacity-45"}`}
              title={`${candidate.applicationCount} ${candidate.applicationCount === 1 ? "application" : "applications"}`}
            >
              <Send className="h-[11px] w-[11px]" /> {candidate.applicationCount}
            </span>
          </div>
        </td>
      </tr>
      {isOpen && (
        <CandidateApplicationRows
          applications={candidate.applications}
          candidateId={candidate.id}
          canEdit={canEdit}
          columnCount={columnCount}
          jobColumnIndex={jobColumnIndex}
        />
      )}
      </Fragment>
  );
}

export const CandidateRow = memo(CandidateRowInner);
