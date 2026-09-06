"use client";

import Link from "next/link";
import type { CandidateListApplication } from "@/lib/data/candidates";
import { OUTCOME_LABEL, reasonLine } from "@/lib/candidates/buckets";
import { CandidateReasonCell } from "@/components/candidates/CandidateReasonCell";
import { formatMomentDate } from "@/lib/dates/display";

type CandidateApplicationRowsProps = {
  applications: CandidateListApplication[];
  /** Needed to authorise the reason edit against the owning candidate. */
  candidateId: string;
  canEdit: boolean;
  /** How many columns the parent table has, so the header row can span them. */
  columnCount: number;
  /**
   * 1-based index of the column the job title must sit under. The status detail
   * takes the column immediately after it.
   */
  jobColumnIndex: number;
};

/** Band + closing rule, computed once rather than repeated on every cell. */
function cellClass(band: boolean, isLast: boolean) {
  return [
    "align-top px-4 py-3",
    band ? "bg-brand-sweet/[0.34] dark:bg-brand-gold/[0.14]" : "bg-brand-sweet/20 dark:bg-brand-gold/10",
    isLast ? "border-b border-brand-lea/15 pb-4 dark:border-white/15" : ""
  ].join(" ");
}

/**
 * A candidate's applications, rendered as REAL table rows.
 *
 * These used to be a nested grid inside one merged cell, which meant they could
 * never line up with the columns above them — "Pre-screen disqualification" sat
 * under the wrong heading and the block read as unrelated to the row it belonged
 * to. Emitting real <td>s in the same column order is the only thing that keeps
 * job and status under the headings that name them.
 *
 * Consecutive applications are BANDED: three in a row at one tint read as a
 * single block rather than three records.
 */
export function CandidateApplicationRows({
  applications,
  candidateId,
  canEdit,
  columnCount,
  jobColumnIndex
}: CandidateApplicationRowsProps) {
  if (applications.length === 0) {
    return (
      <tr>
        <td
          colSpan={columnCount}
          className="border-t border-brand-lea/15 bg-brand-sweet/20 px-5 py-3 text-xs text-brand-grey dark:border-white/15 dark:bg-brand-gold/10 dark:text-slate-400"
        >
          No applications on file for this person.
        </td>
      </tr>
    );
  }

  // Cells before the job column, counting the date cell that occupies the
  // checkbox column's slot. Status takes jobColumnIndex + 1, and whatever is
  // left over is padded so the row is exactly columnCount cells wide.
  const spacersBeforeJob = Math.max(0, jobColumnIndex - 2);
  const spacersAfterStatus = Math.max(0, columnCount - jobColumnIndex - 1);

  return (
    <>
      <tr>
        <td
          colSpan={columnCount}
          className="border-t border-brand-lea/15 bg-brand-sweet/20 py-2.5 pl-5 pr-4 dark:border-white/15 dark:bg-brand-gold/10"
        >
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand-grey dark:text-slate-400">
            All applications
          </span>
          <span className="float-right text-xs text-brand-grey dark:text-slate-400">
            {applications.length} {applications.length === 1 ? "application" : "applications"}
          </span>
        </td>
      </tr>

      {applications.map((app, index) => {
        const isLast = index === applications.length - 1;
        const band = index % 2 === 1;
        // The first row is the one driving the collapsed row's Status column.
        // Marked with the gold stripe so the two can be SEEN to agree.
        const drivesStatus = index === 0;
        const cls = cellClass(band, isLast);
        const reason = reasonLine(app.group, app.statusText, app.outcome);
        const raw = (app.statusText ?? "").replace(/^xx\s*-\s*/, "").trim();

        return (
          <tr key={app.id}>
            <td className={`${cls} pl-5 pr-2`}>
              <div className="whitespace-nowrap text-xs tabular-nums text-brand-grey dark:text-slate-400">
                {app.appliedAt ? formatMomentDate(app.appliedAt) : "—"}
              </div>
            </td>

            {Array.from({ length: spacersBeforeJob }).map((_, i) => (
              <td key={`lead-${i}`} className={cls} />
            ))}

            <td
              className={cls}
              style={{ boxShadow: drivesStatus ? "inset 3px 0 0 #eaaa00" : undefined }}
            >
              <div className="text-sm font-semibold text-brand-lea dark:text-slate-100">
                {app.jobId ? (
                  <Link
                    href={`/jobs/${app.jobId}`}
                    className="border-b border-brand-sweet hover:text-brand-eden dark:hover:text-brand-edenOnDark"
                  >
                    {app.jobTitle ?? "Untitled job"}
                  </Link>
                ) : (
                  (app.jobTitle ?? "No job on record")
                )}
              </div>
              {app.historical && (
                <div className="mt-0.5 text-xs text-brand-grey dark:text-slate-400">
                  Historical (JazzHR)
                </div>
              )}
            </td>

            <td className={cls}>
              <div className="text-xs font-semibold text-brand-lea dark:text-slate-100">
                {OUTCOME_LABEL[app.outcome]}
              </div>
              {/* The grouped reason, then the raw Paycom text under it: the group
                  is what you scan, the original is what you check when the group
                  looks wrong.
                  The OUTCOME has to be passed here. Paycom's two fields disagree
                  on real rows — status holds the pipeline step ("New") while
                  disposition holds the decision ("HIRED") — and without it this
                  printed the stale step under the decision as "Hired / New". */}
              {/* Editable here as well as on the collapsed row — this is the
                  per-application copy, and an application that is not the most
                  recent can only be corrected from here. */}
              {reason && (
                <div className="mt-0.5">
                  <CandidateReasonCell
                    applicationId={app.id}
                    candidateId={candidateId}
                    value={app.statusText}
                    placeholder={reason}
                    canEdit={canEdit}
                    className="text-xs text-brand-grey dark:text-slate-400"
                  />
                </div>
              )}
              {/* The grouped label under the raw wording, so editing the text
                  shows you which group it now falls into. Only when the two
                  actually differ. */}
              {reason && raw && raw !== reason && (
                <div className="mt-0.5 px-1.5 text-[11px] text-brand-grey/80 dark:text-slate-500">
                  {reason}
                </div>
              )}
            </td>

            {Array.from({ length: spacersAfterStatus }).map((_, i) => (
              <td key={`trail-${i}`} className={cls} />
            ))}
          </tr>
        );
      })}
    </>
  );
}
