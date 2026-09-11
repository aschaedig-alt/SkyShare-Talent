"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import type { CandidateListApplication } from "@/lib/data/candidates";
import { OUTCOME_LABEL, reasonLine } from "@/lib/candidates/buckets";
import { duplicateOpenTitles, isOpenOutcome } from "@/lib/candidates/reapplied";
import { ApplicationStatusPicker } from "@/components/candidates/ApplicationStatusPicker";
import { ApplicationNote } from "@/components/candidates/ApplicationNote";
import { formatCalendarDay } from "@/lib/dates/display";

/**
 * One candidate's applications, opened to the RIGHT of the list.
 *
 * REPLACES THE INLINE EXPANSION, which he rejected: it was "slow, laggy and
 * took up too much space". It rendered a full sub-table per row — its own
 * header, spacer cells to keep the columns aligned, and a control per
 * application — and several of those mounted at once. The cost was the
 * sub-table, not the number of applications.
 *
 * Chosen from three samples. This one FLOATS OVER the right-hand columns
 * rather than compressing the table or growing the row, so no row moves, no
 * column narrows for people you are not looking at, and opening a second
 * person swaps the contents instead of relaying the page. It is anchored to
 * the table rather than to the row, so it always appears in the same place.
 *
 * WHAT IT SHOWS, per his spec:
 *   - every application, newest first
 *   - open ones on the card surface, with the FULL control: outcome AND the
 *     disposition reason behind it
 *   - closed ones muted, carrying their stored reason and NO buttons. Adding a
 *     reopen there would put an undo beside a knock-out from November 2024 on
 *     every panel he opens.
 *   - a job open more than once is marked and BOTH stay actionable. Paycom
 *     lets the same requisition be submitted twice and nothing merges them, so
 *     collapsing one would leave an application open that nobody can see.
 *
 * NO SCROLLBAR OF ITS OWN. The house rule is one vertical scrollbar per screen;
 * the table's wrapper grows to fit this instead. Nine applications is the most
 * anyone in the list has.
 */
