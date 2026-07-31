"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CandidateTagPill } from "@/components/candidates/CandidateTagPill";
import { HISTORICAL_CHIP_CLASS, type TagChip } from "@/lib/tags/colors";

/**
 * The Tags column for one candidate.
 *
 * Current tags show in colour. Everything carried over from the JazzHR import
 * collapses behind one grey "N historical" chip — those labels describe a
 * process we no longer run, and at full weight they filled the column on every
 * archived record and made the few deliberate tags impossible to pick out.
 * Expanding is per row and local: this is a glance-at-it column, so opening one
 * row should not disturb the rest of the table.
 */
export function CandidateTagCell({ chips }: { chips: TagChip[] }) {
  const [showHistorical, setShowHistorical] = useState(false);

  const current = chips.filter((c) => !c.historical);
  const historical = chips.filter((c) => c.historical);

  if (chips.length === 0) {
    return <span className="text-xs text-brand-grey dark:text-slate-400">No tags</span>;
  }

  return (
    <div className="flex max-w-[240px] flex-wrap items-center gap-1">
      {current.map((tag) => (
        <CandidateTagPill key={tag.label} label={tag.label} color={tag.color} />
      ))}

      {current.length === 0 && !showHistorical ? (
        <span className="text-xs text-brand-grey dark:text-slate-400">No tags</span>
      ) : null}

      {historical.length > 0 ? (
        <>
          <button
            onClick={() => setShowHistorical((v) => !v)}
            className={clsx(
              "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-semibold transition hover:brightness-95",
              HISTORICAL_CHIP_CLASS
            )}
            title={
              showHistorical
                ? "Hide the tags carried over from the JazzHR import"
                : historical.map((h) => h.label).join(", ")
            }
          >
            {showHistorical ? "Hide historical" : `${historical.length} historical`}
          </button>

          {showHistorical
            ? historical.map((tag) => (
                <span
                  key={tag.label}
                  className={clsx(
                    "inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium",
                    HISTORICAL_CHIP_CLASS
                  )}
                >
                  {tag.label}
                </span>
              ))
            : null}
        </>
      ) : null}
    </div>
  );
}