export function CandidateApplicationsPanel({
  candidateId,
  candidateName,
  applications,
  canEdit,
  topOffset = 0,
  onClose
}: {
  candidateId: string;
  candidateName: string;
  applications: CandidateListApplication[];
  canEdit: boolean;
  /** Pixels from the top of the table wrapper, so the panel opens level with the
   *  row that was clicked rather than at the top of the table. */
  topOffset?: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Escape closes it. A panel that covers two columns and can only be dismissed
  // by finding one small button is a trap for anyone on a keyboard.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Move focus in on open so the close button and the pickers are reachable
  // without tabbing back through the whole table.
  useEffect(() => {
    ref.current?.focus();
  }, [candidateId]);

  const dupes = duplicateOpenTitles(applications);
  const openCount = applications.filter((a) => isOpenOutcome(a.outcome)).length;

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-label={`Applications for ${candidateName}`}
      // Three things here were asked for directly on 2026-09-11 and none of them
      // is cosmetic drift, so do not "restore" them:
      //
      //  1. SOLID, not translucent. It was bg-brand-cloudDancer/80 with a
      //     backdrop-blur, and the candidate rows showed through it — "I can kind
      //     of see the stuff behind it". A panel you can read the table through is
      //     hard to read, and on a page full of names it is worse than untidy.
      //  2. LIGHT GREY, not beige. cloudDancer (#f0eee9) is a warm cream and reads
      //     as beige against the cool-mist page; slate-100 sits between white and
      //     the page background in the same cool family.
      //  3. Positioned beside the ROW, via topOffset, not pinned to the top of the
      //     table. Opening someone's applications from row 40 used to scroll-jump
      //     the answer to the top of the page.
      style={{ top: topOffset }}
      className="absolute right-0 z-20 w-[340px] max-w-full border-l-[3px] border-brand-gold bg-slate-100 p-4 shadow-panel outline-none dark:bg-brand-panel max-[900px]:w-full max-[900px]:border-l-0"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-brand-lea dark:text-slate-100">
            {candidateName}
          </div>
          <div className="text-[11px] tabular-nums text-brand-grey dark:text-slate-400">
            {openCount} open &middot; {applications.length - openCount} closed
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={`Close applications for ${candidateName}`}
          className="shrink-0 rounded border border-brand-lea/20 p-1 text-brand-grey transition hover:border-brand-gold hover:text-brand-lea hover:shadow-glow dark:border-white/15 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {applications.length === 0 ? (
        <p className="text-xs text-brand-grey dark:text-slate-400">No applications on file.</p>
      ) : null}

      <div className="flex flex-col gap-[7px]">
        {applications.map((app) => {
          const open = isOpenOutcome(app.outcome);
          const title = app.jobTitle ?? "No job on record";
          const duplicated = open && dupes.has(title.trim().toLowerCase());
          const reason = reasonLine(app.group, app.statusText, app.outcome);

          return (
            <div
              key={app.id}
              className={
                open
                  ? "rounded border border-brand-gold/45 bg-white p-2.5 dark:bg-brand-panel"
                  : // Muted, and that is the whole point: closed applications are
                    // context, not work. Kept legible rather than greyed to the
                    // edge of readable.
                    "rounded border border-brand-lea/12 p-2.5 opacity-[0.82] dark:border-white/10"
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div
                    className={
                      open
                        ? "text-[12.5px] font-semibold leading-snug text-brand-lea dark:text-slate-100"
                        : "text-[12.5px] font-medium leading-snug text-brand-grey dark:text-slate-400"
                    }
                  >
                    {app.jobId ? (
                      <Link
                        href={`/jobs/${app.jobId}`}
                        className="border-b border-brand-sweet hover:text-brand-eden dark:hover:text-brand-edenOnDark"
                      >
                        {title}
                      </Link>
                    ) : (
                      title
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] tabular-nums text-brand-grey dark:text-slate-500">
                    {app.appliedAt ? formatCalendarDay(app.appliedAt) : "No date"}
                    {app.historical ? " · JazzHR" : ""}
                  </div>
                </div>
                <span
                  className={
                    open
                      ? "shrink-0 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                      : "shrink-0 rounded bg-brand-cloudDancer px-2 py-0.5 text-[10px] font-semibold text-brand-grey dark:bg-white/10 dark:text-slate-400"
                  }
                >
                  {open ? "open" : OUTCOME_LABEL[app.outcome]}
                </span>
              </div>

              {duplicated ? (
                <p className="mt-1.5 text-[11px] font-medium text-red-700 dark:text-red-300">
                  Same job open more than once — both still need closing.
                </p>
              ) : null}

              {open ? (
                // The FULL control, his words: the outcome AND the reason behind
                // it. The same component the candidate's own profile uses, so
                // the reason list is scoped by outcome, a failed save puts the
                // old value back, and the write goes through the one endpoint
                // that checks permission and logs the previous wording.
                <ApplicationStatusPicker
                  applicationId={app.id}
                  candidateId={candidateId}
                  value={app.statusText}
                  canEdit={canEdit}
                />
              ) : (
                // NO BUTTONS ON A CLOSED APPLICATION, his call. The reason it
                // was closed, and nothing else.
                <p className="mt-1.5 border-t border-brand-lea/10 pt-1.5 text-[11px] leading-snug text-brand-grey dark:border-white/10 dark:text-slate-400">
                  <span className="font-semibold">Reason: </span>
                  {app.statusText || reason || "Not recorded"}
                </p>
              )}
              {/* The note goes on open AND closed applications. A closed one is
                  precisely where an explanation earns its place — the stored
                  reason is Paycom's wording, not hers. */}
              <ApplicationNote
                applicationId={app.id}
                candidateId={candidateId}
                value={app.statusNote}
                canEdit={canEdit}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
